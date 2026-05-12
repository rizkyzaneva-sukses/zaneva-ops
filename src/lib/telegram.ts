/**
 * Telegram broadcast utility.
 *
 * Prioritas penerima:
 * 1. TelegramRecipient table (multi-recipient, dikelola via UI)
 * 2. Fallback ke AppSetting telegram_chat_id (single, konfigurasi lama)
 * 3. Fallback ke env TELEGRAM_CHAT_ID
 *
 * Bot token: AppSetting telegram_bot_token → env TELEGRAM_BOT_TOKEN
 */

import { prisma } from '@/lib/prisma'

async function getSetting(key: string): Promise<string | null> {
    try {
        const r = await prisma.appSetting.findUnique({ where: { key } })
        return r?.value ?? null
    } catch { return null }
}

async function getBotToken(): Promise<string | null> {
    return (await getSetting('telegram_bot_token')) || process.env.TELEGRAM_BOT_TOKEN || null
}

async function sendToChat(botToken: string, chatId: string, text: string, threadId?: string | null): Promise<void> {
    const payload: Record<string, unknown> = { chat_id: chatId, text, parse_mode: 'HTML' }
    // Support Telegram Group Topics (Supergroup dengan forum/topics aktif)
    if (threadId) payload.message_thread_id = Number(threadId)

    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    })
    if (!res.ok) {
        const body = await res.text()
        throw new Error(`Telegram error ${res.status}: ${body}`)
    }
}

/**
 * Broadcast laporan ke semua recipient aktif.
 * Fallback ke AppSetting / env jika tabel kosong.
 */
export async function broadcastTelegramReport(text: string): Promise<{ sent: number; failed: number }> {
    const botToken = await getBotToken()
    if (!botToken) {
        console.error('[telegram] Bot token belum dikonfigurasi')
        return { sent: 0, failed: 1 }
    }

    // Ambil semua recipient aktif dari tabel
    let recipients: { chatId: string; name: string; threadId?: string | null }[] = []
    try {
        const rows = await prisma.telegramRecipient.findMany({ where: { isActive: true } })
        recipients = rows.map(r => ({ chatId: r.chatId, name: r.name, threadId: r.threadId }))
    } catch { /* tabel belum ada / error DB — gunakan fallback */ }

    // Fallback ke AppSetting / env jika tabel kosong
    if (recipients.length === 0) {
        const fallbackId = (await getSetting('telegram_chat_id')) || process.env.TELEGRAM_CHAT_ID
        if (!fallbackId) {
            console.error('[telegram] Tidak ada recipient aktif dan Chat ID fallback tidak ditemukan')
            return { sent: 0, failed: 1 }
        }
        recipients = [{ chatId: fallbackId, name: 'Default' }]
    }

    let sent = 0, failed = 0
    for (const r of recipients) {
        try {
            await sendToChat(botToken, r.chatId, text, r.threadId)
            const dest = r.threadId ? `${r.chatId}/topic:${r.threadId}` : r.chatId
            sent++
            console.log(`[telegram] ✅ Terkirim ke ${r.name} (${dest})`)
        } catch (err: any) {
            failed++
            console.error(`[telegram] ❌ Gagal kirim ke ${r.name} (${r.chatId}): ${err.message}`)
        }
    }

    return { sent, failed }
}

/**
 * Kirim pesan test ke chatId spesifik (untuk tombol Test per-recipient).
 */
export async function sendTelegramTest(chatId: string, text: string, threadId?: string | null): Promise<void> {
    const botToken = await getBotToken()
    if (!botToken) throw new Error('Bot token belum dikonfigurasi')
    await sendToChat(botToken, chatId, text, threadId)
}
