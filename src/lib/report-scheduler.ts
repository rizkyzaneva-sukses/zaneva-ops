/**
 * Server-side scheduler for automatic daily Telegram report.
 * Runs every 30 seconds and checks if it's 17:30 WIB.
 * If yes, triggers the cron-telegram endpoint.
 * NOTE: Client-side scheduler (browser) is the primary trigger.
 *       This server-side scheduler is a backup for when browser is closed.
 */

let schedulerStarted = false
// In-memory guard: reset on server restart, but we also cross-check DB
let lastSentDate: string | null = null

function getWIBTime(): { hours: number; minutes: number; dateStr: string } {
    const now = new Date()
    const wibStr = now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })
    const wib = new Date(wibStr)
    const hours = wib.getHours()
    const minutes = wib.getMinutes()
    const y = wib.getFullYear()
    const m = String(wib.getMonth() + 1).padStart(2, '0')
    const d = String(wib.getDate()).padStart(2, '0')
    const dateStr = `${y}-${m}-${d}`
    return { hours, minutes, dateStr }
}

async function alreadySentTodayInDB(dateStr: string): Promise<boolean> {
    try {
        // Lazy import prisma so it's only loaded when needed
        const { prisma } = await import('./prisma')
        const rec = await prisma.appSetting.findUnique({ where: { key: 'last_auto_report_sent' } })
        if (!rec?.value) return false
        // last_auto_report_sent is an ISO timestamp — extract WIB date
        const sent = new Date(rec.value)
        const sentWibStr = sent.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })
        const sentWib = new Date(sentWibStr)
        const sy = sentWib.getFullYear()
        const sm = String(sentWib.getMonth() + 1).padStart(2, '0')
        const sd = String(sentWib.getDate()).padStart(2, '0')
        return `${sy}-${sm}-${sd}` === dateStr
    } catch {
        return false
    }
}

async function triggerReport(): Promise<void> {
    try {
        const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 3000}`
        const cronSecret = process.env.CRON_SECRET || 'elyasr-internal-cron'

        console.log(`[REPORT-SCHEDULER] Triggering daily report at ${new Date().toISOString()}`)

        const res = await fetch(`${baseUrl}/api/report/cron-telegram`, {
            method: 'GET',
            headers: { 'x-internal-cron': cronSecret },
        })

        const json = await res.json()

        if (json.success) {
            console.log(`[REPORT-SCHEDULER] ✅ Report sent successfully for ${json.date}`)
        } else if (json.skipped) {
            console.log(`[REPORT-SCHEDULER] ⏭️ Report skipped: ${json.error}`)
        } else {
            console.error(`[REPORT-SCHEDULER] ❌ Failed: ${json.error}`)
        }
    } catch (err: any) {
        console.error(`[REPORT-SCHEDULER] ❌ Error triggering report:`, err.message)
    }
}

async function checkAndTrigger(): Promise<void> {
    const { hours, minutes, dateStr } = getWIBTime()

    // Window 17:30-17:32 WIB (toleransi 2 menit)
    if (hours !== 17 || minutes < 30 || minutes > 32) return

    // In-memory guard sudah kirim hari ini
    if (lastSentDate === dateStr) return

    // Cross-check DB agar tidak double dengan client-side browser trigger
    const alreadySent = await alreadySentTodayInDB(dateStr)
    if (alreadySent) {
        lastSentDate = dateStr // sinkronkan in-memory
        console.log(`[REPORT-SCHEDULER] ⏭️ Sudah dikirim hari ini (${dateStr}), skip.`)
        return
    }

    lastSentDate = dateStr
    await triggerReport()
}

export function startDailyReportScheduler(): void {
    if (schedulerStarted) {
        console.log('[REPORT-SCHEDULER] Already running, skipping duplicate start')
        return
    }

    schedulerStarted = true
    console.log('[REPORT-SCHEDULER] 🚀 Daily report scheduler started (target: 17:30 WIB)')

    // Check every 30 seconds
    setInterval(() => { checkAndTrigger().catch(console.error) }, 30_000)

    // Check 5 detik setelah startup (handle restart tepat di jam 17:30)
    setTimeout(() => { checkAndTrigger().catch(console.error) }, 5_000)
}
