/**
 * Next.js Instrumentation — jalan sekali saat server Node.js start.
 *
 * Menggunakan node-cron (bukan setInterval) agar:
 * 1. Jadwal berbasis cron string yang tepat, tidak drift
 * 2. Schedule dibaca dari DB setiap menit → perubahan lewat UI langsung aktif
 *    tanpa perlu restart server
 * 3. Tidak bergantung browser terbuka
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
                    // Buat default row pertama kali
                    sched = await prisma.reportSchedule.create({
                        data: { cronSchedule: fallbackCron, isActive: true },
                    })
                }
                const parts  = sched.cronSchedule.split(' ')
                const minute = parseInt(parts[0]) || 30
                const hour   = parseInt(parts[1]) || 17
                return { minute, hour, isActive: sched.isActive }
            } catch {
                // DB belum siap / migrasi belum jalan — pakai fallback
                const parts  = fallbackCron.split(' ')
                return { minute: parseInt(parts[0]) || 30, hour: parseInt(parts[1]) || 17, isActive: true }
            }
        }

        let lastSentDate: string | null = null

        // Jalankan setiap menit — schedule dibaca live dari DB tiap tick
        nodeCron.schedule('* * * * *', async () => {
            try {
                const { hour, minute, isActive } = await getSchedule()
                if (!isActive) return

                // Waktu WIB sekarang
                const nowJkt = new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })
                const d      = new Date(nowJkt)
                const today  = d.toLocaleDateString('en-CA')   // YYYY-MM-DD

                // Guard: sudah kirim hari ini?
                if (lastSentDate === today) return

                // Cek apakah waktu sekarang cocok dengan jadwal
                if (d.getHours() !== hour || d.getMinutes() !== minute) return

                // Tandai dulu sebelum async operation (cegah double)
                lastSentDate = today
                console.log(`[daily-report] 🚀 Jam ${hour}:${String(minute).padStart(2,'0')} WIB — memulai kirim laporan...`)

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
            timezone: 'Asia/Jakarta',   // node-cron handle timezone langsung
        })

        console.log('[daily-report] 🟢 Scheduler aktif — schedule dibaca dari DB setiap menit (default: 17:30 WIB)')

    } catch (err) {
        console.error('[daily-report] ❌ Gagal start scheduler:', err)
    }
}
