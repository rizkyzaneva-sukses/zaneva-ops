/**
 * Daily report builder untuk Elyasr Ops.
 * Mengambil data dari DB dan memformat jadi pesan Telegram HTML.
 * Dipanggil oleh instrumentation.ts (auto) dan cron-telegram route (manual/test).
 */

import { prisma } from '@/lib/prisma'

function fmt(n: number): string {
    return 'Rp ' + Math.round(n || 0).toLocaleString('id-ID')
}

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function todayWIB(): { dateStr: string; gteDate: Date; lteDate: Date; prevGte: Date; prevLte: Date; label: string } {
    const nowWIB = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))
    const y  = nowWIB.getFullYear()
    const m  = String(nowWIB.getMonth() + 1).padStart(2, '0')
    const d  = String(nowWIB.getDate()).padStart(2, '0')
    const dateStr = `${y}-${m}-${d}`

    const gteDate = new Date(dateStr + 'T00:00:00+07:00')
    const lteDate = new Date(dateStr + 'T23:59:59+07:00')

    const prevDay = new Date(gteDate)
    prevDay.setDate(prevDay.getDate() - 1)
    const py  = prevDay.getFullYear()
    const pm  = String(prevDay.getMonth() + 1).padStart(2, '0')
    const pd  = String(prevDay.getDate()).padStart(2, '0')
    const prevStr = `${py}-${pm}-${pd}`
    const prevGte = new Date(prevStr + 'T00:00:00+07:00')
    const prevLte = new Date(prevStr + 'T23:59:59+07:00')

    const label = new Date(dateStr + 'T00:00:00+07:00').toLocaleDateString('id-ID', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })

    return { dateStr, gteDate, lteDate, prevGte, prevLte, label }
}

export async function buildDailyReport(): Promise<string> {
    const { gteDate, lteDate, prevGte, prevLte, label } = todayWIB()

    const [todayOrders, prevOrders, stokKritis, aging, topPlatform] = await Promise.all([
        prisma.$queryRaw<{ group_key: string; cnt: bigint; total_omzet: bigint; total_hpp: bigint }[]>`
            SELECT
              CASE
                WHEN status LIKE 'TERKIRIM%' THEN 'terkirim'
                WHEN status ILIKE '%batal%' OR status ILIKE '%cancel%' OR status ILIKE '%dibatalkan%' THEN 'batal'
                ELSE 'perlu_dikirim'
              END AS group_key,
              COUNT(*) AS cnt,
              COALESCE(SUM(real_omzet), 0) AS total_omzet,
              COALESCE(SUM(hpp * qty), 0) AS total_hpp
            FROM orders
            WHERE trx_date >= ${gteDate} AND trx_date <= ${lteDate}
            GROUP BY group_key
        `,
        prisma.$queryRaw<{ cnt: bigint; total_omzet: bigint }[]>`
            SELECT COUNT(*) AS cnt, COALESCE(SUM(real_omzet), 0) AS total_omzet
            FROM orders
            WHERE trx_date >= ${prevGte} AND trx_date <= ${prevLte}
              AND status NOT ILIKE '%batal%'
              AND status NOT ILIKE '%cancel%'
              AND status NOT ILIKE '%dibatalkan%'
        `,
        prisma.$queryRaw<{ cnt: bigint }[]>`
            SELECT COUNT(*) AS cnt FROM (
              SELECT p.sku,
                p.stok_awal
                + COALESCE(SUM(CASE WHEN l.direction = 'IN'  AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
                - COALESCE(SUM(CASE WHEN l.direction = 'OUT' AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
                AS soh, p.rop
              FROM master_products p
              LEFT JOIN inventory_ledger l ON l.sku = p.sku
              WHERE p.is_active = true
              GROUP BY p.sku, p.stok_awal, p.rop, p.last_opname_date
            ) x WHERE soh <= rop
        `,
        prisma.$queryRaw<{ bucket: string; cnt: bigint }[]>`
            SELECT
              CASE
                WHEN EXTRACT(EPOCH FROM (NOW() - created_at))/3600 <= 12 THEN '0-12 Jam'
                WHEN EXTRACT(EPOCH FROM (NOW() - created_at))/3600 <= 24 THEN '12-24 Jam'
                WHEN EXTRACT(EPOCH FROM (NOW() - created_at))/3600 <= 48 THEN '24-48 Jam'
                ELSE '>48 Jam'
              END AS bucket,
              COUNT(*) AS cnt
            FROM orders
            WHERE status NOT LIKE 'TERKIRIM%'
              AND status NOT ILIKE '%batal%'
              AND status NOT ILIKE '%cancel%'
              AND status NOT ILIKE '%dibatalkan%'
            GROUP BY bucket
            ORDER BY bucket
        `,
        prisma.$queryRaw<{ platform: string; cnt: bigint; total_omzet: bigint }[]>`
            SELECT
              COALESCE(platform, 'Unknown') AS platform,
              COUNT(*) AS cnt,
              COALESCE(SUM(real_omzet), 0) AS total_omzet
            FROM orders
            WHERE trx_date >= ${gteDate} AND trx_date <= ${lteDate}
              AND status NOT ILIKE '%batal%'
              AND status NOT ILIKE '%cancel%'
              AND status NOT ILIKE '%dibatalkan%'
            GROUP BY platform
            ORDER BY total_omzet DESC
        `,
    ])

    // Kalkulasi
    const statsMap = Object.fromEntries(
        (todayOrders as any[]).map((r: any) => [
            r.group_key,
            { count: Number(r.cnt), omzet: Number(r.total_omzet), hpp: Number(r.total_hpp) }
        ])
    )

    const omzet      = (statsMap['terkirim']?.omzet     ?? 0) + (statsMap['perlu_dikirim']?.omzet ?? 0)
    const hpp        = (statsMap['terkirim']?.hpp       ?? 0) + (statsMap['perlu_dikirim']?.hpp   ?? 0)
    const gp         = omzet - hpp
    const margin     = omzet > 0 ? ((gp / omzet) * 100).toFixed(1) : '0'
    const terkirim   = statsMap['terkirim']?.count     ?? 0
    const perluKirim = statsMap['perlu_dikirim']?.count ?? 0
    const batal      = statsMap['batal']?.count         ?? 0
    const totalOrder = terkirim + perluKirim + batal

    const prevOmzet  = Number((prevOrders as any[])[0]?.total_omzet ?? 0)
    const prevCount  = Number((prevOrders as any[])[0]?.cnt         ?? 0)
    const omzetDiff  = omzet - prevOmzet
    const countDiff  = totalOrder - prevCount

    const agingMap   = Object.fromEntries((aging as any[]).map((r: any) => [r.bucket, Number(r.cnt)]))
    const agingTotal = Object.values(agingMap).reduce((s: number, v: any) => s + v, 0)
    const stokKritisCount = Number((stokKritis as any[])[0]?.cnt ?? 0)

    // Platform lines (max 5)
    const platforms = (topPlatform as any[]).slice(0, 5)
    const platformLines = platforms.length > 0
        ? platforms.map((p: any) => `├ ${esc(p.platform)}: ${fmt(Number(p.total_omzet))} (${Number(p.cnt)} order)`).join('\n')
        : '├ Tidak ada data platform'

    // Aging lines
    const agingKeys  = Object.keys(agingMap)
    const agingLines = agingKeys.length > 0
        ? agingKeys.map(k => `├ ${k}: ${agingMap[k]}`).join('\n')
        : '├ Tidak ada'

    // VS Kemarin
    const omzetArrow = omzetDiff >= 0 ? '↑' : '↓'
    const orderArrow = countDiff >= 0 ? '↑' : '↓'
    const omzetComp  = prevOmzet > 0 ? `${omzetArrow} ${fmt(Math.abs(omzetDiff))}` : '—'
    const orderComp  = `${orderArrow} ${Math.abs(countDiff)} order`

    // Waktu kirim WIB
    const sendTime = new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' })

    return `📊 <b>LAPORAN HARIAN ELYASR</b>
${esc(label)} — ${sendTime} WIB
━━━━━━━━━━━━━━━━━━━━━━━

💰 <b>OMZET &amp; PROFIT (Hari Ini)</b>
├ Real Omzet    : ${fmt(omzet)}
├ HPP Total     : ${fmt(hpp)}
└ Gross Profit  : ${fmt(gp)} (${margin}%)

📦 <b>ORDER</b>
├ Total Masuk  : ${totalOrder} order
├ Terkirim     : ${terkirim} order
├ Pending Kirim: ${perluKirim} order
└ Dibatalkan   : ${batal} order

🏪 <b>PER PLATFORM</b>
${platformLines}

😡 <b>AGING BACKLOG</b> (${agingTotal} order pending)
${agingLines}

🔥 <b>STOK KRITIS:</b> ${stokKritisCount} SKU perlu restock

📈 <b>VS KEMARIN</b>
├ Omzet  : ${omzetComp}
└ Order  : ${orderComp}

━━━━━━━━━━━━━━━━━━━━━━━
🤖 <i>Auto-report · ${sendTime} WIB · Elyasr Ops</i>`
}
