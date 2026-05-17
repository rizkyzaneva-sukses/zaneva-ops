import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

async function requireOwner() {
    const s = await getSession()
    return s.isLoggedIn && s.userRole === 'OWNER' ? s : null
}

/** GET /api/settings/telegram-recipients — list semua recipient */
export async function GET() {
    if (!await requireOwner()) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    const rows = await prisma.telegramRecipient.findMany({ orderBy: { createdAt: 'asc' } })
    return NextResponse.json({ success: true, data: rows })
}

/** POST /api/settings/telegram-recipients — tambah recipient baru */
export async function POST(req: NextRequest) {
    if (!await requireOwner()) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    const { name, chatId, threadId } = await req.json()

    if (!name?.trim() || !chatId?.trim())
        return NextResponse.json({ success: false, error: 'Name dan Chat ID wajib diisi' }, { status: 400 })

    // Cek duplikat
    const existing = await prisma.telegramRecipient.findUnique({ where: { chatId: chatId.trim() } })
    if (existing)
        return NextResponse.json({ success: false, error: 'Chat ID sudah terdaftar' }, { status: 409 })

    const row = await prisma.telegramRecipient.create({
        data: {
            name: name.trim(),
            chatId: chatId.trim(),
            threadId: threadId?.trim() || null,
        },
    })
    return NextResponse.json({ success: true, data: row }, { status: 201 })
}
