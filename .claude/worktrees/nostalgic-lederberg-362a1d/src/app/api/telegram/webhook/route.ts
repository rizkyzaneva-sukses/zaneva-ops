/**
 * POST /api/telegram/webhook
 *
 * Menerima pesan dari Telegram (webhook).
 * Hanya merespons pesan dari TELEGRAM_OWNER_CHAT_ID (whitelist single owner).
 *
 * Hybrid mode:
 * - Command (/top10, /stok, /omzet, /laporan, /help) → langsung query DB
 * - Pesan bebas → Adye AI (Claude Sonnet) dengan tool calling
 */

import { NextRequest, NextResponse } from 'next/server'
import { processWithAI } from '@/lib/telegram-ai'
import { buildDailyReport } from '@/lib/daily-report'

// Chat ID yang diizinkan (owner saja)
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

    const payload: Record<string, any> = {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
    }
    if (threadId) payload.message_thread_id = threadId

    try {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        })
    } catch (err) {
        console.error('[webhook] Gagal kirim reply:', err)
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
    } catch {}
}

// ─────────────────────────────────────────────
// Command handlers (quick responses)
// ─────────────────────────────────────────────
function getHelpText(): string {
    return `🤖 <b>Elyasr AI Assistant</b>

<b>Command Cepat:</b>
/top10 — Top 10 produk terlaris (7 hari)
/top10hari — Top 10 produk terlaris hari ini
/omzet — Omzet & profit hari ini
/omzetminggu — Omzet & profit 7 hari
/stok — Produk stok kritis
/stokhabil — Produk stok habis
/order — Ringkasan order hari ini
/platform — Breakdown per marketplace (7 hari)
/laporan — Laporan harian lengkap

<b>Atau tanya bebas, contoh:</b>
• "produk apa yang paling laku minggu ini?"
• "berapa omzet bulan ini?"
• "stok apa yang hampir habis?"
• "order kemarin gimana?"
• "platform mana yang paling banyak ordernya?"`
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

    const chatId   = message.chat?.id
    const fromId   = message.from?.id
    const threadId = message.message_thread_id
    const text     = (message.text || '').trim()

    // ─── Whitelist check ───────────────────────
    const ownerIds = OWNER_CHAT_ID.split(',').map(s => s.trim())
    const isOwner  = ownerIds.includes(String(fromId)) || ownerIds.includes(String(chatId))

    if (!isOwner) {
        console.log(`[webhook] Pesan dari non-owner diabaikan: fromId=${fromId}, chatId=${chatId}`)
        return NextResponse.json({ ok: true })
    }

    if (!text) return NextResponse.json({ ok: true })

    console.log(`[webhook] Pesan dari owner: "${text.slice(0, 80)}"`)

    // ─── Command routing ───────────────────────
    const cmd = text.toLowerCase().split(' ')[0]

    // Kirim typing indicator (non-blocking)
    sendTyping(chatId)

    try {
        let reply = ''

        // Quick commands → langsung ke AI dengan prompt yang sudah terdefinisi
        const commandMap: Record<string, string> = {
            '/start':        'Halo! Saya siap membantu.',
            '/help':         getHelpText(),
            '/top10':        'ranking produk terlaris 10 besar minggu ini (7 hari terakhir)',
            '/top10hari':    'ranking produk terlaris 10 besar hari ini',
            '/omzet':        'ringkasan omzet dan profit hari ini',
            '/omzetminggu':  'ringkasan omzet dan profit 7 hari terakhir',
            '/omzetbulan':   'ringkasan omzet dan profit bulan ini',
            '/stok':         'daftar produk yang stok kritis (di bawah ROP), tampilkan maksimal 15',
            '/stokhabil':    'daftar produk yang stok sudah habis (0 atau minus)',
            '/order':        'ringkasan order hari ini',
            '/orderminggu':  'ringkasan order 7 hari terakhir',
            '/platform':     'breakdown penjualan per platform 7 hari terakhir',
            '/platformhari': 'breakdown penjualan per platform hari ini',
        }

        if (cmd === '/start') {
            reply = `👋 Halo! Saya <b>Elyasr AI Assistant</b>.\n\nKirim /help untuk lihat daftar perintah, atau tanya langsung dengan bahasa bebas!\n\nContoh: "produk apa yang paling laku minggu ini?"`
        } else if (cmd === '/help') {
            reply = getHelpText()
        } else if (cmd === '/laporan') {
            reply = '⏳ Menyiapkan laporan harian...'
            await sendReply(chatId, reply, threadId)
            const laporan = await buildDailyReport()
            await sendReply(chatId, laporan, threadId)
            return NextResponse.json({ ok: true })
        } else if (commandMap[cmd]) {
            // Command yang butuh AI + tools
            reply = await processWithAI(commandMap[cmd])
        } else if (text.startsWith('/')) {
            // Unknown command
            reply = `❓ Perintah tidak dikenal. Kirim /help untuk lihat daftar perintah.`
        } else {
            // Natural language → AI
            reply = await processWithAI(text)
        }

        await sendReply(chatId, reply, threadId)
    } catch (err: any) {
        console.error('[webhook] Error:', err)
        await sendReply(chatId, `❌ Terjadi error: ${err.message}. Coba lagi nanti.`, threadId)
    }

    return NextResponse.json({ ok: true })
}
