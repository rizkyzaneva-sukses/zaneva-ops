/**
 * Next.js Instrumentation — jalan sekali saat server Node.js start.
 *
 * Fix:
 * 1. Guard double-send pakai DB (bukan hanya in-memory) → tahan restart container
 * 2. Catch-up window 30 menit → kalau container restart setelah jadwal, masih bisa kirim
 */
export async function register() {
    // Hanya jalan di Node.js runtime, skip Edge
    if (process.env.NEXT_RUNTIME === 'edge') return

    try {
        const nodeCron                            = await import('node-cron')
        const { buildDailyReport }                = await import('@/lib/daily-report')
        const { broadcastTelegramReport }         = await import('@/lib/telegram')
        const { prisma }                          = await import('@/lib/prisma')

        const fallbackCron = process.env.DAILY_REPORT_CRON ?? '30 17 * * *' // default 17:30 WIB

        // Baca schedule dari DB — buat default kalau belum ada
        async function getSchedule(): Promise<{ hour: number; minute: number; isActive: boolean }> {
            try {
                let sched = await prisma.reportSchedule.findFirst()
                if (!sched) {
                    sched = await prisma.reportSchedule.create({
                        data: { cronSchedule: fallbackCron, isActive: true },
                    })
                }
                const parts  = sched.cronSchedule.split(' ')
                const minute = parseInt(parts[0]) || 30
                const hour   = parseInt(parts[1]) || 17
                return { minute, hour, isActive: sched.isActive }
            } catch {
                const parts  = fallbackCron.split(' ')
                return { minute: parseInt(parts[0]) || 30, hour: parseInt(parts[1]) || 17, isActive: true }
            }
        }

        // Cek apakah laporan sudah terkirim hari ini (dari DB — tahan restart)
        async function isAlreadySentToday(todayStr: string): Promise<boolean> {
            try {
                const rec = await prisma.appSetting.findUnique({ where: { key: 'last_auto_report_sent' } })
                if (!rec?.value) return false
                const lastSentDay = new Date(rec.value).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
                return lastSentDay === todayStr
            } catch {
                return false
            }
        }

        // In-memory guard untuk cegah double-send dalam satu proses
        let lastSentDate: string | null = null

        // Jalankan setiap menit
        nodeCron.schedule('* * * * *', async () => {
            try {
                const { hour, minute, isActive } = await getSchedule()
                if (!isActive) return

                // Waktu WIB sekarang
                const nowJkt = new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })
                const d      = new Date(nowJkt)
                const today  = d.toLocaleDateString('en-CA') // YYYY-MM-DD

                // Guard in-memory (cegah double dalam satu proses)
                if (lastSentDate === today) return

                // Cek window waktu: dari jadwal (H:MM) sampai +30 menit catch-up
                // Contoh jadwal 17:30 → window aktif 17:30–17:59
                const scheduledTotalMin = hour * 60 + minute
                const currentTotalMin   = d.getHours() * 60 + d.getMinutes()
                const inWindow = currentTotalMin >= scheduledTotalMin && currentTotalMin < scheduledTotalMin + 30

                if (!inWindow) return

                // Guard DB: cek apakah sudah kirim hari ini (tahan restart container)
                if (await isAlreadySentToday(today)) {
                    lastSentDate = today // sync in-memory juga
                    return
                }

                // Tandai dulu sebelum async (cegah double dari race condition)
                lastSentDate = today
                console.log(`[daily-report] 🚀 ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')} WIB — memulai kirim laporan (jadwal: ${hour}:${String(minute).padStart(2,'0')})...`)

                const report           = await buildDailyReport()
                const { sent, failed } = await broadcastTelegramReport(report)

                console.log(`[daily-report] ✅ Selesai — terkirim: ${sent}, gagal: ${failed}`)

                // Simpan waktu terakhir kirim ke DB
                await prisma.appSetting.upsert({
                    where:  { key: 'last_auto_report_sent' },
                    update: { value: new Date().toISOString(), updatedBy: 'system-cron' },
                    create: { key: 'last_auto_report_sent', value: new Date().toISOString(), updatedBy: 'system-cron' },
                })

                if (failed > 0 && sent === 0) {
                    console.error('[daily-report] ❌ Semua pengiriman gagal. Cek bot token & chat ID.')
                }
            } catch (err) {
                console.error('[daily-report] ❌ Error saat kirim laporan:', err)
            }
        }, {
            timezone: 'Asia/Jakarta',
        })

        console.log('[daily-report] 🟢 Scheduler aktif — jadwal dari DB, catch-up window 30 menit (default: 17:30 WIB)')

    } catch (err) {
        console.error('[daily-report] ❌ Gagal start scheduler:', err)
    }
}
