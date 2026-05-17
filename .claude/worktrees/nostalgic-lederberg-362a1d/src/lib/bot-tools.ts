/**
 * Data query tools untuk Telegram AI Assistant.
 * Setiap fungsi mengambil data dari DB dan mengembalikan objek terstruktur
 * yang digunakan oleh AI untuk menyusun jawaban.
 */

import { prisma } from '@/lib/prisma'

// ─────────────────────────────────────────────
// Helper: Rentang waktu WIB
// ─────────────────────────────────────────────
type Period = 'today' | 'yesterday' | 'week' | 'month'

function getDateRange(period: Period) {
    const nowWIB = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))
    const y = nowWIB.getFullYear()
    const m = String(nowWIB.getMonth() + 1).padStart(2, '0')
    const d = String(nowWIB.getDate()).padStart(2, '0')
    const todayStr = `${y}-${m}-${d}`

    if (period === 'today') {
        return {
            gte: new Date(todayStr + 'T00:00:00+07:00'),
            lte: new Date(todayStr + 'T23:59:59+07:00'),
            label: 'Hari Ini',
        }
    }
    if (period === 'yesterday') {
        const prev = new Date(todayStr + 'T00:00:00+07:00')
        prev.setDate(prev.getDate() - 1)
        const py = prev.getFullYear()
        const pm = String(prev.getMonth() + 1).padStart(2, '0')
        const pd = String(prev.getDate()).padStart(2, '0')
        const prevStr = `${py}-${pm}-${pd}`
        return {
            gte: new Date(prevStr + 'T00:00:00+07:00'),
            lte: new Date(prevStr + 'T23:59:59+07:00'),
            label: 'Kemarin',
        }
    }
    if (period === 'week') {
        const gte = new Date(todayStr + 'T00:00:00+07:00')
        gte.setDate(gte.getDate() - 6)
        return {
            gte,
            lte: new Date(todayStr + 'T23:59:59+07:00'),
            label: '7 Hari Terakhir',
        }
    }
    // month
    const gte = new Date(`${y}-${m}-01T00:00:00+07:00`)
    return {
        gte,
        lte: new Date(todayStr + 'T23:59:59+07:00'),
        label: 'Bulan Ini',
    }
}

function formatRp(n: number) {
    return 'Rp ' + Math.round(n).toLocaleString('id-ID')
}

// ─────────────────────────────────────────────
// Tool 1: Ranking produk terlaris
// ─────────────────────────────────────────────
export async function getSalesRanking(period: string, limit: number = 10) {
    const range = getDateRange((period || 'week') as Period)

    const rows = await prisma.$queryRaw<any[]>`
        SELECT
            COALESCE(sku, '-') AS sku,
            COALESCE(product_name, sku, '-') AS product_name,
            SUM(qty)::int AS total_qty,
            COALESCE(SUM(real_omzet), 0)::bigint AS total_omzet,
            COUNT(*)::int AS order_count
        FROM orders
        WHERE trx_date >= ${range.gte}
          AND trx_date <= ${range.lte}
          AND status NOT ILIKE '%batal%'
          AND status NOT ILIKE '%cancel%'
          AND status NOT ILIKE '%dibatalkan%'
        GROUP BY sku, product_name
        ORDER BY total_qty DESC
        LIMIT ${limit}
    `

    return {
        period: range.label,
        ranking: rows.map((r, i) => ({
            rank: i + 1,
            sku: r.sku,
            productName: r.product_name,
            totalQty: Number(r.total_qty),
            totalOmzet: formatRp(Number(r.total_omzet)),
            orderCount: Number(r.order_count),
        })),
    }
}

// ─────────────────────────────────────────────
// Tool 2: Ringkasan omzet & profit
// ─────────────────────────────────────────────
export async function getRevenueSummary(period: string) {
    const range = getDateRange((period || 'today') as Period)

    const rows = await prisma.$queryRaw<any[]>`
        SELECT
            COUNT(*)::int AS total_orders,
            SUM(CASE WHEN status NOT ILIKE '%batal%' AND status NOT ILIKE '%cancel%' AND status NOT ILIKE '%dibatalkan%' THEN 1 ELSE 0 END)::int AS valid_orders,
            COALESCE(SUM(CASE WHEN status NOT ILIKE '%batal%' AND status NOT ILIKE '%cancel%' AND status NOT ILIKE '%dibatalkan%' THEN real_omzet ELSE 0 END), 0)::bigint AS total_omzet,
            COALESCE(SUM(CASE WHEN status NOT ILIKE '%batal%' AND status NOT ILIKE '%cancel%' AND status NOT ILIKE '%dibatalkan%' THEN hpp * qty ELSE 0 END), 0)::bigint AS total_hpp,
            SUM(CASE WHEN status ILIKE '%batal%' OR status ILIKE '%cancel%' OR status ILIKE '%dibatalkan%' THEN 1 ELSE 0 END)::int AS batal_count
        FROM orders
        WHERE trx_date >= ${range.gte} AND trx_date <= ${range.lte}
    `

    const r = rows[0]
    const omzet = Number(r?.total_omzet ?? 0)
    const hpp   = Number(r?.total_hpp   ?? 0)
    const gp    = omzet - hpp

    return {
        period: range.label,
        totalOrders: Number(r?.total_orders  ?? 0),
        validOrders: Number(r?.valid_orders  ?? 0),
        batalCount:  Number(r?.batal_count   ?? 0),
        omzet:       formatRp(omzet),
        hpp:         formatRp(hpp),
        grossProfit: formatRp(gp),
        marginPct:   omzet > 0 ? ((gp / omzet) * 100).toFixed(1) + '%' : '0%',
    }
}

// ─────────────────────────────────────────────
// Tool 3: Status stok produk
// ─────────────────────────────────────────────
export async function getStockLevels(filter: string = 'low', limit: number = 20) {
    const f = filter as 'all' | 'low' | 'critical'
    const havingClause = f === 'critical' ? 'soh <= 0' : f === 'low' ? 'soh <= rop' : '1=1'

    // PostgreSQL subquery + HAVING via dynamic SQL through raw
    let rows: any[]
    if (f === 'critical') {
        rows = await prisma.$queryRaw`
            SELECT sku, product_name, rop, soh FROM (
                SELECT p.sku, p.product_name, p.rop,
                    p.stok_awal
                    + COALESCE(SUM(CASE WHEN l.direction = 'IN'  AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
                    - COALESCE(SUM(CASE WHEN l.direction = 'OUT' AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
                    AS soh
                FROM master_products p
                LEFT JOIN inventory_ledger l ON l.sku = p.sku
                WHERE p.is_active = true
                GROUP BY p.sku, p.product_name, p.rop, p.stok_awal, p.last_opname_date
            ) x WHERE soh <= 0
            ORDER BY soh ASC
            LIMIT ${limit}
        `
    } else if (f === 'low') {
        rows = await prisma.$queryRaw`
            SELECT sku, product_name, rop, soh FROM (
                SELECT p.sku, p.product_name, p.rop,
                    p.stok_awal
                    + COALESCE(SUM(CASE WHEN l.direction = 'IN'  AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
                    - COALESCE(SUM(CASE WHEN l.direction = 'OUT' AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
                    AS soh
                FROM master_products p
                LEFT JOIN inventory_ledger l ON l.sku = p.sku
                WHERE p.is_active = true
                GROUP BY p.sku, p.product_name, p.rop, p.stok_awal, p.last_opname_date
            ) x WHERE soh <= rop
            ORDER BY soh ASC
            LIMIT ${limit}
        `
    } else {
        rows = await prisma.$queryRaw`
            SELECT sku, product_name, rop, soh FROM (
                SELECT p.sku, p.product_name, p.rop,
                    p.stok_awal
                    + COALESCE(SUM(CASE WHEN l.direction = 'IN'  AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
                    - COALESCE(SUM(CASE WHEN l.direction = 'OUT' AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
                    AS soh
                FROM master_products p
                LEFT JOIN inventory_ledger l ON l.sku = p.sku
                WHERE p.is_active = true
                GROUP BY p.sku, p.product_name, p.rop, p.stok_awal, p.last_opname_date
            ) x
            ORDER BY soh ASC
            LIMIT ${limit}
        `
    }

    const filterLabel = f === 'critical' ? 'Stok Habis' : f === 'low' ? 'Stok Kritis (≤ ROP)' : 'Semua Produk'

    return {
        filter: filterLabel,
        count: rows.length,
        products: rows.map(r => ({
            sku: r.sku,
            productName: r.product_name,
            currentStock: Number(r.soh),
            rop: Number(r.rop),
            status: Number(r.soh) <= 0 ? '🔴 HABIS' : Number(r.soh) <= Number(r.rop) ? '🟡 KRITIS' : '🟢 OK',
        })),
    }
}

// ─────────────────────────────────────────────
// Tool 4: Ringkasan order per status
// ─────────────────────────────────────────────
export async function getOrdersSummary(period: string) {
    const range = getDateRange((period || 'today') as Period)

    const rows = await prisma.$queryRaw<any[]>`
        SELECT
            CASE
                WHEN status LIKE 'TERKIRIM%' THEN 'terkirim'
                WHEN status ILIKE '%batal%' OR status ILIKE '%cancel%' OR status ILIKE '%dibatalkan%' THEN 'batal'
                ELSE 'pending'
            END AS grp,
            COUNT(*)::int AS cnt,
            COALESCE(SUM(real_omzet), 0)::bigint AS omzet
        FROM orders
        WHERE trx_date >= ${range.gte} AND trx_date <= ${range.lte}
        GROUP BY grp
    `

    const map = Object.fromEntries(rows.map(r => [r.grp, { count: Number(r.cnt), omzet: Number(r.omzet) }]))
    const terkirim = map['terkirim']  ?? { count: 0, omzet: 0 }
    const pending  = map['pending']   ?? { count: 0, omzet: 0 }
    const batal    = map['batal']     ?? { count: 0, omzet: 0 }
    const total    = terkirim.count + pending.count + batal.count

    // Aging backlog
    const aging = await prisma.$queryRaw<any[]>`
        SELECT
            CASE
                WHEN EXTRACT(EPOCH FROM (NOW() - created_at))/3600 <= 12 THEN '0-12 Jam'
                WHEN EXTRACT(EPOCH FROM (NOW() - created_at))/3600 <= 24 THEN '12-24 Jam'
                WHEN EXTRACT(EPOCH FROM (NOW() - created_at))/3600 <= 48 THEN '24-48 Jam'
                ELSE '>48 Jam'
            END AS bucket,
            COUNT(*)::int AS cnt
        FROM orders
        WHERE status NOT LIKE 'TERKIRIM%'
          AND status NOT ILIKE '%batal%'
          AND status NOT ILIKE '%cancel%'
          AND status NOT ILIKE '%dibatalkan%'
        GROUP BY bucket
        ORDER BY bucket
    `

    return {
        period: range.label,
        total,
        terkirim:  { count: terkirim.count, omzet: formatRp(terkirim.omzet) },
        pending:   { count: pending.count,  omzet: formatRp(pending.omzet)  },
        batal:     { count: batal.count },
        agingBacklog: aging.map(a => ({ bucket: a.bucket, count: Number(a.cnt) })),
    }
}

// ─────────────────────────────────────────────
// Tool 5: Breakdown per platform
// ─────────────────────────────────────────────
export async function getPlatformBreakdown(period: string) {
    const range = getDateRange((period || 'week') as Period)

    const rows = await prisma.$queryRaw<any[]>`
        SELECT
            COALESCE(platform, 'Unknown') AS platform,
            COUNT(*)::int AS cnt,
            COALESCE(SUM(real_omzet), 0)::bigint AS total_omzet,
            SUM(qty)::int AS total_qty
        FROM orders
        WHERE trx_date >= ${range.gte}
          AND trx_date <= ${range.lte}
          AND status NOT ILIKE '%batal%'
          AND status NOT ILIKE '%cancel%'
          AND status NOT ILIKE '%dibatalkan%'
        GROUP BY platform
        ORDER BY total_omzet DESC
    `

    const grandTotal = rows.reduce((s, r) => s + Number(r.total_omzet), 0)

    return {
        period: range.label,
        platforms: rows.map(r => ({
            platform:   r.platform,
            orderCount: Number(r.cnt),
            totalQty:   Number(r.total_qty),
            totalOmzet: formatRp(Number(r.total_omzet)),
            share:      grandTotal > 0 ? ((Number(r.total_omzet) / grandTotal) * 100).toFixed(1) + '%' : '0%',
        })),
        grandTotalOmzet: formatRp(grandTotal),
    }
}
