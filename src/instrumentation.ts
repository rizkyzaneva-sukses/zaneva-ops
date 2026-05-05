/**
 * Next.js Instrumentation - runs once on server startup.
 * Used to set up the automatic daily report scheduler at 17:30 WIB.
 */
export async function register() {
    // Only run on the server (not edge runtime)
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { startDailyReportScheduler } = await import('./lib/report-scheduler')
        startDailyReportScheduler()
    }
}
