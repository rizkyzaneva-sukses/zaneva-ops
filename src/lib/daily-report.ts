/**
 * Daily report builder untuk Elyasr Ops.
 * Mengambil data dari DB dan memformat jadi pesan Telegram HTML.
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

export async function buildDailyReport(): Promise<string> {
    const today      = todayWIBStr()
    const yesterday  = addDays(today, -1)
    const weekMinus7 = addDays(today, -7)
    const weekStart  = getMondayOfWeek(today)
    const monthStart = today.slice(0, 7) + '-01'

    const gteToday    = new Date(`${today}T00:00:00+07:00`)
    const lteToday    = new Date(`${today}T23:59:59+07:00`)
    const gteYest     = new Date(`${yesterday}T00:00:00+07:00`)
    const lteYest     = new Date(`${yesterday}T23:59:59+07:00`)
    const gteH7       = new Date(`${weekMinus7}T00:00:00+07:00`)
    const lteH7       = new Date(`${weekMinus7}T23:59:59+07:00`)
    const gteWeek     = new Date(`${weekStart}T00:00:00+07:00`)
    const gteMonth    = new Date(`${monthStart}T00:00:00+07:00`)
    const gte10d      = new Date(`${addDays(today, -9)}T00:00:00+07:00`)

    const [
        todayRows,
        yesterdayRows,
        h7Rows,
        weekRows,
        monthRows,
        platformRows,
        pendingRows,
        zeroStockRows,
        minusStockRows,
    ] = await Promise.all([

        // Hari ini — omzet, hpp, count (GROUP BY status)
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
            WHERE trx_date >= ${gteToday} AND trx_date <= ${lteToday}
            GROUP BY grp
        `,

        // Kemarin — omzet non-batal
        prisma.$queryRaw<any[]>`
            SELECT COALESCE(SUM(real_omzet), 0)::bigint AS total_omzet
            FROM orders
            WHERE trx_date >= ${gteYest} AND trx_date <= ${lteYest}
              AND status NOT ILIKE '%batal%'
              AND status NOT ILIKE '%cancel%'
              AND status NOT ILIKE '%dibatalkan%'
        `,

        // 7 hari lalu (hari yang sama minggu lalu)
        prisma.$queryRaw<any[]>`
            SELECT COALESCE(SUM(real_omzet), 0)::bigint AS total_omzet
            FROM orders
            WHERE trx_date >= ${gteH7} AND trx_date <= ${lteH7}
              AND status NOT ILIKE '%batal%'
              AND status NOT ILIKE '%cancel%'
              AND status NOT ILIKE '%dibatalkan%'
        `,

        // Minggu ini (Senin s/d hari ini)
        prisma.$queryRaw<any[]>`
            SELECT COALESCE(SUM(real_omzet), 0)::bigint AS total_omzet
            FROM orders
            WHERE trx_date >= ${gteWeek} AND trx_date <= ${lteToday}
              AND status NOT ILIKE '%batal%'
              AND status NOT ILIKE '%cancel%'
              AND status NOT ILIKE '%dibatalkan%'
        `,

        // Bulan ini
        prisma.$queryRaw<any[]>`
            SELECT COALESCE(SUM(real_omzet), 0)::bigint AS total_omzet
            FROM orders
            WHERE trx_date >= ${gteMonth} AND trx_date <= ${lteToday}
              AND status NOT ILIKE '%batal%'
              AND status NOT ILIKE '%cancel%'
              AND status NOT ILIKE '%dibatalkan%'
        `,

        // Platform breakdown hari ini
        prisma.$queryRaw<any[]>`
            SELECT
                COALESCE(platform, 'Unknown') AS platform,
                COUNT(*)::int AS cnt,
                COALESCE(SUM(real_omzet), 0)::bigint AS total_omzet
            FROM orders
            WHERE trx_date >= ${gteToday} AND trx_date <= ${lteToday}
              AND status NOT ILIKE '%batal%'
              AND status NOT ILIKE '%cancel%'
              AND status NOT ILIKE '%dibatalkan%'
            GROUP BY platform
            ORDER BY total_omzet DESC
            LIMIT 5
        `,

        // Pending orders 10 hari terakhir — agregasi per produk
        prisma.$queryRaw<any[]>`
            SELECT
                COALESCE(product_name, sku, '-') AS product_name,
                SUM(qty)::int AS total_qty
            FROM orders
            WHERE trx_date >= ${gte10d} AND trx_date <= ${lteToday}
              AND status NOT LIKE 'TERKIRIM%'
              AND status NOT ILIKE '%batal%'
              AND status NOT ILIKE '%cancel%'
              AND status NOT ILIKE '%dibatalkan%'
            GROUP BY product_name, sku
            ORDER BY total_qty DESC
            LIMIT 25
        `,

        // Stok habis (SOH = 0), produk aktif
        prisma.$queryRaw<any[]>`
            SELECT sku, product_name FROM (
                SELECT p.sku, p.product_name,
                    p.stok_awal
                    + COALESCE(SUM(CASE WHEN l.direction = 'IN'  AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
                    - COALESCE(SUM(CASE WHEN l.direction = 'OUT' AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
                    AS soh
                FROM master_products p
                LEFT JOIN inventory_ledger l ON l.sku = p.sku
                WHERE p.is_active = true
                GROUP BY p.sku, p.product_name, p.stok_awal, p.last_opname_date
            ) x WHERE soh = 0
            ORDER BY product_name ASC
        `,

        // Stok minus (SOH < 0), produk aktif
        prisma.$queryRaw<any[]>`
            SELECT sku, product_name, soh FROM (
                SELECT p.sku, p.product_name,
                    p.stok_awal
                    + COALESCE(SUM(CASE WHEN l.direction = 'IN'  AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
                    - COALESCE(SUM(CASE WHEN l.direction = 'OUT' AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
                    AS soh
                FROM master_products p
                LEFT JOIN inventory_ledger l ON l.sku = p.sku
                WHERE p.is_active = true
                GROUP BY p.sku, p.product_name, p.stok_awal, p.last_opname_date
            ) x WHERE soh < 0
            ORDER BY soh ASC
        `,
    ])

    // ─── Kalkulasi hari ini ───────────────────────────────────────────────────
    const statsMap = Object.fromEntries(todayRows.map((r: any) => [
        r.grp,
        { cnt: Number(r.cnt), omzet: Number(r.total_omzet), hpp: Number(r.total_hpp) }
    ]))
    const valid      = statsMap['valid'] ?? { cnt: 0, omzet: 0, hpp: 0 }
    const batal      = statsMap['batal'] ?? { cnt: 0, omzet: 0, hpp: 0 }
    const omzetHari  = valid.omzet
    const hppHari    = valid.hpp
    const gpHari     = omzetHari - hppHari
    const marginHari = omzetHari > 0 ? ((gpHari / omzetHari) * 100).toFixed(1) : '0'
    const totalOrder = valid.cnt + batal.cnt

    const omzetKemarin  = Number((yesterdayRows as any[])[0]?.total_omzet ?? 0)
    const omzetH7       = Number((h7Rows as any[])[0]?.total_omzet ?? 0)
    const omzetMinggu   = Number((weekRows as any[])[0]?.total_omzet ?? 0)
    const omzetBulan    = Number((monthRows as any[])[0]?.total_omzet ?? 0)

    // ─── Waktu ───────────────────────────────────────────────────────────────
    const dateStr = new Date().toLocaleDateString('id-ID', {
        timeZone: 'Asia/Jakarta',
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
    const timeStr = new Date().toLocaleTimeString('id-ID', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit', minute: '2-digit', hour12: false,
    })

    // ─── Platform lines ───────────────────────────────────────────────────────
    const medalEmoji = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣']
    const platformLines = (platformRows as any[]).length === 0
        ? '  <i>(belum ada data hari ini)</i>'
        : (platformRows as any[]).map((p: any, i: number) =>
            `  ${medalEmoji[i] ?? '▪️'} ${esc(p.platform)} — <b>${fmt(Number(p.total_omzet))}</b>`
          ).join('\n')

    // ─── Pending product lines ────────────────────────────────────────────────
    const pendingCount = (pendingRows as any[]).reduce((s: number, r: any) => s + Number(r.total_qty), 0)
    const pendingProductLines = (pendingRows as any[]).length === 0
        ? '  <i>(tidak ada order pending)</i>'
        : (pendingRows as any[]).map((r: any) =>
            `  • ${esc(r.product_name)} | ${Number(r.total_qty)}`
          ).join('\n')

    // ─── Stock alert lines ────────────────────────────────────────────────────
    const sep = '━━━━━━━━━━━━━━━━━━━━━━━'

    const zeroLines = (zeroStockRows as any[]).length === 0 ? '' : [
        `🔴 <b>Stok Habis (0) — ${(zeroStockRows as any[]).length} produk:</b>`,
        ...(zeroStockRows as any[]).map((p: any) => `  • ${esc(p.product_name)}`),
    ].join('\n')

    const minusLines = (minusStockRows as any[]).length === 0 ? '' : [
        `🚨 <b>Stok Minus — ${(minusStockRows as any[]).length} produk:</b>`,
        ...(minusStockRows as any[]).map((p: any) => `  • ${esc(p.product_name)} | <b>${Number(p.soh)}</b>`),
    ].join('\n')

    const hasStockAlert = (zeroStockRows as any[]).length > 0 || (minusStockRows as any[]).length > 0
    const stockSection = hasStockAlert ? [
        sep, ``,
        `⚠️ <b>PERINGATAN STOK</b>`, ``,
        ...(zeroLines  ? [zeroLines,  ``] : []),
        ...(minusLines ? [minusLines, ``] : []),
    ] : [
        sep, ``,
        `✅ <b>STOK</b> · Semua produk aktif dalam kondisi normal`, ``,
    ]

    // ─── Assemble ─────────────────────────────────────────────────────────────
    const lines = [
        `🏪 <b>LAPORAN HARIAN — ELYASR</b>`,
        `📅 ${esc(dateStr)} · ${timeStr} WIB`,
        sep, ``,

        `💰 <b>FINANSIAL</b>`, ``,
        `🛒 Order Masuk   · <b>${totalOrder} paket</b>`,
        `💵 Nilai Order   · <b>${fmt(omzetHari)}</b>`, ``,
        `📊 Omset Hari Ini    · <b>${fmt(omzetHari)}</b>`,
        `📅 Omset Minggu Ini  · <b>${fmt(omzetMinggu)}</b>`,
        `📆 Omset Bulan Ini   · <b>${fmt(omzetBulan)}</b>`, ``,
        `${trendIcon(omzetHari, omzetKemarin)} vs Kemarin     · <b>${pctChange(omzetHari, omzetKemarin)}</b>  <i>(${fmt(omzetKemarin)})</i>`,
        `${trendIcon(omzetHari, omzetH7)} vs Minggu Lalu · <b>${pctChange(omzetHari, omzetH7)}</b>  <i>(${fmt(omzetH7)})</i>`, ``,
        `💡 <b>PROFIT HARI INI</b>`,
        `├ HPP        · ${fmt(hppHari)}`,
        `└ Gross Profit · <b>${fmt(gpHari)}</b> (${marginHari}%)`, ``,
        `🏪 <b>OMZET PER PLATFORM</b>`,
        platformLines, ``,

        sep, ``,
        `📦 <b>OPERASIONAL</b>`, ``,
        `⏳ Order Pending  · <b>${pendingCount} paket</b>`, ``,
        `📋 <b>Detail Produk Pending :</b>`,
        pendingProductLines, ``,

        ...stockSection,
        sep,
        `🤖 <i>Auto-report · ${timeStr} WIB · Elyasr Ops</i>`,
    ]

    return lines.join('\n')
}
