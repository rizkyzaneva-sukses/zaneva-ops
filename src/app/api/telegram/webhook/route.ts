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
import { isQuickCommand, renderQuickCommand } from '@/lib/quick-commands'

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

async function sendReply(chatId: string | number, text: string, threadId?: number) {
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

    for (const chunk of chunks) {
        const payload: Record<string, any> = {
            chat_id: chatId,
            text: chunk,
            parse_mode: 'HTML',
        }
        if (threadId) payload.message_thread_id = threadId

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
                    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ chat_id: chatId, text: chunk, ...(threadId ? { message_thread_id: threadId } : {}) }),
                    })
                }
            }
        } catch (err) {
            console.error('[webhook] Gagal kirim reply:', err)
        }
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
            reply = `👋 Halo! Saya <b>Elyasr AI Assistant</b>.\n\nKirim /help untuk lihat daftar perintah, atau tanya langsung dengan bahasa bebas!\n\nContoh: "produk apa yang paling laku minggu ini?"`
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
// Main webhook handler
// ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
    let body: any
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ ok: true })
    }

    // Hanya proses message (bukan callback_query, edited_message, dll)
    const message = body?.message
    if (!message) return NextResponse.json({ ok: true })

    const chatId = message.chat?.id
    const fromId = message.from?.id
    const threadId = message.message_thread_id
    const text = (message.text || '').trim()

    // ─── Whitelist check ───────────────────────
    // Support: owner chat ID, group chat ID, atau keduanya (comma-separated)
    const ownerIds = OWNER_CHAT_ID.split(',').map(s => s.trim()).filter(Boolean)

    if (ownerIds.length === 0) {
        console.error('[webhook] TELEGRAM_OWNER_CHAT_ID belum dikonfigurasi!')
        return NextResponse.json({ ok: true })
    }

    const isOwner = ownerIds.includes(String(fromId)) || ownerIds.includes(String(chatId))

    if (!isOwner) {
        console.log(`[webhook] Pesan dari non-owner diabaikan: fromId=${fromId}, chatId=${chatId}`)
        return NextResponse.json({ ok: true })
    }

    if (!text) return NextResponse.json({ ok: true })

    console.log(`[webhook] Pesan dari owner: "${text.slice(0, 100)}" (from=${fromId}, chat=${chatId})`)

    // ─── Fire-and-forget: respond 200 immediately, process in background ───
    // Ini KRUSIAL agar Telegram tidak timeout dan retry.
    // Di Node.js standalone (Docker), promise yang tidak di-await tetap berjalan.
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
