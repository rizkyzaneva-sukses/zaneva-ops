/**
 * Next.js Instrumentation — jalan sekali saat server Node.js start.
 *
 * Schedules:
 * 1. Daily report — jadwal dari DB (default 17:30 WIB)
 * 2. Weekly report — Senin 08:00 WIB (recap minggu lalu)
 * 3. Monthly report — Tanggal 1 jam 09:00 WIB (recap bulan lalu)
 *
 * Fix:
 * - Guard double-send pakai DB (bukan hanya in-memory) → tahan restart container
 * - Catch-up window 30 menit → kalau container restart setelah jadwal, masih bisa kirim
 */
export async function register() {
    // Hanya jalan di Node.js runtime, skip Edge
    if (process.env.NEXT_RUNTIME === 'edge') return

    try {
        const nodeCron                            = await import('node-cron')
        const { buildDailyReport }                = await import('@/lib/daily-report')
        const { buildWeeklyReport }               = await import('@/lib/weekly-report')
        const { buildMonthlyReport }              = await import('@/lib/monthly-report')
        const { broadcastTelegramReport }         = await import('@/lib/telegram')
        const { prisma }                          = await import('@/lib/prisma')

        const fallbackCron = process.env.DAILY_REPORT_CRON ?? '30 17 * * *' // default 17:30 WIB

        function parseCronPart(value: string | undefined, fallback: number): number {
            const raw = value?.trim()
            if (!raw) return fallback
            const parsed = Number.parseInt(raw, 10)
            return Number.isFinite(parsed) ? parsed : fallback
        }

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
                const minute = parseCronPart(parts[0], 30)
                const hour   = parseCronPart(parts[1], 17)
                return { minute, hour, isActive: sched.isActive }
            } catch {
                const parts  = fallbackCron.split(' ')
                return { minute: parseCronPart(parts[0], 30), hour: parseCronPart(parts[1], 17), isActive: true }
            }
        }

        // Cek apakah laporan sudah terkirim hari ini (dari DB — tahan restart)
        async function isAlreadySent(settingKey: string, todayStr: string): Promise<boolean> {
            try {
                const rec = await prisma.appSetting.findUnique({ where: { key: settingKey } })
                if (!rec?.value) return false
                const lastSentDay = new Date(rec.value).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
                return lastSentDay === todayStr
            } catch {
                return false
            }
        }

        async function markSent(settingKey: string) {
            await prisma.appSetting.upsert({
                where:  { key: settingKey },
                update: { value: new Date().toISOString(), updatedBy: 'system-cron' },
                create: { key: settingKey, value: new Date().toISOString(), updatedBy: 'system-cron' },
            })
        }

        async function markSetting(settingKey: string, value: string) {
            await prisma.appSetting.upsert({
                where:  { key: settingKey },
                update: { value, updatedBy: 'system-cron' },
                create: { key: settingKey, value, updatedBy: 'system-cron' },
            })
        }

        // ─── Daily Report Scheduler ───────────────────────────────────────
        let lastDailySent: string | null = null
        let dailySending = false
        let lastHeartbeatBucket: string | null = null

        nodeCron.schedule('* * * * *', async () => {
            try {
                const { hour, minute, isActive } = await getSchedule()

                const nowJkt = new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })
                const d      = new Date(nowJkt)
                const today  = d.toLocaleDateString('en-CA')
                const currentTotalMin   = d.getHours() * 60 + d.getMinutes()

                const heartbeatBucket = `${today}:${Math.floor(currentTotalMin / 5)}`
                if (lastHeartbeatBucket !== heartbeatBucket) {
                    lastHeartbeatBucket = heartbeatBucket
                    await markSetting('scheduler_heartbeat', new Date().toISOString())
                    await markSetting('scheduler_last_wib', `${today} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`)
                    await markSetting('scheduler_schedule', `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')} WIB`)
                }

                if (!isActive) return

                if (lastDailySent === today) return
                if (dailySending) return

                const scheduledTotalMin = hour * 60 + minute
                const inWindow = currentTotalMin >= scheduledTotalMin && currentTotalMin < scheduledTotalMin + 30
                if (!inWindow) return

                if (await isAlreadySent('last_auto_report_sent', today)) {
                    lastDailySent = today
                    return
                }

                dailySending = true
                console.log(`[daily-report] 🚀 ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')} WIB — kirim laporan harian (jadwal: ${hour}:${String(minute).padStart(2,'0')})...`)

                const report           = await buildDailyReport()
                const { sent, failed } = await broadcastTelegramReport(report)

                console.log(`[daily-report] ✅ Selesai — terkirim: ${sent}, gagal: ${failed}`)

                if (sent > 0) {
                    lastDailySent = today
                    await markSent('last_auto_report_sent')
                } else if (failed > 0) {
                    console.error('[daily-report] ❌ Semua pengiriman gagal. Cek bot token & chat ID.')
                }
            } catch (err) {
                console.error('[daily-report] ❌ Error saat kirim laporan:', err)
            } finally {
                dailySending = false
            }
        }, { timezone: 'Asia/Jakarta' })

        console.log('[daily-report] 🟢 Scheduler aktif — jadwal dari DB, catch-up window 30 menit (default: 17:30 WIB)')

        // ─── Weekly Report Scheduler — Senin 08:00 WIB ───────────────────
        let lastWeeklySent: string | null = null
        let weeklySending = false

        nodeCron.schedule('* * * * *', async () => {
            try {
                const nowJkt = new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })
                const d      = new Date(nowJkt)
                const today  = d.toLocaleDateString('en-CA')

                // Hanya hari Senin (getDay() === 1)
                if (d.getDay() !== 1) return
                if (lastWeeklySent === today) return
                if (weeklySending) return

                // Window: 08:00 – 08:29 WIB
                const scheduledMin = 8 * 60
                const currentMin   = d.getHours() * 60 + d.getMinutes()
                const inWindow = currentMin >= scheduledMin && currentMin < scheduledMin + 30
                if (!inWindow) return

                if (await isAlreadySent('last_weekly_report_sent', today)) {
                    lastWeeklySent = today
                    return
                }

                weeklySending = true
                console.log(`[weekly-report] 🚀 ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')} WIB — kirim laporan mingguan...`)

                const report = await buildWeeklyReport()
                const { sent, failed } = await broadcastTelegramReport(report)
                console.log(`[weekly-report] ✅ Selesai — terkirim: ${sent}, gagal: ${failed}`)
                if (sent > 0) {
                    lastWeeklySent = today
                    await markSent('last_weekly_report_sent')
                }
            } catch (err) {
                console.error('[weekly-report] ❌ Error:', err)
            } finally {
                weeklySending = false
            }
        }, { timezone: 'Asia/Jakarta' })

        console.log('[weekly-report] 🟢 Scheduler aktif — Senin 08:00 WIB, catch-up window 30 menit')

        // ─── Monthly Report Scheduler — Tanggal 1, 09:00 WIB ─────────────
        let lastMonthlySent: string | null = null
        let monthlySending = false

        nodeCron.schedule('* * * * *', async () => {
            try {
                const nowJkt = new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })
                const d      = new Date(nowJkt)
                const today  = d.toLocaleDateString('en-CA')

                // Hanya tanggal 1
                if (d.getDate() !== 1) return
                if (lastMonthlySent === today) return
                if (monthlySending) return

                // Window: 09:00 – 09:29 WIB
                const scheduledMin = 9 * 60
                const currentMin   = d.getHours() * 60 + d.getMinutes()
                const inWindow = currentMin >= scheduledMin && currentMin < scheduledMin + 30
                if (!inWindow) return

                if (await isAlreadySent('last_monthly_report_sent', today)) {
                    lastMonthlySent = today
                    return
                }

                monthlySending = true
                console.log(`[monthly-report] 🚀 ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')} WIB — kirim laporan bulanan...`)

                const report = await buildMonthlyReport()
                const { sent, failed } = await broadcastTelegramReport(report)
                console.log(`[monthly-report] ✅ Selesai — terkirim: ${sent}, gagal: ${failed}`)
                if (sent > 0) {
                    lastMonthlySent = today
                    await markSent('last_monthly_report_sent')
                }
            } catch (err) {
                console.error('[monthly-report] ❌ Error:', err)
            } finally {
                monthlySending = false
            }
        }, { timezone: 'Asia/Jakarta' })

        console.log('[monthly-report] 🟢 Scheduler aktif — Tanggal 1 jam 09:00 WIB, catch-up window 30 menit')

    } catch (err) {
        console.error('[instrumentation] ❌ Gagal start scheduler:', err)
    }
}
