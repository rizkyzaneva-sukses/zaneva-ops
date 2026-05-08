/**
 * Telegram broadcast utility.
 * Baca bot_token & chat_id dari AppSetting (disimpan via UI Owner Room).
 * Fallback ke env var TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID.
 */

import { prisma } from '@/lib/prisma'

async function getSetting(key: string): Promise<string | null> {
    try {
        const r = await prisma.appSetting.findUnique({ where: { key } })
        return r?.value ?? null
    } catch { return null }
}

async function sendToChat(botToken: string, chatId: string, text: string): Promise<void> {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    })
    if (!res.ok) {
        const body = await res.text()
        throw new Error(`Telegram error ${res.status}: ${body}`)
    }
}

/**
 * Kirim laporan ke chat_id yang dikonfigurasi di Owner Room.
 * Baca token & chatId dari DB (AppSetting), fallback ke env var.
 */
export async function broadcastTelegramReport(text: string): Promise<{ sent: number; failed: number }> {
    const botToken = (await getSetting('telegram_bot_token')) || process.env.TELEGRAM_BOT_TOKEN
    const chatId   = (await getSetting('telegram_chat_id'))   || process.env.TELEGRAM_CHAT_ID

    if (!botToken || !chatId) {
        console.error('[telegram] Bot token atau Chat ID belum dikonfigurasi')
        return { sent: 0, failed: 1 }
    }

    try {
        await sendToChat(botToken, chatId, text)
        return { sent: 1, failed: 0 }
    } catch (err) {
        console.error('[telegram] Gagal kirim:', err)
        return { sent: 0, failed: 1 }
    }
}

/**
 * Kirim pesan test ke chatId tertentu (untuk tombol Test Koneksi).
 */
export async function sendTelegramMessage(text: string, botToken: string, chatId: string): Promise<void> {
    await sendToChat(botToken, chatId, text)
}
