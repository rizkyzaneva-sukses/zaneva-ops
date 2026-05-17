import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

export async function POST() {
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  if (session.userRole !== 'OWNER') return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  const settings = await prisma.appSetting.findMany({
    where: { key: { in: ['telegram_bot_token', 'telegram_chat_id'] } }
  })
  const map = Object.fromEntries(settings.map(s => [s.key, s.value]))
  const botToken = map['telegram_bot_token']
  const chatId   = map['telegram_chat_id']

  if (!botToken || !chatId) {
    return NextResponse.json({
      success: false,
      error: 'Bot Token atau Chat ID belum diisi.',
    }, { status: 400 })
  }

  const nowWIB = new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'full',
    timeStyle: 'short',
  })

  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: `✅ <b>Test Koneksi Elyasr Ops</b>\n\nKonfigurasi Telegram kamu berhasil! 🎉\n\n📅 ${nowWIB}\n\n<i>Laporan harian akan dikirim ke chat ini setiap pukul 17:30 WIB.</i>`,
      parse_mode: 'HTML',
    }),
  })
  const result = await res.json()

  if (!result.ok) {
    return NextResponse.json({
      success: false,
      error: `Telegram error: ${result.description}`,
    }, { status: 502 })
  }

  return NextResponse.json({ success: true, message: 'Pesan test berhasil dikirim!' })
}
