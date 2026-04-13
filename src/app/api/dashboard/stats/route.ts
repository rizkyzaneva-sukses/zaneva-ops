import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

/**
 * GET /api/dashboard/stats
 * Semua kalkulasi dilakukan di PostgreSQL.
 * Browser hanya terima angka ringkasan — tidak ada array besar.
 * Query param: dateFrom, dateTo (YYYY-MM-DD)
 *
 * FIX: Menggunakan kolom trx_date (DateTime) bukan order_created_at (String)
 * karena order_created_at format campuran TikTok/Shopee tidak reliable untuk comparison.
 */
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)

  const { searchParams } = request.nextUrl
  const dateFrom = searchParams.get('dateFrom') // YYYY-MM-DD
  const dateTo   = searchParams.get('dateTo')   // YYYY-MM-DD

  // Build date filter menggunakan trxDate (DateTime) — reliable untuk semua format
  const dateFilter = dateFrom && dateTo ? {
    trxDate: {
      gte: new Date(dateFrom + 'T00:00:00+07:00'),
      lte: new Date(dateTo   + 'T23:59:59+07:00'),
    }
  } : {}

  // Raw date bounds untuk queryRaw
  const gteDate = dateFrom ? new Date(dateFrom + 'T00:00:00+07:00') : null
  const lteDate = dateTo   ? new Date(dateTo   + 'T23:59:59+07:00') : null

  // ── 1. Semua query dalam 1 Promise.all ──────────────
  const [
    orderStats,
    platformBreakdown,
    agingBacklog,
    walletBalances,
    payoutStats,
    lowStockCount,
    topProvinces,
    omzetByPlatform,
  ] = await Promise.all([

    // Count orders per status group — gunakan trx_date untuk filter
    gteDate && lteDate
      ? prisma.$queryRaw<{ group_key: string; cnt: bigint; total_omzet: bigint }[]>`
          SELECT
            CASE
              WHEN status LIKE 'TERKIRIM%' THEN 'terkirim'
              WHEN status ILIKE '%batal%' OR status ILIKE '%cancel%' OR status ILIKE '%dibatalkan%' THEN 'batal'
              ELSE 'perlu_dikirim'
            END AS group_key,
            COUNT(*) AS cnt,
            COALESCE(SUM(real_omzet), 0) AS total_omzet
          FROM orders
          WHERE trx_date >= ${gteDate} AND trx_date <= ${lteDate}
          GROUP BY group_key
        `
      : prisma.$queryRaw<{ group_key: string; cnt: bigint; total_omzet: bigint }[]>`
          SELECT
            CASE
              WHEN status LIKE 'TERKIRIM%' THEN 'terkirim'
              WHEN status ILIKE '%batal%' OR status ILIKE '%cancel%' OR status ILIKE '%dibatalkan%' THEN 'batal'
              ELSE 'perlu_dikirim'
            END AS group_key,
            COUNT(*) AS cnt,
            COALESCE(SUM(real_omzet), 0) AS total_omzet
          FROM orders
          GROUP BY group_key
        `,

    // Count per platform
    prisma.order.groupBy({
      by: ['platform'],
      where: { ...dateFilter },
      _count: { id: true },
      _sum: { realOmzet: true },
    }),

    // Aging backlog — order perlu dikirim, grouped by jam (always all-time, no date filter)
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
      ORDER BY MIN(created_at)
    `,

    // Wallet balances
    prisma.$queryRaw<{ wallet_id: string; name: string; balance: bigint }[]>`
      SELECT w.id AS wallet_id, w.name, COALESCE(SUM(l.amount), 0) AS balance
      FROM wallets w
      LEFT JOIN wallet_ledger l ON l.wallet_id = w.id
      WHERE w.is_active = true
      GROUP BY w.id, w.name
      ORDER BY w.name
    `,

    // Payout stats dalam range
    prisma.payout.aggregate({
      where: dateFrom ? {
        releasedDate: { gte: new Date(dateFrom), lte: new Date(dateTo + 'T23:59:59') }
      } : {},
      _sum: { totalIncome: true, omzet: true },
      _count: { id: true },
    }),

    // Low stock count (gunakan SQL sama dengan inventory)
    prisma.$queryRaw<{ cnt: bigint }[]>`
      SELECT COUNT(*) AS cnt
      FROM (
        SELECT p.sku,
          p.stok_awal
          + COALESCE(SUM(CASE WHEN l.direction = 'IN' AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN l.direction = 'OUT' AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
          AS soh,
          p.rop
        FROM master_products p
        LEFT JOIN inventory_ledger l ON l.sku = p.sku
        WHERE p.is_active = true
        GROUP BY p.sku, p.stok_awal, p.rop, p.last_opname_date
      ) soh_calc
      WHERE soh <= rop
    `,

    // Top 5 provinsi order dalam range
    prisma.order.groupBy({
      by: ['province'],
      where: { ...dateFilter, province: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    }),

    // Omzet per platform dalam range
    prisma.order.groupBy({
      by: ['platform'],
      where: {
        ...dateFilter,
        NOT: [
          { status: { contains: 'batal' } },
          { status: { contains: 'Cancel' } },
          { status: { contains: 'Dibatalkan' } },
        ],
      },
      _sum: { realOmzet: true, hpp: true },
      _count: { id: true },
    }),
  ])

  // ── Format hasil ───────────────────────────────────

  // Order stats
  const statsMap = Object.fromEntries(
    (orderStats as any[]).map((r: any) => [
      r.group_key,
      { count: Number(r.cnt), omzet: Number(r.total_omzet) }
    ])
  )

  // Aging buckets
  const agingOrder = ['0-12 Jam', '12-24 Jam', '24-48 Jam', '>48 Jam']
  const agingMap = Object.fromEntries(
    (agingBacklog as any[]).map((r: any) => [r.bucket, Number(r.cnt)])
  )
  const aging = agingOrder.map(b => ({ label: b, count: agingMap[b] ?? 0 }))

  // Total saldo
  const totalSaldo = (walletBalances as any[]).reduce((s, w) => s + Number(w.balance), 0)

  return apiSuccess({
    dateFrom,
    dateTo,
    orders: {
      perluDikirim: statsMap['perlu_dikirim']?.count ?? 0,
      terkirim: statsMap['terkirim']?.count ?? 0,
      batal: statsMap['batal']?.count ?? 0,
      total: Object.values(statsMap).reduce((s: number, v: any) => s + v.count, 0),
    },
    omzet: {
      byPlatform: omzetByPlatform.map(p => ({
        platform: p.platform,
        realOmzet: p._sum.realOmzet ?? 0,
        hpp: p._sum.hpp ?? 0,
        count: p._count.id,
        grossProfit: (p._sum.realOmzet ?? 0) - (p._sum.hpp ?? 0),
      })),
      total: omzetByPlatform.reduce((s, p) => s + (p._sum.realOmzet ?? 0), 0),
      totalHpp: omzetByPlatform.reduce((s, p) => s + (p._sum.hpp ?? 0), 0),
    },
    aging,
    wallet: {
      wallets: (walletBalances as any[]).map(w => ({
        id: w.wallet_id,
        name: w.name,
        balance: Number(w.balance),
      })),
      totalSaldo,
    },
    payout: {
      count: payoutStats._count.id,
      totalIncome: payoutStats._sum.totalIncome ?? 0,
      totalOmzet: payoutStats._sum.omzet ?? 0,
    },
    stock: {
      lowStockCount: Number((lowStockCount as any[])[0]?.cnt ?? 0),
    },
    geo: {
      topProvinces: topProvinces.map(p => ({
        province: p.province,
        count: p._count.id,
      })),
    },
  })
}
