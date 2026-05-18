/**
 * POST /api/telegram/webhook
 *
 * Menerima pesan dari Telegram (webhook).
 * Whitelist berdasarkan TELEGRAM_OWNER_CHAT_ID (bisa multi, comma-separated).
 *
 * Hybrid mode:
 * - Command (/top10, /stok, /omzet, /laporan, /help) → langsung query DB
 * - Pesan bebas → Adye AI (Claude Sonnet) dengan tool calling
 *
 * Pattern: Respond 200 immediately, process in background (fire-and-forget).
 * Ini mencegah Telegram timeout & retry yang menyebabkan bot tidak responsif.
 */

import { NextRequest, NextResponse } from 'next/server'
import { processWithAI } from '@/lib/telegram-ai'
import { buildDailyReport } from '@/lib/daily-report'
import { buildWeeklyReport } from '@/lib/weekly-report'
import { buildMonthlyReport } from '@/lib/monthly-report'
import { isQuickCommand, renderQuickCommand, type QuickCommandKey } from '@/lib/quick-commands'
import { getMenuByKey, type InlineKeyboard } from '@/lib/telegram-menu'

// Chat ID yang diizinkan (owner + group IDs, comma-separated)
const OWNER_CHAT_ID = process.env.TELEGRAM_OWNER_CHAT_ID || '565228988'

// ─────────────────────────────────────────────
// Kirim pesan balik ke Telegram
// ─────────────────────────────────────────────
async function getBotToken(): Promise<string | null> {
    try {
        const { prisma } = await import('@/lib/prisma')
        const r = await prisma.appSetting.findUnique({ where: { key: 'telegram_bot_token' } })
        return r?.value || process.env.TELEGRAM_BOT_TOKEN || null
    } catch {
        return process.env.TELEGRAM_BOT_TOKEN || null
    }
}

async function sendReply(
    chatId: string | number,
    text: string,
    threadId?: number,
    keyboard?: InlineKeyboard,
) {
    const token = await getBotToken()
    if (!token) {
        console.error('[webhook] Bot token tidak ditemukan')
        return
    }

    // Telegram max message length = 4096 chars
    const maxLen = 4000
    const chunks: string[] = []
    if (text.length <= maxLen) {
        chunks.push(text)
    } else {
        // Split by newline to avoid breaking mid-word
        let remaining = text
        while (remaining.length > 0) {
            if (remaining.length <= maxLen) {
                chunks.push(remaining)
                break
            }
            let splitIdx = remaining.lastIndexOf('\n', maxLen)
            if (splitIdx < maxLen * 0.5) splitIdx = maxLen // fallback: hard cut
            chunks.push(remaining.slice(0, splitIdx))
            remaining = remaining.slice(splitIdx)
        }
    }

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]
        const isLast = i === chunks.length - 1
        const payload: Record<string, any> = {
            chat_id: chatId,
            text: chunk,
            parse_mode: 'HTML',
        }
        if (threadId) payload.message_thread_id = threadId
        // Keyboard hanya di chunk terakhir (Telegram cuma tampilkan di pesan terakhir)
        if (isLast && keyboard && keyboard.length > 0) {
            payload.reply_markup = { inline_keyboard: keyboard }
        }

        try {
            const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })
            if (!res.ok) {
                const body = await res.text()
                console.error(`[webhook] Telegram sendMessage error ${res.status}:`, body)
                // Jika HTML parse error, coba kirim ulang tanpa parse_mode
                if (res.status === 400 && body.includes("can't parse entities")) {
                    const fallbackPayload: Record<string, any> = {
                        chat_id: chatId,
                        text: chunk,
                        ...(threadId ? { message_thread_id: threadId } : {}),
                    }
                    if (isLast && keyboard && keyboard.length > 0) {
                        fallbackPayload.reply_markup = { inline_keyboard: keyboard }
                    }
                    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(fallbackPayload),
                    })
                }
            }
        } catch (err) {
            console.error('[webhook] Gagal kirim reply:', err)
        }
    }
}

// Acknowledge callback query — menghilangkan loading spinner di tombol
async function answerCallback(callbackQueryId: string, text?: string) {
    const token = await getBotToken()
    if (!token) return
    try {
        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                callback_query_id: callbackQueryId,
                ...(text ? { text } : {}),
            }),
        })
    } catch (err) {
        console.error('[webhook] Gagal answerCallbackQuery:', err)
    }
}

// Edit existing message — untuk navigasi sub-menu agar tidak spam pesan baru
async function editMessage(
    chatId: string | number,
    messageId: number,
    text: string,
    keyboard?: InlineKeyboard,
) {
    const token = await getBotToken()
    if (!token) return
    const payload: Record<string, any> = {
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: 'HTML',
    }
    if (keyboard && keyboard.length > 0) {
        payload.reply_markup = { inline_keyboard: keyboard }
    }
    try {
        const res = await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        })
        if (!res.ok) {
            const body = await res.text()
            // "message is not modified" bukan error fatal
            if (!body.includes('message is not modified')) {
                console.error(`[webhook] editMessageText error ${res.status}:`, body)
            }
        }
    } catch (err) {
        console.error('[webhook] Gagal editMessage:', err)
    }
}

async function sendTyping(chatId: string | number) {
    const token = await getBotToken()
    if (!token) return
    try {
        await fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
        })
    } catch { }
}

// ─────────────────────────────────────────────
// Command handlers (quick responses)
// ─────────────────────────────────────────────
function getHelpText(): string {
    return `🤖 <b>Elyasr AI Assistant</b>

Tip: Kirim /menu untuk navigasi via tombol.

<b>📊 Penjualan & Order:</b>
/top10 — Top 10 produk terlaris (7 hari)
/top10hari — Top 10 produk terlaris hari ini
/omzet — Omzet & profit hari ini
/omzetminggu — Omzet & profit 7 hari
/omzetbulan — Omzet & profit bulan ini
/order — Ringkasan order hari ini
/orderminggu — Ringkasan order 7 hari
/platform — Breakdown per marketplace (7 hari)
/platformhari — Breakdown per marketplace hari ini

<b>📦 Inventory & Fulfillment:</b>
/stok — Produk stok kritis
/stokhabil — Produk stok habis
/deadstock — Produk dead stock (30 hari tanpa penjualan)
/fulfillment — Progress scan & fulfillment hari ini

<b>💰 Keuangan:</b>
/saldo — Ringkasan saldo semua wallet
/pengeluaran — Breakdown pengeluaran bulan ini
/utang — Utang & piutang outstanding
/po — Status purchase order yang belum selesai

<b>👥 Customer & Geo:</b>
/kota — Top 10 kota (7 hari)
/customer — Analisis customer & repeat buyer (30 hari)

<b>📑 Laporan:</b>
/laporan — Laporan harian lengkap
/laporanmingguan — Recap minggu lalu (Senin–Minggu) vs minggu sebelumnya
/laporanbulanan — Recap bulan lalu vs bulan sebelumnya

<b>Atau tanya bebas, contoh:</b>
• "produk apa yang paling laku minggu ini?"
• "berapa omzet bulan ini vs bulan lalu?"
• "saldo wallet sekarang berapa?"
• "barang apa yang dead stock?"
• "kota mana paling banyak order?"`
}

// ─────────────────────────────────────────────
// Background processor (fire-and-forget)
// ─────────────────────────────────────────────
async function processMessage(chatId: number, text: string, threadId?: number) {
    const cmd = text.toLowerCase().split(' ')[0]

    // Kirim typing indicator
    await sendTyping(chatId)

    try {
        let reply = ''

        if (cmd === '/start') {
            const main = getMenuByKey('main')!
            await sendReply(
                chatId,
                `👋 Halo! Saya <b>Elyasr AI Assistant</b>.\n\nPilih menu di bawah, atau tanya bebas dengan bahasa natural.\n\nContoh: "produk apa yang paling laku minggu ini?"`,
                threadId,
                main.keyboard,
            )
            return
        } else if (cmd === '/menu') {
            const main = getMenuByKey('main')!
            await sendReply(chatId, main.text, threadId, main.keyboard)
            return
        } else if (cmd === '/help') {
            reply = getHelpText()
        } else if (cmd === '/laporan') {
            await sendReply(chatId, '⏳ Menyiapkan laporan harian...', threadId)
            const laporan = await buildDailyReport()
            await sendReply(chatId, laporan, threadId)
            return
        } else if (cmd === '/laporanmingguan' || cmd === '/laporanminggu') {
            await sendReply(chatId, '⏳ Menyiapkan laporan mingguan...', threadId)
            const laporan = await buildWeeklyReport()
            await sendReply(chatId, laporan, threadId)
            return
        } else if (cmd === '/laporanbulanan' || cmd === '/laporanbulan') {
            await sendReply(chatId, '⏳ Menyiapkan laporan bulanan...', threadId)
            const laporan = await buildMonthlyReport()
            await sendReply(chatId, laporan, threadId)
            return
        } else if (isQuickCommand(cmd)) {
            // Quick command → render langsung dari SQL, tanpa AI (0 token)
            reply = await renderQuickCommand(cmd)
        } else if (text.startsWith('/')) {
            // Unknown command
            reply = `❓ Perintah tidak dikenal. Kirim /help untuk lihat daftar perintah.`
        } else {
            // Natural language → AI (Adye API)
            reply = await processWithAI(text)
        }

        if (reply) {
            await sendReply(chatId, reply, threadId)
        }
    } catch (err: any) {
        console.error('[webhook] Error processing message:', err)
        await sendReply(chatId, `❌ Terjadi error: ${err.message || 'Unknown error'}. Coba lagi nanti.`, threadId)
    }
}

// ─────────────────────────────────────────────
// Callback query processor — handle inline keyboard taps
// ─────────────────────────────────────────────
async function processCallback(
    chatId: number,
    messageId: number,
    callbackQueryId: string,
    data: string,
    threadId?: number,
) {
    try {
        // Format: "menu:KEY", "cmd:/COMMAND", "report:daily|weekly|monthly"
        if (data.startsWith('menu:')) {
            const key = data.slice(5)
            const payload = getMenuByKey(key)
            if (!payload) {
                await answerCallback(callbackQueryId, 'Menu tidak ditemukan')
                return
            }
            await answerCallback(callbackQueryId)
            // Edit pesan yang sama untuk navigasi (pengalaman lebih bersih)
            await editMessage(chatId, messageId, payload.text, payload.keyboard)
            return
        }

        if (data.startsWith('cmd:')) {
            const cmd = data.slice(4) as QuickCommandKey
            if (!isQuickCommand(cmd)) {
                await answerCallback(callbackQueryId, 'Command tidak dikenal')
                return
            }
            await answerCallback(callbackQueryId, '⏳ Memuat...')
            await sendTyping(chatId)
            const reply = await renderQuickCommand(cmd)
            // Tambahkan tombol "back to menu" di bawah hasil
            await sendReply(chatId, reply, threadId, [[
                { text: '« Kembali ke Menu', callback_data: 'menu:main' },
            ]])
            return
        }

        if (data.startsWith('report:')) {
            const which = data.slice(7)
            await answerCallback(callbackQueryId, '⏳ Menyiapkan laporan...')
            await sendTyping(chatId)
            let report = ''
            if (which === 'daily')        report = await buildDailyReport()
            else if (which === 'weekly')  report = await buildWeeklyReport()
            else if (which === 'monthly') report = await buildMonthlyReport()
            else {
                await sendReply(chatId, 'Jenis laporan tidak dikenal.', threadId)
                return
            }
            await sendReply(chatId, report, threadId, [[
                { text: '« Kembali ke Menu', callback_data: 'menu:main' },
            ]])
            return
        }

        await answerCallback(callbackQueryId, 'Aksi tidak dikenal')
    } catch (err: any) {
        console.error('[webhook] Error processCallback:', err)
        try { await answerCallback(callbackQueryId, '❌ Error') } catch {}
        await sendReply(chatId, `❌ Error: ${err.message || 'Unknown'}`, threadId)
    }
}

// ─────────────────────────────────────────────
// Main webhook handler
// ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
    let body: any
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ ok: true })
    }

    // Whitelist setup (dipakai bersama untuk message & callback_query)
    const ownerIds = OWNER_CHAT_ID.split(',').map(s => s.trim()).filter(Boolean)
    if (ownerIds.length === 0) {
        console.error('[webhook] TELEGRAM_OWNER_CHAT_ID belum dikonfigurasi!')
        return NextResponse.json({ ok: true })
    }

    // ─── Handle callback_query (inline keyboard taps) ──
    const callbackQuery = body?.callback_query
    if (callbackQuery) {
        const cbChatId = callbackQuery.message?.chat?.id
        const cbFromId = callbackQuery.from?.id
        const cbMessageId = callbackQuery.message?.message_id
        const cbThreadId = callbackQuery.message?.message_thread_id
        const cbData = (callbackQuery.data || '').trim()
        const cbQueryId = callbackQuery.id

        const isOwnerCb = ownerIds.includes(String(cbFromId)) || ownerIds.includes(String(cbChatId))
        if (!isOwnerCb) {
            console.log(`[webhook] Callback dari non-owner diabaikan: fromId=${cbFromId}`)
            // Tetap acknowledge agar tidak loading di tombolnya
            await answerCallback(cbQueryId)
            return NextResponse.json({ ok: true })
        }

        if (!cbData || !cbChatId || !cbMessageId) {
            return NextResponse.json({ ok: true })
        }

        console.log(`[webhook] Callback dari owner: "${cbData}" (from=${cbFromId})`)

        // Fire-and-forget agar Telegram tidak timeout
        processCallback(cbChatId, cbMessageId, cbQueryId, cbData, cbThreadId).catch(err => {
            console.error('[webhook] Unhandled error processCallback:', err)
        })
        return NextResponse.json({ ok: true })
    }

    // ─── Handle text message ───────────────────
    const message = body?.message
    if (!message) return NextResponse.json({ ok: true })

    const chatId = message.chat?.id
    const fromId = message.from?.id
    const threadId = message.message_thread_id
    const text = (message.text || '').trim()

    const isOwner = ownerIds.includes(String(fromId)) || ownerIds.includes(String(chatId))

    if (!isOwner) {
        console.log(`[webhook] Pesan dari non-owner diabaikan: fromId=${fromId}, chatId=${chatId}`)
        return NextResponse.json({ ok: true })
    }

    if (!text) return NextResponse.json({ ok: true })

    console.log(`[webhook] Pesan dari owner: "${text.slice(0, 100)}" (from=${fromId}, chat=${chatId})`)

    // ─── Fire-and-forget: respond 200 immediately, process in background ───
    processMessage(chatId, text, threadId).catch(err => {
        console.error('[webhook] Unhandled error in background processing:', err)
    })

    return NextResponse.json({ ok: true })
}

// ─────────────────────────────────────────────
// GET — Health check / diagnostics
// ─────────────────────────────────────────────
export async function GET() {
    const hasToken = !!(await getBotToken())
    const hasAdyeKey = !!process.env.ADYE_API_KEY
    const ownerIds = OWNER_CHAT_ID.split(',').map((s: string) => s.trim()).filter(Boolean)

    return NextResponse.json({
        ok: true,
        status: 'Webhook endpoint active',
        config: {
            botToken: hasToken ? '✅ configured' : '❌ missing',
            adyeApiKey: hasAdyeKey ? '✅ configured' : '❌ missing',
            adyeModel: process.env.ADYE_MODEL || 'claude-sonnet-4-6',
            adyeBaseUrl: process.env.ADYE_BASE_URL || 'https://adye.dev/v1',
            ownerChatIds: ownerIds.length > 0 ? `✅ ${ownerIds.length} ID(s)` : '❌ none',
        },
        timestamp: new Date().toISOString(),
    })
}
