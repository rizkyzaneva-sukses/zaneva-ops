/**
 * Monthly report builder — laporan komprehensif bulan lalu.
 * Dikirim setiap tanggal 1 pagi (recap bulan sebelumnya).
 *
 * Mencakup: P&L summary, top/bottom products, growth metrics,
 * outstanding utang/piutang, dan ringkasan operasional.
 */

import { prisma } from '@/lib/prisma'

function fmt(n: number): string {
    return 'Rp ' + Math.round(n || 0).toLocaleString('id-ID')
}

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function pctChange(current: number, previous: number): string {
    if (previous === 0) return current > 0 ? '+∞' : '0%'
    const pct = ((current - previous) / previous) * 100
    const sign = pct >= 0 ? '+' : ''
    return `${sign}${pct.toFixed(1)}%`
}

function trendIcon(current: number, previous: number): string {
    return current >= previous ? '📈' : '📉'
}

function todayWIBStr(): string {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
}

function getPrevMonthRange(): { start: string; end: string; label: string; prevStart: string; prevEnd: string; prevLabel: string } {
    const today = todayWIBStr()
    const [yearStr, monthStr] = today.split('-')
    let year = parseInt(yearStr)
    let month = parseInt(monthStr) // 1-12, current month
    // bulan lalu
    let lastMonth = month - 1
    let lastYear = year
    if (lastMonth === 0) { lastMonth = 12; lastYear = year - 1 }
    // bulan sebelum bulan lalu (untuk perbandingan)
    let prevMonth = lastMonth - 1
    let prevYear = lastYear
    if (prevMonth === 0) { prevMonth = 12; prevYear = lastYear - 1 }

    const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

    const lastMonthStr = String(lastMonth).padStart(2, '0')
    const prevMonthStr = String(prevMonth).padStart(2, '0')

    // Last day of last month
    const lastDay = new Date(lastYear, lastMonth, 0).getDate()
    const prevLastDay = new Date(prevYear, prevMonth, 0).getDate()

    return {
        start: `${lastYear}-${lastMonthStr}-01`,
        end: `${lastYear}-${lastMonthStr}-${String(lastDay).padStart(2, '0')}`,
        label: `${monthNames[lastMonth - 1]} ${lastYear}`,
        prevStart: `${prevYear}-${prevMonthStr}-01`,
        prevEnd: `${prevYear}-${prevMonthStr}-${String(prevLastDay).padStart(2, '0')}`,
        prevLabel: `${monthNames[prevMonth - 1]} ${prevYear}`,
    }
}

export async function buildMonthlyReport(): Promise<string> {
    const r = getPrevMonthRange()
    const monthStart = new Date(`${r.start}T00:00:00+07:00`)
    const monthEnd = new Date(`${r.end}T23:59:59+07:00`)
    const prevMonthStart = new Date(`${r.prevStart}T00:00:00+07:00`)
    const prevMonthEnd = new Date(`${r.prevEnd}T23:59:59+07:00`)

    const [
        monthStats,
        prevMonthStats,
        topProducts,
        bottomProducts,
        platformBreakdown,
        platformBreakdownPrev,
        expenseBreakdown,
        payoutSummary,
        utangPiutang,
        topCities,
    ] = await Promise.all([
        // Bulan lalu — order stats
        prisma.$queryRaw<any[]>`
            SELECT
                CASE
                    WHEN status ILIKE '%batal%' OR status ILIKE '%cancel%' OR status ILIKE '%dibatalkan%' THEN 'batal'
                    ELSE 'valid'
                END AS grp,
                COUNT(*)::int AS cnt,
                SUM(qty)::int AS total_qty,
                COALESCE(SUM(real_omzet), 0)::bigint AS total_omzet,
                COALESCE(SUM(hpp * qty), 0)::bigint AS total_hpp
            FROM orders
            WHERE trx_date >= ${monthStart} AND trx_date <= ${monthEnd}
            GROUP BY grp
        `,
        // Bulan sebelumnya
        prisma.$queryRaw<any[]>`
            SELECT
                CASE
                    WHEN status ILIKE '%batal%' OR status ILIKE '%cancel%' OR status ILIKE '%dibatalkan%' THEN 'batal'
                    ELSE 'valid'
                END AS grp,
                COUNT(*)::int AS cnt,
                COALESCE(SUM(real_omzet), 0)::bigint AS total_omzet,
                COALESCE(SUM(hpp * qty), 0)::bigint AS total_hpp
            FROM orders
            WHERE trx_date >= ${prevMonthStart} AND trx_date <= ${prevMonthEnd}
            GROUP BY grp
        `,
        // Top 10 produk
        prisma.$queryRaw<any[]>`
            SELECT
                COALESCE(product_name, sku, '-') AS product_name,
                SUM(qty)::int AS total_qty,
                COALESCE(SUM(real_omzet), 0)::bigint AS total_omzet
            FROM orders
            WHERE trx_date >= ${monthStart} AND trx_date <= ${monthEnd}
              AND status NOT ILIKE '%batal%'
              AND status NOT ILIKE '%cancel%'
              AND status NOT ILIKE '%dibatalkan%'
            GROUP BY product_name, sku
            ORDER BY total_qty DESC
            LIMIT 10
        `,
        // Bottom 5 produk dari yang ada penjualan (dead-ish)
        prisma.$queryRaw<any[]>`
            SELECT
                COALESCE(product_name, sku, '-') AS product_name,
                SUM(qty)::int AS total_qty
            FROM orders
            WHERE trx_date >= ${monthStart} AND trx_date <= ${monthEnd}
              AND status NOT ILIKE '%batal%'
              AND status NOT ILIKE '%cancel%'
              AND status NOT ILIKE '%dibatalkan%'
            GROUP BY product_name, sku
            HAVING SUM(qty) > 0
            ORDER BY total_qty ASC
            LIMIT 5
        `,
        // Platform breakdown
        prisma.$queryRaw<any[]>`
            SELECT
                COALESCE(platform, 'Unknown') AS platform,
                COUNT(*)::int AS cnt,
                COALESCE(SUM(real_omzet), 0)::bigint AS total_omzet
            FROM orders
            WHERE trx_date >= ${monthStart} AND trx_date <= ${monthEnd}
              AND status NOT ILIKE '%batal%'
              AND status NOT ILIKE '%cancel%'
              AND status NOT ILIKE '%dibatalkan%'
            GROUP BY platform
            ORDER BY total_omzet DESC
        `,
        prisma.$queryRaw<any[]>`
            SELECT
                COALESCE(platform, 'Unknown') AS platform,
                COALESCE(SUM(real_omzet), 0)::bigint AS total_omzet
            FROM orders
            WHERE trx_date >= ${prevMonthStart} AND trx_date <= ${prevMonthEnd}
              AND status NOT ILIKE '%batal%'
              AND status NOT ILIKE '%cancel%'
              AND status NOT ILIKE '%dibatalkan%'
            GROUP BY platform
        `,
        // Expense breakdown bulan lalu
        prisma.$queryRaw<any[]>`
            SELECT
                COALESCE(category, '(Tanpa Kategori)') AS category,
                COALESCE(SUM(ABS(amount)), 0)::bigint AS total_amount
            FROM wallet_ledger
            WHERE trx_type = 'EXPENSE'
              AND trx_date >= ${monthStart}
              AND trx_date <= ${monthEnd}
            GROUP BY category
            ORDER BY total_amount DESC
            LIMIT 8
        `,
        // Payout summary
        prisma.$queryRaw<any[]>`
            SELECT
                COALESCE(SUM(omzet), 0)::bigint AS total_omzet,
                COALESCE(SUM(platform_fee + ams_fee + platform_fee_other + beban_ongkir), 0)::bigint AS total_fees,
                COALESCE(SUM(total_income), 0)::bigint AS total_income,
                COUNT(*)::int AS payout_count
            FROM payouts
            WHERE released_date >= ${monthStart} AND released_date <= ${monthEnd}
        `,
        // Utang piutang
        prisma.$queryRaw<any[]>`
            SELECT
                'utang' AS kind,
                COUNT(*)::int AS cnt,
                COALESCE(SUM(amount - amount_paid), 0)::bigint AS total
            FROM utangs
            WHERE status IN ('OUTSTANDING', 'PARTIAL')
            UNION ALL
            SELECT
                'piutang' AS kind,
                COUNT(*)::int AS cnt,
                COALESCE(SUM(amount - amount_collected), 0)::bigint AS total
            FROM piutangs
            WHERE status IN ('OUTSTANDING', 'PARTIAL')
        `,
        // Top 5 cities
        prisma.$queryRaw<any[]>`
            SELECT
                COALESCE(NULLIF(TRIM(city), ''), '(Tidak Diketahui)') AS city,
                COUNT(*)::int AS order_count,
                COALESCE(SUM(real_omzet), 0)::bigint AS total_omzet
            FROM orders
            WHERE trx_date >= ${monthStart} AND trx_date <= ${monthEnd}
              AND status NOT ILIKE '%batal%'
              AND status NOT ILIKE '%cancel%'
              AND status NOT ILIKE '%dibatalkan%'
            GROUP BY city
            ORDER BY order_count DESC
            LIMIT 5
        `,
    ])

    // Hitung
    const mMap = Object.fromEntries(monthStats.map((row: any) => [
        row.grp,
        { cnt: Number(row.cnt), qty: Number(row.total_qty || 0), omzet: Number(row.total_omzet), hpp: Number(row.total_hpp) }
    ]))
    const mValid = mMap['valid'] ?? { cnt: 0, qty: 0, omzet: 0, hpp: 0 }
    const mBatal = mMap['batal'] ?? { cnt: 0, qty: 0, omzet: 0, hpp: 0 }
    const omzet = mValid.omzet
    const hpp = mValid.hpp
    const gp = omzet - hpp
    const margin = omzet > 0 ? ((gp / omzet) * 100).toFixed(1) : '0'
    const totalOrder = mValid.cnt + mBatal.cnt
    const aov = mValid.cnt > 0 ? omzet / mValid.cnt : 0

    const pmMap = Object.fromEntries(prevMonthStats.map((row: any) => [
        row.grp,
        { cnt: Number(row.cnt), omzet: Number(row.total_omzet), hpp: Number(row.total_hpp) }
    ]))
    const pmValid = pmMap['valid'] ?? { cnt: 0, omzet: 0, hpp: 0 }
    const pmOmzet = pmValid.omzet
    const pmGp = pmValid.omzet - pmValid.hpp

    const pmPlatformMap = Object.fromEntries(
        platformBreakdownPrev.map((row: any) => [row.platform, Number(row.total_omzet)])
    )

    const expenseTotal = expenseBreakdown.reduce((s: number, row: any) => s + Number(row.total_amount), 0)
    const netProfit = gp - expenseTotal // operating profit estimate

    const payout = payoutSummary[0] || { total_omzet: 0, total_fees: 0, total_income: 0, payout_count: 0 }

    const upMap = Object.fromEntries(utangPiutang.map((row: any) => [row.kind, { cnt: Number(row.cnt), total: Number(row.total) }]))
    const utangData = upMap['utang'] ?? { cnt: 0, total: 0 }
    const piutangData = upMap['piutang'] ?? { cnt: 0, total: 0 }

    // Format
    const sep = '━━━━━━━━━━━━━━━━━━━━━━━'
    const medalEmoji = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟']

    const topProductLines = topProducts.length === 0
        ? '  <i>(belum ada data)</i>'
        : topProducts.map((p: any, i: number) =>
            `  ${medalEmoji[i] ?? '▪️'} ${esc(p.product_name)} — <b>${Number(p.total_qty)} pcs</b> (${fmt(Number(p.total_omzet))})`
          ).join('\n')

    const bottomProductLines = bottomProducts.length === 0
        ? '  <i>(tidak ada data)</i>'
        : bottomProducts.map((p: any) =>
            `  ▫️ ${esc(p.product_name)} — ${Number(p.total_qty)} pcs`
          ).join('\n')

    const platformLines = platformBreakdown.length === 0
        ? '  <i>(belum ada data)</i>'
        : platformBreakdown.map((p: any) => {
            const cur = Number(p.total_omzet)
            const prev = pmPlatformMap[p.platform] ?? 0
            const share = omzet > 0 ? ((cur / omzet) * 100).toFixed(1) : '0'
            return `  ▪️ ${esc(p.platform)} — <b>${fmt(cur)}</b> (${share}%) ${trendIcon(cur, prev)} ${pctChange(cur, prev)}`
          }).join('\n')

    const expenseLines = expenseBreakdown.length === 0
        ? '  <i>(tidak ada pengeluaran tercatat)</i>'
        : expenseBreakdown.map((e: any) => {
            const amt = Number(e.total_amount)
            const share = expenseTotal > 0 ? ((amt / expenseTotal) * 100).toFixed(1) : '0'
            return `  ▪️ ${esc(e.category)} — <b>${fmt(amt)}</b> (${share}%)`
          }).join('\n')

    const cityLines = topCities.length === 0
        ? '  <i>(belum ada data)</i>'
        : topCities.map((c: any, i: number) =>
            `  ${medalEmoji[i] ?? '▪️'} ${esc(c.city)} — <b>${Number(c.order_count)} order</b> (${fmt(Number(c.total_omzet))})`
          ).join('\n')

    const lines = [
        `📊 <b>LAPORAN BULANAN — ELYASR</b>`,
        `🗓️ ${esc(r.label)} (vs ${esc(r.prevLabel)})`,
        sep, ``,

        `💰 <b>P&amp;L SUMMARY</b>`, ``,
        `🛒 Total Order  · <b>${totalOrder} paket</b> (valid: ${mValid.cnt}, batal: ${mBatal.cnt})`,
        `📦 Total Qty     · <b>${mValid.qty} pcs</b>`,
        `💵 Omzet         · <b>${fmt(omzet)}</b>`,
        `🏷️ HPP            · ${fmt(hpp)}`,
        `💎 Gross Profit · <b>${fmt(gp)}</b> (${margin}%)`,
        `📊 AOV           · ${fmt(aov)}`, ``,

        `💸 <b>OPERATING EXPENSE</b>`,
        `  Total Expense · <b>${fmt(expenseTotal)}</b>`,
        `  Net (GP - Exp) · <b>${fmt(netProfit)}</b>`, ``,

        `📈 <b>GROWTH vs ${esc(r.prevLabel)}</b>`,
        `${trendIcon(omzet, pmOmzet)} Omzet         · <b>${pctChange(omzet, pmOmzet)}</b>  <i>(${fmt(pmOmzet)})</i>`,
        `${trendIcon(gp, pmGp)} Gross Profit · <b>${pctChange(gp, pmGp)}</b>  <i>(${fmt(pmGp)})</i>`,
        `${trendIcon(mValid.cnt, pmValid.cnt)} Order Valid · <b>${pctChange(mValid.cnt, pmValid.cnt)}</b>  <i>(${pmValid.cnt})</i>`, ``,

        sep, ``,
        `🏪 <b>OMZET PER PLATFORM</b>`,
        platformLines, ``,

        sep, ``,
        `💰 <b>PAYOUT MARKETPLACE</b>`,
        `  Payout count · <b>${Number(payout.payout_count)}</b>`,
        `  Gross omzet  · ${fmt(Number(payout.total_omzet))}`,
        `  Fees & ongkir · ${fmt(Number(payout.total_fees))}`,
        `  Net income   · <b>${fmt(Number(payout.total_income))}</b>`, ``,

        sep, ``,
        `🏆 <b>TOP 10 PRODUK</b>`,
        topProductLines, ``,
        `🐢 <b>5 PRODUK TER-LAMBAT (yang ada penjualan)</b>`,
        bottomProductLines, ``,

        sep, ``,
        `📍 <b>TOP 5 KOTA</b>`,
        cityLines, ``,

        sep, ``,
        `💼 <b>BREAKDOWN PENGELUARAN</b>`,
        expenseLines, ``,

        sep, ``,
        `💳 <b>UTANG &amp; PIUTANG OUTSTANDING</b>`,
        `  💸 Utang   · ${utangData.cnt} item · <b>${fmt(utangData.total)}</b>`,
        `  💰 Piutang · ${piutangData.cnt} item · <b>${fmt(piutangData.total)}</b>`,
        `  ⚖️ Net Position · <b>${fmt(piutangData.total - utangData.total)}</b>`, ``,

        sep,
        `🤖 <i>Auto monthly report · Elyasr Ops</i>`,
    ]

    return lines.join('\n')
}
