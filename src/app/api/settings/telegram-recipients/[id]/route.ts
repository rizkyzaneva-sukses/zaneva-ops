import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { sendTelegramTest } from '@/lib/telegram'

async function requireOwner() {
    const s = await getSession()
    return s.isLoggedIn && s.userRole === 'OWNER' ? s : null
}

// Next.js 15: params adalah Promise
type RouteContext = { params: Promise<{ id: string }> }

/** PATCH /api/settings/telegram-recipients/[id] */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
    if (!await requireOwner()) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    const { id } = await ctx.params
    const body = await req.json()
    const data: Record<string, unknown> = {}
    if (body.isActive  !== undefined) data.isActive  = Boolean(body.isActive)
    if (body.name      !== undefined) data.name      = String(body.name).trim()
    if (body.chatId    !== undefined) data.chatId    = String(body.chatId).trim()
    if (body.threadId  !== undefined) data.threadId  = body.threadId?.toString().trim() || null

    const row = await prisma.telegramRecipient.update({ where: { id }, data })
    return NextResponse.json({ success: true, data: row })
}

/** DELETE /api/settings/telegram-recipients/[id] */
export async function DELETE(_: NextRequest, ctx: RouteContext) {
    if (!await requireOwner()) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    const { id } = await ctx.params
    await prisma.telegramRecipient.delete({ where: { id } })
    return NextResponse.json({ success: true })
}

/** POST /api/settings/telegram-recipients/[id]?action=test */
export async function POST(req: NextRequest, ctx: RouteContext) {
    if (!await requireOwner()) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    const { id } = await ctx.params
    const url = new URL(req.url)
    if (url.searchParams.get('action') !== 'test')
        return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 })

    const row = await prisma.telegramRecipient.findUnique({ where: { id } })
    if (!row) return NextResponse.json({ success: false, error: 'Recipient tidak ditemukan' }, { status: 404 })

    const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' })
    try {
        await sendTelegramTest(
            row.chatId,
            `✅ <b>Test Koneksi Elyasr Ops</b>\n\nHalo <b>${row.name}</b>! Koneksi berhasil.\n📅 ${now} WIB\n\n<i>Laporan harian akan dikirim ke sini sesuai jadwal.</i>`,
            row.threadId  // kirim ke topic jika threadId diset
        )
        return NextResponse.json({ success: true, message: `Test terkirim ke ${row.name}` })
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message }, { status: 502 })
    }
}
