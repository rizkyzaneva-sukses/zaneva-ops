import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

/**
 * GET /api/report/scheduler-status
 * Cek apakah server-side scheduler berjalan + kapan terakhir kirim laporan.
 * Hanya bisa diakses Owner.
 */
export async function GET() {
    const session = await getSession()
    if (!session.isLoggedIn || session.userRole !== 'OWNER') {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const keys = [
            'scheduler_started_at',
            'scheduler_heartbeat',
            'scheduler_tick_count',
            'last_auto_report_sent',
            'auto_report_enabled',
        ]

        const rows = await prisma.appSetting.findMany({ where: { key: { in: keys } } })
        const data: Record<string, string | null> = Object.fromEntries(keys.map(k => [k, null]))
        for (const r of rows) data[r.key] = r.value

        // Cek apakah heartbeat masih fresh (< 2 jam)
        let schedulerAlive = false
        if (data.scheduler_heartbeat) {
            const diff = Date.now() - new Date(data.scheduler_heartbeat).getTime()
            schedulerAlive = diff < 2 * 60 * 60 * 1000 // 2 jam
        }

        return NextResponse.json({
            success: true,
            scheduler: {
                alive: schedulerAlive,
                startedAt: data.scheduler_started_at,
                lastHeartbeat: data.scheduler_heartbeat,
                tickCount: data.scheduler_tick_count ? Number(data.scheduler_tick_count) : null,
            },
            autoReport: {
                enabled: data.auto_report_enabled !== 'false',
                lastSentAt: data.last_auto_report_sent,
            },
        })
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message }, { status: 500 })
    }
}
