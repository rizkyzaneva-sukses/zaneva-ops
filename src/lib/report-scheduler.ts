/**
 * Server-side scheduler for automatic daily Telegram report.
 * Runs every minute and checks if it's 17:30 WIB.
 * If yes, triggers the cron-telegram endpoint.
 */

let schedulerStarted = false
let lastSentDate: string | null = null

function getWIBTime(): { hours: number; minutes: number; dateStr: string } {
    const now = new Date()
    // Convert to WIB (UTC+7)
    const wibOffset = 7 * 60 // minutes
    const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes()
    const wibMinutes = (utcMinutes + wibOffset) % (24 * 60)
    const hours = Math.floor(wibMinutes / 60)
    const minutes = wibMinutes % 60

    // Get WIB date string
    const wibTime = new Date(now.getTime() + wibOffset * 60 * 1000)
    const y = wibTime.getUTCFullYear()
    const m = String(wibTime.getUTCMonth() + 1).padStart(2, '0')
    const d = String(wibTime.getUTCDate()).padStart(2, '0')
    const dateStr = `${y}-${m}-${d}`

    return { hours, minutes, dateStr }
}

async function triggerReport(): Promise<void> {
    try {
        const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 3000}`
        const cronSecret = process.env.CRON_SECRET || 'elyasr-internal-cron'

        console.log(`[REPORT-SCHEDULER] Triggering daily report at ${new Date().toISOString()}`)

        const res = await fetch(`${baseUrl}/api/report/cron-telegram`, {
            method: 'GET',
            headers: {
                'x-internal-cron': cronSecret,
            },
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

function checkAndTrigger(): void {
    const { hours, minutes, dateStr } = getWIBTime()

    // Trigger at 17:30 WIB (check window: 17:30-17:31 to avoid missing)
    if (hours === 17 && minutes === 30) {
        // Only send once per day
        if (lastSentDate !== dateStr) {
            lastSentDate = dateStr
            triggerReport()
        }
    }
}

export function startDailyReportScheduler(): void {
    if (schedulerStarted) {
        console.log('[REPORT-SCHEDULER] Already running, skipping duplicate start')
        return
    }

    schedulerStarted = true
    console.log('[REPORT-SCHEDULER] 🚀 Daily report scheduler started (target: 17:30 WIB)')

    // Check every 30 seconds to ensure we don't miss the window
    setInterval(checkAndTrigger, 30_000)

    // Also check immediately on startup (in case server restarts at 17:30)
    setTimeout(checkAndTrigger, 5_000)
}
