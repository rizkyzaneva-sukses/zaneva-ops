/**
 * GET /api/telegram/set-webhook?secret=<OWNER_SECRET>
 *
 * Daftarkan webhook URL ke Telegram.
 * Panggil sekali setelah deploy. Butuh env OWNER_SECRET untuk keamanan.
 *
 * Contoh: https://yourdomain.com/api/telegram/set-webhook?secret=rahasia123
 */

import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
    // Proteksi sederhana dengan secret
    const secret = req.nextUrl.searchParams.get('secret')
    const ownerSecret = process.env.OWNER_SECRET || process.env.TELEGRAM_OWNER_CHAT_ID

    if (!secret || secret !== ownerSecret) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Ambil bot token
    let botToken: string | null = null
    try {
        const { prisma } = await import('@/lib/prisma')
        const r = await prisma.appSetting.findUnique({ where: { key: 'telegram_bot_token' } })
        botToken = r?.value || process.env.TELEGRAM_BOT_TOKEN || null
    } catch {
        botToken = process.env.TELEGRAM_BOT_TOKEN || null
    }

    if (!botToken) {
        return NextResponse.json({ success: false, error: 'Bot token tidak ditemukan' }, { status: 400 })
    }

    // Tentukan webhook URL dari request origin
    const origin = req.nextUrl.origin
    const webhookUrl = `${origin}/api/telegram/webhook`

    // Daftarkan ke Telegram
    const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            url: webhookUrl,
            allowed_updates: ['message'],
            drop_pending_updates: true,
        }),
    })

    const data = await res.json()

    if (data.ok) {
        console.log('[set-webhook] Webhook berhasil didaftarkan:', webhookUrl)
        return NextResponse.json({
            success: true,
            webhookUrl,
            telegram: data,
        })
    } else {
        console.error('[set-webhook] Gagal daftarkan webhook:', data)
        return NextResponse.json({
            success: false,
            webhookUrl,
            telegram: data,
        }, { status: 400 })
    }
}
