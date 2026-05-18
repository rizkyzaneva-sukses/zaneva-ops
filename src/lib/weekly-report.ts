/**
 * Weekly report builder — perbandingan minggu ini vs minggu lalu.
 * Senin–Minggu, dikirim setiap Senin pagi (recap minggu lalu).
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

function addDays(dateStr: string, days: number): string {
    const d = new Date(`${dateStr}T12:00:00+07:00`)
    d.setDate(d.getDate() + days)
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
}

function getMondayOfWeek(dateStr: string): string {
    const d = new Date(`${dateStr}T12:00:00+07:00`)
    const day = d.getDay()
    const diff = day === 0 ? -6 : 1 - day
    d.setDate(d.getDate() + diff)
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
}

function fmtWIBDateShort(dateStr: string): string {
    const d = new Date(`${dateStr}T12:00:00+07:00`)
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des']
    return `${d.getDate()} ${months[d.getMonth()]}`
}

export async function buildWeeklyReport(): Promise<string> {
    const today = todayWIBStr()
    // "Minggu lalu" = Senin minus 7 sampai Minggu minus 1
    const thisMonday = getMondayOfWeek(today)
    const lastMonday = addDays(thisMonday, -7)
    const lastSunday = addDays(thisMonday, -1)
    const prevMonday = addDays(lastMonday, -7)
    const prevSunday = addDays(lastMonday, -1)

    const lastWeekStart = new Date(`${lastMonday}T00:00:00+07:00`)
    const lastWeekEnd = new Date(`${lastSunday}T23:59:59+07:00`)
    const prevWeekStart = new Date(`${prevMonday}T00:00:00+07:00`)
    const prevWeekEnd = new Date(`${prevSunday}T23:59:59+07:00`)

    const [
        lastWeekStats,
        prevWeekStats,
        topProducts,
        platformBreakdown,
        platformBreakdownPrev,
        utangPiutang,
    ] = await Promise.all([
        // Last week stats — omzet, hpp, count
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
            WHERE trx_date >= ${lastWeekStart} AND trx_date <= ${lastWeekEnd}
            GROUP BY grp
        `,
        // Prev week stats
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
            WHERE trx_date >= ${prevWeekStart} AND trx_date <= ${prevWeekEnd}
            GROUP BY grp
        `,
        // Top products last week
        prisma.$queryRaw<any[]>`
            SELECT
                COALESCE(product_name, sku, '-') AS product_name,
                SUM(qty)::int AS total_qty,
                COALESCE(SUM(real_omzet), 0)::bigint AS total_omzet
            FROM orders
            WHERE trx_date >= ${lastWeekStart} AND trx_date <= ${lastWeekEnd}
              AND status NOT ILIKE '%batal%'
              AND status NOT ILIKE '%cancel%'
              AND status NOT ILIKE '%dibatalkan%'
            GROUP BY product_name, sku
            ORDER BY total_qty DESC
            LIMIT 10
        `,
        // Platform breakdown last week
        prisma.$queryRaw<any[]>`
            SELECT
                COALESCE(platform, 'Unknown') AS platform,
                COUNT(*)::int AS cnt,
                COALESCE(SUM(real_omzet), 0)::bigint AS total_omzet
            FROM orders
            WHERE trx_date >= ${lastWeekStart} AND trx_date <= ${lastWeekEnd}
              AND status NOT ILIKE '%batal%'
              AND status NOT ILIKE '%cancel%'
              AND status NOT ILIKE '%dibatalkan%'
            GROUP BY platform
            ORDER BY total_omzet DESC
        `,
        // Platform breakdown prev week (untuk growth per platform)
        prisma.$queryRaw<any[]>`
            SELECT
                COALESCE(platform, 'Unknown') AS platform,
                COALESCE(SUM(real_omzet), 0)::bigint AS total_omzet
            FROM orders
            WHERE trx_date >= ${prevWeekStart} AND trx_date <= ${prevWeekEnd}
              AND status NOT ILIKE '%batal%'
              AND status NOT ILIKE '%cancel%'
              AND status NOT ILIKE '%dibatalkan%'
            GROUP BY platform
        `,
        // Utang piutang outstanding
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
    ])

    // Hitung last week
    const lwMap = Object.fromEntries(lastWeekStats.map((r: any) => [
        r.grp,
        { cnt: Number(r.cnt), omzet: Number(r.total_omzet), hpp: Number(r.total_hpp) }
    ]))
    const lwValid = lwMap['valid'] ?? { cnt: 0, omzet: 0, hpp: 0 }
    const lwBatal = lwMap['batal'] ?? { cnt: 0, omzet: 0, hpp: 0 }
    const lwOmzet = lwValid.omzet
    const lwHpp = lwValid.hpp
    const lwGp = lwOmzet - lwHpp
    const lwMargin = lwOmzet > 0 ? ((lwGp / lwOmzet) * 100).toFixed(1) : '0'
    const lwTotalOrder = lwValid.cnt + lwBatal.cnt

    // Hitung prev week
    const pwMap = Object.fromEntries(prevWeekStats.map((r: any) => [
        r.grp,
        { cnt: Number(r.cnt), omzet: Number(r.total_omzet), hpp: Number(r.total_hpp) }
    ]))
    const pwValid = pwMap['valid'] ?? { cnt: 0, omzet: 0, hpp: 0 }
    const pwOmzet = pwValid.omzet
    const pwHpp = pwValid.hpp
    const pwGp = pwOmzet - pwHpp

    // Platform growth map
    const pwPlatformMap = Object.fromEntries(
        platformBreakdownPrev.map((r: any) => [r.platform, Number(r.total_omzet)])
    )

    // Utang piutang
    const upMap = Object.fromEntries(utangPiutang.map((r: any) => [r.kind, { cnt: Number(r.cnt), total: Number(r.total) }]))
    const utangData = upMap['utang'] ?? { cnt: 0, total: 0 }
    const piutangData = upMap['piutang'] ?? { cnt: 0, total: 0 }

    // Format
    const sep = '━━━━━━━━━━━━━━━━━━━━━━━'
    const periodLabel = `${fmtWIBDateShort(lastMonday)} – ${fmtWIBDateShort(lastSunday)}`
    const prevPeriodLabel = `${fmtWIBDateShort(prevMonday)} – ${fmtWIBDateShort(prevSunday)}`

    const medalEmoji = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟']

    const topProductLines = topProducts.length === 0
        ? '  <i>(belum ada data)</i>'
        : topProducts.map((p: any, i: number) =>
            `  ${medalEmoji[i] ?? '▪️'} ${esc(p.product_name)} — <b>${Number(p.total_qty)} pcs</b> (${fmt(Number(p.total_omzet))})`
          ).join('\n')

    const platformLines = platformBreakdown.length === 0
        ? '  <i>(belum ada data)</i>'
        : platformBreakdown.map((p: any) => {
            const cur = Number(p.total_omzet)
            const prev = pwPlatformMap[p.platform] ?? 0
            return `  ▪️ ${esc(p.platform)} — <b>${fmt(cur)}</b> ${trendIcon(cur, prev)} ${pctChange(cur, prev)}`
          }).join('\n')

    const lines = [
        `📅 <b>LAPORAN MINGGUAN — ELYASR</b>`,
        `🗓️ ${esc(periodLabel)} (vs ${esc(prevPeriodLabel)})`,
        sep, ``,

        `💰 <b>FINANSIAL MINGGU LALU</b>`, ``,
        `🛒 Total Order  · <b>${lwTotalOrder} paket</b> (valid: ${lwValid.cnt}, batal: ${lwBatal.cnt})`,
        `💵 Omzet         · <b>${fmt(lwOmzet)}</b>`,
        `🏷️ HPP            · ${fmt(lwHpp)}`,
        `💎 Gross Profit · <b>${fmt(lwGp)}</b> (${lwMargin}%)`, ``,

        `📊 <b>VS MINGGU SEBELUMNYA</b>`,
        `${trendIcon(lwOmzet, pwOmzet)} Omzet         · <b>${pctChange(lwOmzet, pwOmzet)}</b>  <i>(${fmt(pwOmzet)})</i>`,
        `${trendIcon(lwGp, pwGp)} Gross Profit · <b>${pctChange(lwGp, pwGp)}</b>  <i>(${fmt(pwGp)})</i>`,
        `${trendIcon(lwValid.cnt, pwValid.cnt)} Order Valid · <b>${pctChange(lwValid.cnt, pwValid.cnt)}</b>  <i>(${pwValid.cnt})</i>`, ``,

        sep, ``,
        `🏪 <b>OMZET PER PLATFORM</b>`,
        platformLines, ``,

        sep, ``,
        `🏆 <b>TOP 10 PRODUK MINGGU LALU</b>`,
        topProductLines, ``,

        sep, ``,
        `💳 <b>UTANG & PIUTANG OUTSTANDING</b>`,
        `  💸 Utang   · ${utangData.cnt} item · <b>${fmt(utangData.total)}</b>`,
        `  💰 Piutang · ${piutangData.cnt} item · <b>${fmt(piutangData.total)}</b>`,
        `  ⚖️ Net Position · <b>${fmt(piutangData.total - utangData.total)}</b>`, ``,

        sep,
        `🤖 <i>Auto weekly report · Elyasr Ops</i>`,
    ]

    return lines.join('\n')
}
