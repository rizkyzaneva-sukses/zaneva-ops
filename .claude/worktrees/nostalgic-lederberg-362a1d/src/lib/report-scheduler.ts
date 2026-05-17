/**
 * Server-side scheduler for automatic daily Telegram report.
 * Runs every 30 seconds and checks if it's 17:30 WIB.
 *
 * ARSITEKTUR:
 * - Scheduler ini jalan di Node.js server process (bukan browser)
 * - Tidak bergantung pada browser user terbuka
 * - Log ke DB setiap jam agar bisa dikonfirmasi via /api/report/scheduler-status
 * - Cross-check DB sebelum kirim untuk cegah double-send
 */

let schedulerStarted = false
let lastSentDate: string | null = null
let tickCount = 0          // total tick sejak start
let lastHeartbeatHour = -1 // untuk log heartbeat per jam

// ── Catat ke DB (fire-and-forget) ──────────────────────────────────────────
async function dbSet(key: string, value: string): Promise<void> {
    try {
        const { prisma } = await import('./prisma')
        await prisma.appSetting.upsert({
            where: { key },
            update: { value, updatedBy: 'system-scheduler' },
            create: { key, value, updatedBy: 'system-scheduler' },
        })
    } catch { /* silent — jangan crash scheduler karena DB error */ }
}

async function dbGet(key: string): Promise<string | null> {
    try {
        const { prisma } = await import('./prisma')
        const r = await prisma.appSetting.findUnique({ where: { key } })
        return r?.value ?? null
    } catch { return null }
}

// ── Waktu WIB sekarang ──────────────────────────────────────────────────────
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

// ── Cek apakah sudah kirim hari ini (via DB) ────────────────────────────────
async function alreadySentToday(dateStr: string): Promise<boolean> {
    const val = await dbGet('last_auto_report_sent')
    if (!val) return false
    try {
        const sent = new Date(val)
        const sentWib = new Date(sent.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))
        const sy = sentWib.getFullYear()
        const sm = String(sentWib.getMonth() + 1).padStart(2, '0')
        const sd = String(sentWib.getDate()).padStart(2, '0')
        return `${sy}-${sm}-${sd}` === dateStr
    } catch { return false }
}

// ── Trigger laporan via internal API ───────────────────────────────────────
async function triggerReport(dateStr: string): Promise<void> {
    const cronSecret = process.env.CRON_SECRET || 'elyasr-internal-cron'

    // Bangun baseUrl tanpa loop ke localhost — panggil route handler langsung
    // Fallback ke localhost jika env tidak ada
    const baseUrl =
        process.env.NEXTAUTH_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        `http://localhost:${process.env.PORT || 3000}`

    const url = `${baseUrl}/api/report/cron-telegram`
    console.log(`[REPORT-SCHEDULER] 📤 Memanggil ${url}`)

    try {
        const res = await fetch(url, {
            method: 'GET',
            headers: { 'x-internal-cron': cronSecret },
            // Timeout 30 detik agar tidak hang
            signal: AbortSignal.timeout(30_000),
        })

        if (!res.ok) {
            const text = await res.text().catch(() => '(no body)')
            console.error(`[REPORT-SCHEDULER] ❌ HTTP ${res.status}: ${text}`)
            return
        }

        const json = await res.json()

        if (json.success) {
            console.log(`[REPORT-SCHEDULER] ✅ Laporan terkirim untuk ${json.date ?? dateStr}`)
            // Simpan last sent ke DB (juga dilakukan di cron-telegram, ini redundan agar pasti)
            await dbSet('last_auto_report_sent', new Date().toISOString())
            lastSentDate = dateStr
        } else if (json.skipped) {
            console.log(`[REPORT-SCHEDULER] ⏭️ Skip: ${json.error}`)
            lastSentDate = dateStr // jangan coba lagi hari ini
        } else {
            console.error(`[REPORT-SCHEDULER] ❌ Gagal: ${json.error}`)
        }
    } catch (err: any) {
        console.error(`[REPORT-SCHEDULER] ❌ Fetch error: ${err.message}`)
    }
}

// ── Tick utama: dipanggil setiap 30 detik ───────────────────────────────────
async function tick(): Promise<void> {
    tickCount++
    const { hours, minutes, dateStr } = getWIBTime()

    // Heartbeat log setiap jam (bisa dilihat di server logs)
    if (hours !== lastHeartbeatHour) {
        lastHeartbeatHour = hours
        const nowIso = new Date().toISOString()
        console.log(`[REPORT-SCHEDULER] 💓 Heartbeat ${nowIso} | WIB ${hours}:${String(minutes).padStart(2,'0')} | tick #${tickCount}`)
        // Simpan heartbeat ke DB agar bisa dicek via API
        await dbSet('scheduler_heartbeat', nowIso)
        await dbSet('scheduler_tick_count', String(tickCount))
    }

    // Window trigger: 17:30 – 17:32 WIB (toleransi 2 menit kalau server delay)
    if (hours !== 17 || minutes < 30 || minutes > 32) return

    // Guard in-memory
    if (lastSentDate === dateStr) return

    // Cross-check DB (cegah double-send kalau ada multiple instance)
    const already = await alreadySentToday(dateStr)
    if (already) {
        console.log(`[REPORT-SCHEDULER] ⏭️ DB: sudah kirim hari ini (${dateStr}), skip.`)
        lastSentDate = dateStr
        return
    }

    // Tandai dulu sebelum async call agar tidak race condition
    lastSentDate = dateStr
    console.log(`[REPORT-SCHEDULER] 🚀 Jam 17:30 WIB — memulai kirim laporan...`)
    await triggerReport(dateStr)
}

// ── Entry point ──────────────────────────────────────────────────────────────
export function startDailyReportScheduler(): void {
    if (schedulerStarted) {
        console.log('[REPORT-SCHEDULER] ⚠️ Sudah berjalan, skip duplicate start')
        return
    }

    schedulerStarted = true
    const startTime = new Date().toISOString()
    console.log(`[REPORT-SCHEDULER] 🟢 START — ${startTime} | target: 17:30 WIB setiap hari`)

    // Simpan waktu start ke DB
    dbSet('scheduler_started_at', startTime)
    dbSet('scheduler_heartbeat', startTime)

    // Cek setiap 30 detik
    setInterval(() => { tick().catch(console.error) }, 30_000)

    // Cek langsung 5 detik setelah start (handle restart tepat di 17:30)
    setTimeout(() => { tick().catch(console.error) }, 5_000)
}
