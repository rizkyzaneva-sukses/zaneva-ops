import { NextRequest, NextResponse } from 'next/server'
import { buildDailyReport } from '@/lib/daily-report'
import { broadcastTelegramReport } from '@/lib/telegram'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

/**
 * GET /api/report/cron-telegram
 *
 * Trigger laporan harian ke Telegram.
 * Auth: x-internal-cron header (dari instrumentation scheduler)
 *       ATAU sesi Owner yang login (dari tombol UI)
 *       ATAU Authorization: Bearer <REPORT_API_KEY> (external cron service)
 */
export async function GET(request: NextRequest) {
    // ── Auth ─────────────────────────────────────────────────────────────────
    const cronSecret   = process.env.CRON_SECRET || 'elyasr-internal-cron'
    const internalHdr  = request.headers.get('x-internal-cron')
    const authHdr      = request.headers.get('authorization')
    const apiKey       = process.env.REPORT_API_KEY
    const token        = authHdr?.replace('Bearer ', '').trim()

    const isInternal   = internalHdr === cronSecret
    const isApiKey     = !!(apiKey && token === apiKey)

    // Cek session untuk akses dari UI (Owner)
    let isOwner = false
    if (!isInternal && !isApiKey) {
        try {
            const session = await getSession()
            isOwner = session.isLoggedIn && session.userRole === 'OWNER'
        } catch { /* session error — tidak apa-apa */ }
    }

    if (!isInternal && !isApiKey && !isOwner) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // ── Cek auto_report_enabled (hanya untuk internal/external cron, bukan manual) ──
    if (isInternal || isApiKey) {
        try {
            const setting = await prisma.appSetting.findUnique({ where: { key: 'auto_report_enabled' } })
            if (setting?.value === 'false') {
                return NextResponse.json({ success: false, error: 'Auto report dinonaktifkan', skipped: true })
            }
        } catch { /* lanjut */ }
    }

    // ── Build & kirim laporan ─────────────────────────────────────────────────
    try {
        const report           = await buildDailyReport()
        const { sent, failed } = await broadcastTelegramReport(report)

        if (sent === 0) {
            return NextResponse.json({
                success: false,
                error: failed > 0
                    ? 'Gagal kirim ke Telegram. Cek bot token & chat ID.'
                    : 'Tidak ada recipient aktif.',
            }, { status: 502 })
        }

        // Catat waktu terakhir kirim
        await prisma.appSetting.upsert({
            where:  { key: 'last_auto_report_sent' },
            update: { value: new Date().toISOString(), updatedBy: 'system-cron' },
            create: { key: 'last_auto_report_sent', value: new Date().toISOString(), updatedBy: 'system-cron' },
        })

        return NextResponse.json({
            success: true,
            message: `Laporan berhasil dikirim (sent: ${sent}, failed: ${failed})`,
            sentAt:  new Date().toISOString(),
        })
    } catch (err: any) {
        console.error('[cron-telegram] Error:', err)
        return NextResponse.json({ success: false, error: err.message || 'Unknown error' }, { status: 500 })
    }
}
