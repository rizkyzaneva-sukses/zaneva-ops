/**
 * Next.js Instrumentation - runs once on server startup.
 * Used to set up the automatic daily report scheduler at 17:30 WIB.
 *
 * PENTING: Jangan tambahkan kondisi NEXT_RUNTIME karena di standalone build
 * env var ini sering tidak terset, menyebabkan scheduler tidak pernah start.
 */
export async function register() {
    // Skip edge runtime — hanya jalan di Node.js server
    // Cek NEXT_RUNTIME: 'edge' saja, bukan require === 'nodejs'
    // karena di standalone build NEXT_RUNTIME bisa undefined (bukan 'nodejs')
    if (process.env.NEXT_RUNTIME === 'edge') return

    try {
        const { startDailyReportScheduler } = await import('./lib/report-scheduler')
        startDailyReportScheduler()
    } catch (err) {
        console.error('[INSTRUMENTATION] ❌ Gagal start report scheduler:', err)
    }
}
