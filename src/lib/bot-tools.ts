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

interface DateRangeResult {
    gte: Date
    lte: Date
    label: string
}

function getDateRange(period: Period): DateRangeResult {
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

function fmtWIBDate(d: Date): string {
    const wib = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))
    const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des']
    return `${wib.getDate()} ${months[wib.getMonth()]} ${wib.getFullYear()}`
}

function getCustomDateRange(startDate: string, endDate?: string): DateRangeResult {
    const gte = new Date(startDate + 'T00:00:00+07:00')
    const lteStr = endDate || startDate
    const lte = new Date(lteStr + 'T23:59:59+07:00')
    const label = endDate && endDate !== startDate
        ? `${fmtWIBDate(gte)} – ${fmtWIBDate(lte)}`
        : fmtWIBDate(gte)
    return { gte, lte, label }
}

function resolveRange(period?: string, startDate?: string, endDate?: string): DateRangeResult {
    if (startDate) return getCustomDateRange(startDate, endDate)
    return getDateRange((period || 'today') as Period)
}

function formatRp(n: number) {
    return 'Rp ' + Math.round(n).toLocaleString('id-ID')
}

// ─────────────────────────────────────────────
// Tool 1: Ranking produk terlaris
// ─────────────────────────────────────────────
export async function getSalesRanking(period?: string, limit: number = 10, startDate?: string, endDate?: string) {
    const range = resolveRange(period || 'week', startDate, endDate)

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
export async function getRevenueSummary(period?: string, startDate?: string, endDate?: string) {
    const range = resolveRange(period || 'today', startDate, endDate)

    // Gunakan GROUP BY status (sama dengan daily-report & dashboard) agar HPP terhitung benar
    const rows = await prisma.$queryRaw<any[]>`
        SELECT
            CASE
                WHEN status ILIKE '%batal%' OR status ILIKE '%cancel%' OR status ILIKE '%dibatalkan%' THEN 'batal'
                ELSE 'valid'
            END AS grp,
            COUNT(*)::int AS cnt,
            COALESCE(SUM(real_omzet), 0)::bigint AS total_omzet,
            COALESCE(SUM(hpp * qty), 0)::bigint AS total_hpp
        FROM orders
        WHERE trx_date >= ${range.gte} AND trx_date <= ${range.lte}
        GROUP BY grp
    `

    const map = Object.fromEntries(rows.map(r => [
        r.grp,
        { cnt: Number(r.cnt), omzet: Number(r.total_omzet), hpp: Number(r.total_hpp) }
    ]))
    const valid = map['valid'] ?? { cnt: 0, omzet: 0, hpp: 0 }
    const batal = map['batal'] ?? { cnt: 0, omzet: 0, hpp: 0 }
    const omzet = valid.omzet
    const hpp   = valid.hpp
    const gp    = omzet - hpp

    return {
        period: range.label,
        totalOrders: valid.cnt + batal.cnt,
        validOrders: valid.cnt,
        batalCount:  batal.cnt,
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
export async function getOrdersSummary(period?: string, startDate?: string, endDate?: string) {
    const range = resolveRange(period || 'today', startDate, endDate)

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
export async function getPlatformBreakdown(period?: string, startDate?: string, endDate?: string) {
    const range = resolveRange(period || 'week', startDate, endDate)

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

// ─────────────────────────────────────────────
// Tool 6: Wallet summary — saldo per wallet & posisi kas
// ─────────────────────────────────────────────
export async function getWalletSummary() {
    // Saldo per wallet aktif (SUM amount dari wallet_ledger karena sign sudah benar di DB)
    const walletRows = await prisma.$queryRaw<any[]>`
        SELECT
            w.id,
            w.name,
            w.is_active AS is_active,
            w.is_ads_budget AS is_ads_budget,
            w.linked_platform AS linked_platform,
            COALESCE(SUM(l.amount), 0)::bigint AS balance,
            COUNT(l.id)::int AS trx_count
        FROM wallets w
        LEFT JOIN wallet_ledger l ON l.wallet_id = w.id
        GROUP BY w.id, w.name, w.is_active, w.is_ads_budget, w.linked_platform
        ORDER BY w.is_active DESC, balance DESC
    `

    // Recent transactions (10 terakhir)
    const recentRows = await prisma.$queryRaw<any[]>`
        SELECT
            l.trx_date,
            l.trx_type,
            l.category,
            l.amount,
            l.note,
            w.name AS wallet_name
        FROM wallet_ledger l
        JOIN wallets w ON w.id = l.wallet_id
        ORDER BY l.trx_date DESC, l.created_at DESC
        LIMIT 10
    `

    const totalCash = walletRows
        .filter(r => r.is_active)
        .reduce((s, r) => s + Number(r.balance), 0)

    const adsBudgetTotal = walletRows
        .filter(r => r.is_active && r.is_ads_budget)
        .reduce((s, r) => s + Number(r.balance), 0)

    return {
        totalCashPosition: formatRp(totalCash),
        adsBudgetTotal: formatRp(adsBudgetTotal),
        activeWalletCount: walletRows.filter(r => r.is_active).length,
        wallets: walletRows.map(r => ({
            name: r.name,
            balance: formatRp(Number(r.balance)),
            balanceRaw: Number(r.balance),
            isActive: r.is_active,
            isAdsBudget: r.is_ads_budget,
            linkedPlatform: r.linked_platform || null,
            trxCount: Number(r.trx_count),
        })),
        recentTransactions: recentRows.map(r => ({
            date: fmtWIBDate(new Date(r.trx_date)),
            wallet: r.wallet_name,
            type: r.trx_type,
            category: r.category || '-',
            amount: formatRp(Number(r.amount)),
            note: r.note || '',
        })),
    }
}

// ─────────────────────────────────────────────
// Tool 7: Expense breakdown per kategori
// ─────────────────────────────────────────────
export async function getExpenseBreakdown(period?: string, startDate?: string, endDate?: string) {
    const range = resolveRange(period || 'month', startDate, endDate)

    const rows = await prisma.$queryRaw<any[]>`
        SELECT
            COALESCE(category, '(Tanpa Kategori)') AS category,
            COUNT(*)::int AS trx_count,
            COALESCE(SUM(ABS(amount)), 0)::bigint AS total_amount
        FROM wallet_ledger
        WHERE trx_type = 'EXPENSE'
          AND trx_date >= ${range.gte}
          AND trx_date <= ${range.lte}
        GROUP BY category
        ORDER BY total_amount DESC
    `

    const grandTotal = rows.reduce((s, r) => s + Number(r.total_amount), 0)

    return {
        period: range.label,
        totalExpense: formatRp(grandTotal),
        categoryCount: rows.length,
        breakdown: rows.map(r => ({
            category: r.category,
            trxCount: Number(r.trx_count),
            total: formatRp(Number(r.total_amount)),
            share: grandTotal > 0 ? ((Number(r.total_amount) / grandTotal) * 100).toFixed(1) + '%' : '0%',
        })),
    }
}

// ─────────────────────────────────────────────
// Tool 8: Payout summary per platform
// ─────────────────────────────────────────────
export async function getPayoutSummary(period?: string, startDate?: string, endDate?: string) {
    const range = resolveRange(period || 'month', startDate, endDate)

    const rows = await prisma.$queryRaw<any[]>`
        SELECT
            COALESCE(platform, 'Unknown') AS platform,
            COUNT(*)::int AS payout_count,
            COALESCE(SUM(omzet), 0)::bigint AS total_omzet,
            COALESCE(SUM(platform_fee), 0)::bigint AS total_platform_fee,
            COALESCE(SUM(ams_fee), 0)::bigint AS total_ams_fee,
            COALESCE(SUM(platform_fee_other), 0)::bigint AS total_other_fee,
            COALESCE(SUM(beban_ongkir), 0)::bigint AS total_beban_ongkir,
            COALESCE(SUM(total_income), 0)::bigint AS total_income
        FROM payouts
        WHERE released_date >= ${range.gte}
          AND released_date <= ${range.lte}
        GROUP BY platform
        ORDER BY total_income DESC
    `

    const grandIncome = rows.reduce((s, r) => s + Number(r.total_income), 0)
    const grandOmzet = rows.reduce((s, r) => s + Number(r.total_omzet), 0)
    const grandFees = rows.reduce(
        (s, r) =>
            s +
            Number(r.total_platform_fee) +
            Number(r.total_ams_fee) +
            Number(r.total_other_fee) +
            Number(r.total_beban_ongkir),
        0
    )

    return {
        period: range.label,
        totalPayoutIncome: formatRp(grandIncome),
        totalOmzet: formatRp(grandOmzet),
        totalFees: formatRp(grandFees),
        netRatio: grandOmzet > 0 ? ((grandIncome / grandOmzet) * 100).toFixed(1) + '%' : '0%',
        platforms: rows.map(r => ({
            platform: r.platform,
            payoutCount: Number(r.payout_count),
            omzet: formatRp(Number(r.total_omzet)),
            platformFee: formatRp(Number(r.total_platform_fee)),
            amsFee: formatRp(Number(r.total_ams_fee)),
            otherFee: formatRp(Number(r.total_other_fee)),
            bebanOngkir: formatRp(Number(r.total_beban_ongkir)),
            netIncome: formatRp(Number(r.total_income)),
            share: grandIncome > 0 ? ((Number(r.total_income) / grandIncome) * 100).toFixed(1) + '%' : '0%',
        })),
    }
}

// ─────────────────────────────────────────────
// Tool 9: Utang & Piutang outstanding
// ─────────────────────────────────────────────
export async function getUtangPiutangSummary() {
    const nowWIB = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))
    const in7DaysWIB = new Date(nowWIB)
    in7DaysWIB.setDate(in7DaysWIB.getDate() + 7)

    // Utang outstanding
    const utangRows = await prisma.$queryRaw<any[]>`
        SELECT
            id,
            type,
            creditor_name,
            source_wallet_name,
            amount,
            amount_paid,
            (amount - amount_paid)::bigint AS sisa,
            trx_date,
            due_date,
            status
        FROM utangs
        WHERE status IN ('OUTSTANDING', 'PARTIAL')
        ORDER BY due_date ASC NULLS LAST, trx_date ASC
    `

    // Piutang outstanding
    const piutangRows = await prisma.$queryRaw<any[]>`
        SELECT
            id,
            type,
            debtor_name,
            source_wallet_name,
            amount,
            amount_collected,
            (amount - amount_collected)::bigint AS sisa,
            trx_date,
            due_date,
            status
        FROM piutangs
        WHERE status IN ('OUTSTANDING', 'PARTIAL')
        ORDER BY due_date ASC NULLS LAST, trx_date ASC
    `

    const totalUtang = utangRows.reduce((s, r) => s + Number(r.sisa), 0)
    const totalPiutang = piutangRows.reduce((s, r) => s + Number(r.sisa), 0)

    const isApproachingDue = (dueDate: any): boolean => {
        if (!dueDate) return false
        const d = new Date(dueDate)
        return d <= in7DaysWIB
    }
    const isOverdue = (dueDate: any): boolean => {
        if (!dueDate) return false
        const d = new Date(dueDate)
        return d < nowWIB
    }

    return {
        netPosition: formatRp(totalPiutang - totalUtang),
        utang: {
            count: utangRows.length,
            totalOutstanding: formatRp(totalUtang),
            approachingDue: utangRows.filter(r => isApproachingDue(r.due_date) && !isOverdue(r.due_date)).length,
            overdue: utangRows.filter(r => isOverdue(r.due_date)).length,
            items: utangRows.slice(0, 15).map(r => ({
                creditor: r.creditor_name,
                type: r.type,
                amount: formatRp(Number(r.amount)),
                paid: formatRp(Number(r.amount_paid)),
                sisa: formatRp(Number(r.sisa)),
                trxDate: fmtWIBDate(new Date(r.trx_date)),
                dueDate: r.due_date ? fmtWIBDate(new Date(r.due_date)) : null,
                status: r.status,
                isOverdue: isOverdue(r.due_date),
                isApproachingDue: isApproachingDue(r.due_date) && !isOverdue(r.due_date),
            })),
        },
        piutang: {
            count: piutangRows.length,
            totalOutstanding: formatRp(totalPiutang),
            approachingDue: piutangRows.filter(r => isApproachingDue(r.due_date) && !isOverdue(r.due_date)).length,
            overdue: piutangRows.filter(r => isOverdue(r.due_date)).length,
            items: piutangRows.slice(0, 15).map(r => ({
                debtor: r.debtor_name,
                type: r.type,
                amount: formatRp(Number(r.amount)),
                collected: formatRp(Number(r.amount_collected)),
                sisa: formatRp(Number(r.sisa)),
                trxDate: fmtWIBDate(new Date(r.trx_date)),
                dueDate: r.due_date ? fmtWIBDate(new Date(r.due_date)) : null,
                status: r.status,
                isOverdue: isOverdue(r.due_date),
                isApproachingDue: isApproachingDue(r.due_date) && !isOverdue(r.due_date),
            })),
        },
    }
}

// ─────────────────────────────────────────────
// Tool 10: Purchase Order status
// ─────────────────────────────────────────────
export async function getPurchaseOrderStatus(filter: 'open' | 'overdue' | 'all' = 'open') {
    const nowWIB = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))

    let rows: any[]
    if (filter === 'overdue') {
        rows = await prisma.$queryRaw<any[]>`
            SELECT
                id, po_number, vendor_name, po_date, expected_date,
                status, payment_status,
                total_items, total_qty_order, total_qty_received,
                total_amount, total_paid
            FROM purchase_orders
            WHERE status IN ('OPEN', 'PARTIAL')
              AND expected_date IS NOT NULL
              AND expected_date < ${nowWIB}
            ORDER BY expected_date ASC
        `
    } else if (filter === 'all') {
        rows = await prisma.$queryRaw<any[]>`
            SELECT
                id, po_number, vendor_name, po_date, expected_date,
                status, payment_status,
                total_items, total_qty_order, total_qty_received,
                total_amount, total_paid
            FROM purchase_orders
            ORDER BY po_date DESC
            LIMIT 50
        `
    } else {
        rows = await prisma.$queryRaw<any[]>`
            SELECT
                id, po_number, vendor_name, po_date, expected_date,
                status, payment_status,
                total_items, total_qty_order, total_qty_received,
                total_amount, total_paid
            FROM purchase_orders
            WHERE status IN ('OPEN', 'PARTIAL')
            ORDER BY expected_date ASC NULLS LAST, po_date ASC
        `
    }

    const totalAmount = rows.reduce((s, r) => s + Number(r.total_amount), 0)
    const totalPaid = rows.reduce((s, r) => s + Number(r.total_paid), 0)
    const totalUnpaid = totalAmount - totalPaid
    const overdueCount = rows.filter(
        r => r.expected_date && new Date(r.expected_date) < nowWIB && r.status !== 'COMPLETED' && r.status !== 'CANCELLED'
    ).length

    const filterLabel =
        filter === 'overdue' ? 'PO Overdue (lewat tanggal kirim)' :
        filter === 'all' ? 'Semua PO (50 terakhir)' :
        'PO Belum Selesai (OPEN/PARTIAL)'

    return {
        filter: filterLabel,
        count: rows.length,
        overdueCount,
        totalAmount: formatRp(totalAmount),
        totalPaid: formatRp(totalPaid),
        totalUnpaid: formatRp(totalUnpaid),
        items: rows.slice(0, 25).map(r => {
            const isOverdueItem =
                r.expected_date &&
                new Date(r.expected_date) < nowWIB &&
                r.status !== 'COMPLETED' &&
                r.status !== 'CANCELLED'
            const fulfillmentPct = r.total_qty_order > 0
                ? Math.round((Number(r.total_qty_received) / Number(r.total_qty_order)) * 100)
                : 0
            return {
                poNumber: r.po_number,
                vendor: r.vendor_name,
                poDate: fmtWIBDate(new Date(r.po_date)),
                expectedDate: r.expected_date ? fmtWIBDate(new Date(r.expected_date)) : null,
                status: r.status,
                paymentStatus: r.payment_status,
                qtyOrder: Number(r.total_qty_order),
                qtyReceived: Number(r.total_qty_received),
                fulfillmentPct: fulfillmentPct + '%',
                totalAmount: formatRp(Number(r.total_amount)),
                totalPaid: formatRp(Number(r.total_paid)),
                sisaBayar: formatRp(Number(r.total_amount) - Number(r.total_paid)),
                isOverdue: isOverdueItem,
            }
        }),
    }
}

// ─────────────────────────────────────────────
// Tool 11: Dead stock — produk dengan stok tinggi tapi tidak ada penjualan
// ─────────────────────────────────────────────
export async function getDeadStock(days: number = 30, limit: number = 25) {
    const nowWIB = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))
    const cutoffDate = new Date(nowWIB)
    cutoffDate.setDate(cutoffDate.getDate() - days)

    // Cari produk dengan stok > 0 tapi qty_terjual = 0 dalam N hari terakhir
    const rows = await prisma.$queryRaw<any[]>`
        WITH stock_calc AS (
            SELECT p.sku, p.product_name, p.hpp, p.rop,
                p.stok_awal
                + COALESCE(SUM(CASE WHEN l.direction = 'IN'  AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
                - COALESCE(SUM(CASE WHEN l.direction = 'OUT' AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
                AS soh
            FROM master_products p
            LEFT JOIN inventory_ledger l ON l.sku = p.sku
            WHERE p.is_active = true
            GROUP BY p.sku, p.product_name, p.hpp, p.rop, p.stok_awal, p.last_opname_date
        ),
        sales_recent AS (
            SELECT sku, COALESCE(SUM(qty), 0)::int AS qty_sold
            FROM orders
            WHERE trx_date >= ${cutoffDate}
              AND status NOT ILIKE '%batal%'
              AND status NOT ILIKE '%cancel%'
              AND status NOT ILIKE '%dibatalkan%'
            GROUP BY sku
        )
        SELECT
            s.sku,
            s.product_name,
            s.soh,
            s.hpp,
            s.rop,
            COALESCE(sr.qty_sold, 0)::int AS qty_sold,
            (s.soh * s.hpp)::bigint AS dead_value
        FROM stock_calc s
        LEFT JOIN sales_recent sr ON sr.sku = s.sku
        WHERE s.soh > 0
          AND COALESCE(sr.qty_sold, 0) = 0
        ORDER BY dead_value DESC
        LIMIT ${limit}
    `

    const totalDeadValue = rows.reduce((s, r) => s + Number(r.dead_value), 0)

    return {
        period: `${days} hari terakhir`,
        count: rows.length,
        totalDeadValue: formatRp(totalDeadValue),
        products: rows.map(r => ({
            sku: r.sku,
            productName: r.product_name,
            currentStock: Number(r.soh),
            qtySoldRecent: Number(r.qty_sold),
            hpp: formatRp(Number(r.hpp)),
            deadValue: formatRp(Number(r.dead_value)),
            rop: Number(r.rop),
        })),
    }
}

// ─────────────────────────────────────────────
// Tool 12: Geo analysis — top kota/provinsi
// ─────────────────────────────────────────────
export async function getGeoAnalysis(period?: string, startDate?: string, endDate?: string, limit: number = 10) {
    const range = resolveRange(period || 'week', startDate, endDate)

    const cityRows = await prisma.$queryRaw<any[]>`
        SELECT
            COALESCE(NULLIF(TRIM(city), ''), '(Tidak Diketahui)') AS city,
            COALESCE(NULLIF(TRIM(province), ''), '-') AS province,
            COUNT(*)::int AS order_count,
            SUM(qty)::int AS total_qty,
            COALESCE(SUM(real_omzet), 0)::bigint AS total_omzet
        FROM orders
        WHERE trx_date >= ${range.gte}
          AND trx_date <= ${range.lte}
          AND status NOT ILIKE '%batal%'
          AND status NOT ILIKE '%cancel%'
          AND status NOT ILIKE '%dibatalkan%'
        GROUP BY city, province
        ORDER BY order_count DESC
        LIMIT ${limit}
    `

    const provinceRows = await prisma.$queryRaw<any[]>`
        SELECT
            COALESCE(NULLIF(TRIM(province), ''), '(Tidak Diketahui)') AS province,
            COUNT(*)::int AS order_count,
            COUNT(DISTINCT city)::int AS city_count,
            SUM(qty)::int AS total_qty,
            COALESCE(SUM(real_omzet), 0)::bigint AS total_omzet
        FROM orders
        WHERE trx_date >= ${range.gte}
          AND trx_date <= ${range.lte}
          AND status NOT ILIKE '%batal%'
          AND status NOT ILIKE '%cancel%'
          AND status NOT ILIKE '%dibatalkan%'
        GROUP BY province
        ORDER BY order_count DESC
        LIMIT ${limit}
    `

    const totalOrders = cityRows.reduce((s, r) => s + Number(r.order_count), 0)

    return {
        period: range.label,
        topCities: cityRows.map((r, i) => ({
            rank: i + 1,
            city: r.city,
            province: r.province,
            orderCount: Number(r.order_count),
            totalQty: Number(r.total_qty),
            totalOmzet: formatRp(Number(r.total_omzet)),
            share: totalOrders > 0 ? ((Number(r.order_count) / totalOrders) * 100).toFixed(1) + '%' : '0%',
        })),
        topProvinces: provinceRows.map((r, i) => ({
            rank: i + 1,
            province: r.province,
            cityCount: Number(r.city_count),
            orderCount: Number(r.order_count),
            totalQty: Number(r.total_qty),
            totalOmzet: formatRp(Number(r.total_omzet)),
        })),
    }
}

// ─────────────────────────────────────────────
// Tool 13: Customer analysis — repeat buyer & new vs returning
// ─────────────────────────────────────────────
export async function getCustomerAnalysis(period?: string, startDate?: string, endDate?: string, limit: number = 15) {
    const range = resolveRange(period || 'month', startDate, endDate)

    // Top buyers in period (use buyer_username || receiver_name as identity)
    const topBuyers = await prisma.$queryRaw<any[]>`
        SELECT
            COALESCE(NULLIF(TRIM(buyer_username), ''), NULLIF(TRIM(receiver_name), ''), '(Anonim)') AS buyer,
            COUNT(DISTINCT order_no)::int AS order_count,
            SUM(qty)::int AS total_qty,
            COALESCE(SUM(real_omzet), 0)::bigint AS total_omzet
        FROM orders
        WHERE trx_date >= ${range.gte}
          AND trx_date <= ${range.lte}
          AND status NOT ILIKE '%batal%'
          AND status NOT ILIKE '%cancel%'
          AND status NOT ILIKE '%dibatalkan%'
        GROUP BY buyer
        ORDER BY total_omzet DESC
        LIMIT ${limit}
    `

    // Repeat customer analysis: buyers who appear before period AND in period = returning
    const repeatStats = await prisma.$queryRaw<any[]>`
        WITH buyers_in_period AS (
            SELECT DISTINCT
                COALESCE(NULLIF(TRIM(buyer_username), ''), NULLIF(TRIM(receiver_name), '')) AS buyer
            FROM orders
            WHERE trx_date >= ${range.gte}
              AND trx_date <= ${range.lte}
              AND status NOT ILIKE '%batal%'
              AND status NOT ILIKE '%cancel%'
              AND status NOT ILIKE '%dibatalkan%'
              AND COALESCE(NULLIF(TRIM(buyer_username), ''), NULLIF(TRIM(receiver_name), '')) IS NOT NULL
        ),
        buyers_before AS (
            SELECT DISTINCT
                COALESCE(NULLIF(TRIM(buyer_username), ''), NULLIF(TRIM(receiver_name), '')) AS buyer
            FROM orders
            WHERE trx_date < ${range.gte}
              AND status NOT ILIKE '%batal%'
              AND status NOT ILIKE '%cancel%'
              AND status NOT ILIKE '%dibatalkan%'
              AND COALESCE(NULLIF(TRIM(buyer_username), ''), NULLIF(TRIM(receiver_name), '')) IS NOT NULL
        )
        SELECT
            (SELECT COUNT(*)::int FROM buyers_in_period) AS total_unique,
            (SELECT COUNT(*)::int FROM buyers_in_period bp INNER JOIN buyers_before bb ON bp.buyer = bb.buyer) AS returning_count
    `

    // Repeat buyer count (>1 order in period)
    const repeatInPeriod = await prisma.$queryRaw<any[]>`
        SELECT
            buyer,
            order_count
        FROM (
            SELECT
                COALESCE(NULLIF(TRIM(buyer_username), ''), NULLIF(TRIM(receiver_name), '')) AS buyer,
                COUNT(DISTINCT order_no)::int AS order_count
            FROM orders
            WHERE trx_date >= ${range.gte}
              AND trx_date <= ${range.lte}
              AND status NOT ILIKE '%batal%'
              AND status NOT ILIKE '%cancel%'
              AND status NOT ILIKE '%dibatalkan%'
              AND COALESCE(NULLIF(TRIM(buyer_username), ''), NULLIF(TRIM(receiver_name), '')) IS NOT NULL
            GROUP BY buyer
        ) x
        WHERE order_count > 1
    `

    const stats = repeatStats[0] || { total_unique: 0, returning_count: 0 }
    const totalUnique = Number(stats.total_unique)
    const returning = Number(stats.returning_count)
    const newBuyers = totalUnique - returning
    const repeatInPeriodCount = repeatInPeriod.length

    return {
        period: range.label,
        uniqueBuyers: totalUnique,
        newBuyers,
        returningBuyers: returning,
        returningRate: totalUnique > 0 ? ((returning / totalUnique) * 100).toFixed(1) + '%' : '0%',
        repeatBuyersInPeriod: repeatInPeriodCount,
        repeatRateInPeriod: totalUnique > 0 ? ((repeatInPeriodCount / totalUnique) * 100).toFixed(1) + '%' : '0%',
        topBuyers: topBuyers.map((r, i) => ({
            rank: i + 1,
            buyer: r.buyer,
            orderCount: Number(r.order_count),
            totalQty: Number(r.total_qty),
            totalOmzet: formatRp(Number(r.total_omzet)),
        })),
    }
}

// ─────────────────────────────────────────────
// Tool 14: Scan & fulfillment performance
// ─────────────────────────────────────────────
export async function getScanFulfillment(period?: string, startDate?: string, endDate?: string) {
    const range = resolveRange(period || 'today', startDate, endDate)

    // Total order vs scanned dalam period (berdasarkan trx_date order)
    const summary = await prisma.$queryRaw<any[]>`
        SELECT
            COUNT(DISTINCT o.id)::int AS total_orders,
            COUNT(DISTINCT CASE WHEN sl.id IS NOT NULL THEN o.id END)::int AS scanned_orders
        FROM orders o
        LEFT JOIN order_scan_logs sl ON sl.order_id = o.id
        WHERE o.trx_date >= ${range.gte}
          AND o.trx_date <= ${range.lte}
          AND o.status NOT ILIKE '%batal%'
          AND o.status NOT ILIKE '%cancel%'
          AND o.status NOT ILIKE '%dibatalkan%'
    `

    // Average fulfillment time (jam) — dari created_at ke scanned_at
    const avgRow = await prisma.$queryRaw<any[]>`
        SELECT
            COALESCE(
                AVG(EXTRACT(EPOCH FROM (sl.scanned_at - o.created_at)) / 3600.0),
                0
            )::float AS avg_hours
        FROM orders o
        INNER JOIN order_scan_logs sl ON sl.order_id = o.id
        WHERE o.trx_date >= ${range.gte}
          AND o.trx_date <= ${range.lte}
          AND o.status NOT ILIKE '%batal%'
          AND o.status NOT ILIKE '%cancel%'
          AND o.status NOT ILIKE '%dibatalkan%'
          AND sl.scanned_at >= o.created_at
    `

    // Scan progress hari ini (siapa yang scan, berapa banyak)
    const todayWIB = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))
    const y = todayWIB.getFullYear()
    const m = String(todayWIB.getMonth() + 1).padStart(2, '0')
    const d = String(todayWIB.getDate()).padStart(2, '0')
    const todayStr = `${y}-${m}-${d}`
    const todayGte = new Date(todayStr + 'T00:00:00+07:00')
    const todayLte = new Date(todayStr + 'T23:59:59+07:00')

    const todayScans = await prisma.$queryRaw<any[]>`
        SELECT
            COALESCE(scanned_by, '(Unknown)') AS scanned_by,
            COUNT(*)::int AS scan_count,
            COUNT(DISTINCT order_no)::int AS unique_orders
        FROM order_scan_logs
        WHERE scanned_at >= ${todayGte}
          AND scanned_at <= ${todayLte}
        GROUP BY scanned_by
        ORDER BY scan_count DESC
    `

    // Pending unscanned (orders in period yang belum di-scan, status non-terkirim)
    const unscannedAging = await prisma.$queryRaw<any[]>`
        SELECT
            CASE
                WHEN EXTRACT(EPOCH FROM (NOW() - o.created_at))/3600 <= 12 THEN '0-12 Jam'
                WHEN EXTRACT(EPOCH FROM (NOW() - o.created_at))/3600 <= 24 THEN '12-24 Jam'
                WHEN EXTRACT(EPOCH FROM (NOW() - o.created_at))/3600 <= 48 THEN '24-48 Jam'
                ELSE '>48 Jam'
            END AS bucket,
            COUNT(*)::int AS cnt
        FROM orders o
        LEFT JOIN order_scan_logs sl ON sl.order_id = o.id
        WHERE sl.id IS NULL
          AND o.status NOT LIKE 'TERKIRIM%'
          AND o.status NOT ILIKE '%batal%'
          AND o.status NOT ILIKE '%cancel%'
          AND o.status NOT ILIKE '%dibatalkan%'
        GROUP BY bucket
        ORDER BY bucket
    `

    const s = summary[0] || { total_orders: 0, scanned_orders: 0 }
    const totalOrders = Number(s.total_orders)
    const scannedOrders = Number(s.scanned_orders)
    const unscanned = totalOrders - scannedOrders
    const avgHours = Number(avgRow[0]?.avg_hours || 0)
    const todayScanTotal = todayScans.reduce((acc, r) => acc + Number(r.scan_count), 0)

    return {
        period: range.label,
        totalOrders,
        scannedOrders,
        unscannedOrders: unscanned,
        scanProgress: totalOrders > 0 ? ((scannedOrders / totalOrders) * 100).toFixed(1) + '%' : '0%',
        avgFulfillmentHours: avgHours.toFixed(1),
        todayScanTotal,
        todayScanByOperator: todayScans.map(r => ({
            operator: r.scanned_by,
            scanCount: Number(r.scan_count),
            uniqueOrders: Number(r.unique_orders),
        })),
        unscannedAging: unscannedAging.map(r => ({ bucket: r.bucket, count: Number(r.cnt) })),
    }
}

// ─────────────────────────────────────────────
// Tool 15: Period comparison (helper) — bandingkan dua range
// ─────────────────────────────────────────────
export async function getPeriodComparison(
    currentStart: string,
    currentEnd: string,
    previousStart: string,
    previousEnd: string
) {
    const cur = getCustomDateRange(currentStart, currentEnd)
    const prev = getCustomDateRange(previousStart, previousEnd)

    const fetchSummary = async (gte: Date, lte: Date) => {
        const rows = await prisma.$queryRaw<any[]>`
            SELECT
                COUNT(*)::int AS order_count,
                SUM(qty)::int AS total_qty,
                COALESCE(SUM(real_omzet), 0)::bigint AS total_omzet,
                COALESCE(SUM(hpp * qty), 0)::bigint AS total_hpp
            FROM orders
            WHERE trx_date >= ${gte}
              AND trx_date <= ${lte}
              AND status NOT ILIKE '%batal%'
              AND status NOT ILIKE '%cancel%'
              AND status NOT ILIKE '%dibatalkan%'
        `
        const r = rows[0] || { order_count: 0, total_qty: 0, total_omzet: 0, total_hpp: 0 }
        const omzet = Number(r.total_omzet)
        const hpp = Number(r.total_hpp)
        return {
            orderCount: Number(r.order_count),
            totalQty: Number(r.total_qty || 0),
            omzet,
            hpp,
            grossProfit: omzet - hpp,
        }
    }

    const [curStats, prevStats] = await Promise.all([
        fetchSummary(cur.gte, cur.lte),
        fetchSummary(prev.gte, prev.lte),
    ])

    const pct = (a: number, b: number): string => {
        if (b === 0) return a > 0 ? '+∞%' : '0%'
        const v = ((a - b) / b) * 100
        return (v >= 0 ? '+' : '') + v.toFixed(1) + '%'
    }

    return {
        currentPeriod: cur.label,
        previousPeriod: prev.label,
        current: {
            orderCount: curStats.orderCount,
            totalQty: curStats.totalQty,
            omzet: formatRp(curStats.omzet),
            hpp: formatRp(curStats.hpp),
            grossProfit: formatRp(curStats.grossProfit),
        },
        previous: {
            orderCount: prevStats.orderCount,
            totalQty: prevStats.totalQty,
            omzet: formatRp(prevStats.omzet),
            hpp: formatRp(prevStats.hpp),
            grossProfit: formatRp(prevStats.grossProfit),
        },
        growth: {
            orderCount: pct(curStats.orderCount, prevStats.orderCount),
            totalQty: pct(curStats.totalQty, prevStats.totalQty),
            omzet: pct(curStats.omzet, prevStats.omzet),
            grossProfit: pct(curStats.grossProfit, prevStats.grossProfit),
        },
    }
}
