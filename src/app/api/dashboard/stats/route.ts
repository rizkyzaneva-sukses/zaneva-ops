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

  // Periode pembanding (panjang sama, mundur ke belakang) untuk delta KPI
  let prevGte: Date | null = null
  let prevLte: Date | null = null
  if (gteDate && lteDate) {
    const lengthMs = lteDate.getTime() - gteDate.getTime()
    prevLte = new Date(gteDate.getTime() - 1) // detik sebelum periode ini
    prevGte = new Date(prevLte.getTime() - lengthMs)
  }

  // ── 1. Semua query dalam 1 Promise.all ──────────────
  const [
    orderStats,
    platformBreakdown,
    agingBacklog,
    walletBalances,
    payoutStats,
    lowStockCount,
    topProvinces,
    topCities,
    omzetByPlatform,
    marketingCosts,
    operatingExpense,
    prevPeriodStats,
    prevPlatformOmzet,
    prevMarketingCosts,
    prevOpEx,
    dailyTrend,
    utangOutstanding,
    piutangOutstanding,
  ] = await Promise.all([  // omzetByPlatform sekarang raw SQL (hpp*qty)

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

    // Semua provinsi order dalam range (tanpa limit)
    gteDate && lteDate
      ? prisma.$queryRaw<{ province: string; cnt: bigint }[]>`
          SELECT province, COUNT(*) AS cnt
          FROM orders
          WHERE province IS NOT NULL AND province != ''
            AND trx_date >= ${gteDate} AND trx_date <= ${lteDate}
          GROUP BY province
          ORDER BY cnt DESC
        `
      : prisma.$queryRaw<{ province: string; cnt: bigint }[]>`
          SELECT province, COUNT(*) AS cnt
          FROM orders
          WHERE province IS NOT NULL AND province != ''
          GROUP BY province
          ORDER BY cnt DESC
        `,

    // Semua kota order dalam range (tanpa limit)
    gteDate && lteDate
      ? prisma.$queryRaw<{ city: string; cnt: bigint }[]>`
          SELECT city, COUNT(*) AS cnt
          FROM orders
          WHERE city IS NOT NULL AND city != ''
            AND trx_date >= ${gteDate} AND trx_date <= ${lteDate}
          GROUP BY city
          ORDER BY cnt DESC
        `
      : prisma.$queryRaw<{ city: string; cnt: bigint }[]>`
          SELECT city, COUNT(*) AS cnt
          FROM orders
          WHERE city IS NOT NULL AND city != ''
          GROUP BY city
          ORDER BY cnt DESC
        `,

    // Omzet per platform — HPP dihitung hpp * qty (benar!)
    gteDate && lteDate
      ? prisma.$queryRaw<{ platform: string; cnt: bigint; total_omzet: bigint; total_hpp: bigint }[]>`
          SELECT
            COALESCE(platform, 'Unknown') AS platform,
            COUNT(*) AS cnt,
            COALESCE(SUM(real_omzet), 0) AS total_omzet,
            COALESCE(SUM(hpp * qty), 0) AS total_hpp
          FROM orders
          WHERE trx_date >= ${gteDate} AND trx_date <= ${lteDate}
            AND status NOT ILIKE '%batal%'
            AND status NOT ILIKE '%cancel%'
            AND status NOT ILIKE '%dibatalkan%'
          GROUP BY platform
          ORDER BY total_omzet DESC
        `
      : prisma.$queryRaw<{ platform: string; cnt: bigint; total_omzet: bigint; total_hpp: bigint }[]>`
          SELECT
            COALESCE(platform, 'Unknown') AS platform,
            COUNT(*) AS cnt,
            COALESCE(SUM(real_omzet), 0) AS total_omzet,
            COALESCE(SUM(hpp * qty), 0) AS total_hpp
          FROM orders
          WHERE status NOT ILIKE '%batal%'
            AND status NOT ILIKE '%cancel%'
            AND status NOT ILIKE '%dibatalkan%'
          GROUP BY platform
          ORDER BY total_omzet DESC
        `,

    // Ad Spend per Platform — dari wallet yang ditandai isAdsBudget=true
    gteDate && lteDate
      ? prisma.$queryRaw<{ linked_platform: string; ad_spend: bigint }[]>`
          SELECT w.linked_platform, COALESCE(SUM(ABS(l.amount)), 0)::bigint AS ad_spend
          FROM wallet_ledger l
          JOIN wallets w ON w.id = l.wallet_id
          WHERE w.is_ads_budget = true
            AND w.linked_platform IS NOT NULL
            AND l.trx_type = 'EXPENSE'
            AND l.trx_date >= ${gteDate} AND l.trx_date <= ${lteDate}
          GROUP BY w.linked_platform
        `
      : prisma.$queryRaw<{ linked_platform: string; ad_spend: bigint }[]>`
          SELECT w.linked_platform, COALESCE(SUM(ABS(l.amount)), 0)::bigint AS ad_spend
          FROM wallet_ledger l
          JOIN wallets w ON w.id = l.wallet_id
          WHERE w.is_ads_budget = true
            AND w.linked_platform IS NOT NULL
            AND l.trx_type = 'EXPENSE'
          GROUP BY w.linked_platform
        `,

    // Operating Expense (semua expense non-ads dalam periode)
    gteDate && lteDate
      ? prisma.$queryRaw<{ total: bigint }[]>`
          SELECT COALESCE(SUM(ABS(l.amount)), 0)::bigint AS total
          FROM wallet_ledger l
          JOIN wallets w ON w.id = l.wallet_id
          WHERE l.trx_type = 'EXPENSE'
            AND COALESCE(w.is_ads_budget, false) = false
            AND l.trx_date >= ${gteDate} AND l.trx_date <= ${lteDate}
        `
      : prisma.$queryRaw<{ total: bigint }[]>`
          SELECT COALESCE(SUM(ABS(l.amount)), 0)::bigint AS total
          FROM wallet_ledger l
          JOIN wallets w ON w.id = l.wallet_id
          WHERE l.trx_type = 'EXPENSE'
            AND COALESCE(w.is_ads_budget, false) = false
        `,

    // ── PERIODE PEMBANDING (delta KPI) ──
    prevGte && prevLte
      ? prisma.$queryRaw<{ group_key: string; cnt: bigint; total_omzet: bigint }[]>`
          SELECT
            CASE
              WHEN status ILIKE '%batal%' OR status ILIKE '%cancel%' OR status ILIKE '%dibatalkan%' THEN 'batal'
              ELSE 'valid'
            END AS group_key,
            COUNT(*) AS cnt,
            COALESCE(SUM(real_omzet), 0) AS total_omzet
          FROM orders
          WHERE trx_date >= ${prevGte} AND trx_date <= ${prevLte}
          GROUP BY group_key
        `
      : Promise.resolve([] as { group_key: string; cnt: bigint; total_omzet: bigint }[]),

    prevGte && prevLte
      ? prisma.$queryRaw<{ total_omzet: bigint; total_hpp: bigint }[]>`
          SELECT
            COALESCE(SUM(real_omzet), 0) AS total_omzet,
            COALESCE(SUM(hpp * qty), 0) AS total_hpp
          FROM orders
          WHERE trx_date >= ${prevGte} AND trx_date <= ${prevLte}
            AND status NOT ILIKE '%batal%'
            AND status NOT ILIKE '%cancel%'
            AND status NOT ILIKE '%dibatalkan%'
        `
      : Promise.resolve([] as { total_omzet: bigint; total_hpp: bigint }[]),

    prevGte && prevLte
      ? prisma.$queryRaw<{ total: bigint }[]>`
          SELECT COALESCE(SUM(ABS(l.amount)), 0)::bigint AS total
          FROM wallet_ledger l
          JOIN wallets w ON w.id = l.wallet_id
          WHERE w.is_ads_budget = true
            AND l.trx_type = 'EXPENSE'
            AND l.trx_date >= ${prevGte} AND l.trx_date <= ${prevLte}
        `
      : Promise.resolve([] as { total: bigint }[]),

    prevGte && prevLte
      ? prisma.$queryRaw<{ total: bigint }[]>`
          SELECT COALESCE(SUM(ABS(l.amount)), 0)::bigint AS total
          FROM wallet_ledger l
          JOIN wallets w ON w.id = l.wallet_id
          WHERE l.trx_type = 'EXPENSE'
            AND COALESCE(w.is_ads_budget, false) = false
            AND l.trx_date >= ${prevGte} AND l.trx_date <= ${prevLte}
        `
      : Promise.resolve([] as { total: bigint }[]),

    // ── DAILY TREND (omzet, profit, order count per hari) ──
    gteDate && lteDate
      ? prisma.$queryRaw<{
          day: string
          omzet: bigint
          hpp: bigint
          orders_valid: bigint
          orders_batal: bigint
        }[]>`
          SELECT
            TO_CHAR((trx_date AT TIME ZONE 'Asia/Jakarta')::date, 'YYYY-MM-DD') AS day,
            COALESCE(SUM(CASE WHEN status NOT ILIKE '%batal%' AND status NOT ILIKE '%cancel%' AND status NOT ILIKE '%dibatalkan%' THEN real_omzet ELSE 0 END), 0) AS omzet,
            COALESCE(SUM(CASE WHEN status NOT ILIKE '%batal%' AND status NOT ILIKE '%cancel%' AND status NOT ILIKE '%dibatalkan%' THEN hpp * qty ELSE 0 END), 0) AS hpp,
            COALESCE(SUM(CASE WHEN status NOT ILIKE '%batal%' AND status NOT ILIKE '%cancel%' AND status NOT ILIKE '%dibatalkan%' THEN 1 ELSE 0 END), 0) AS orders_valid,
            COALESCE(SUM(CASE WHEN status ILIKE '%batal%' OR status ILIKE '%cancel%' OR status ILIKE '%dibatalkan%' THEN 1 ELSE 0 END), 0) AS orders_batal
          FROM orders
          WHERE trx_date >= ${gteDate} AND trx_date <= ${lteDate}
          GROUP BY day
          ORDER BY day
        `
      : Promise.resolve([] as { day: string; omzet: bigint; hpp: bigint; orders_valid: bigint; orders_batal: bigint }[]),

    // Outstanding utang (semua, bukan filter periode)
    prisma.$queryRaw<{ cnt: bigint; total: bigint; overdue: bigint }[]>`
      SELECT
        COUNT(*) AS cnt,
        COALESCE(SUM(amount - amount_paid), 0) AS total,
        COALESCE(SUM(CASE WHEN due_date IS NOT NULL AND due_date < NOW() THEN (amount - amount_paid) ELSE 0 END), 0) AS overdue
      FROM utangs
      WHERE status IN ('OUTSTANDING', 'PARTIAL')
    `,

    // Outstanding piutang
    prisma.$queryRaw<{ cnt: bigint; total: bigint; overdue: bigint }[]>`
      SELECT
        COUNT(*) AS cnt,
        COALESCE(SUM(amount - amount_collected), 0) AS total,
        COALESCE(SUM(CASE WHEN due_date IS NOT NULL AND due_date < NOW() THEN (amount - amount_collected) ELSE 0 END), 0) AS overdue
      FROM piutangs
      WHERE status IN ('OUTSTANDING', 'PARTIAL')
    `,
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

  // Hitung total omzet, HPP, ads, opEx untuk Net Profit
  const totalOmzet = (omzetByPlatform as any[]).reduce((s, p) => s + Number(p.total_omzet), 0)
  const totalHpp = (omzetByPlatform as any[]).reduce((s, p) => s + Number(p.total_hpp), 0)
  const totalAdSpend = (marketingCosts as any[]).reduce((s, r) => s + Number(r.ad_spend), 0)
  const totalOpEx = Number((operatingExpense as any[])[0]?.total ?? 0)
  const grossProfit = totalOmzet - totalHpp
  const netProfit = grossProfit - totalAdSpend - totalOpEx

  // Order metrics
  const validOrders = (statsMap['terkirim']?.count ?? 0) + (statsMap['perlu_dikirim']?.count ?? 0)
  const cancelOrders = statsMap['batal']?.count ?? 0
  const totalOrders = validOrders + cancelOrders
  const aov = validOrders > 0 ? Math.round(totalOmzet / validOrders) : 0
  const cancelRate = totalOrders > 0 ? (cancelOrders / totalOrders) * 100 : 0

  // Periode pembanding — untuk delta KPI
  const prevStatsMap = Object.fromEntries(
    (prevPeriodStats as any[]).map((r: any) => [
      r.group_key,
      { count: Number(r.cnt), omzet: Number(r.total_omzet) }
    ])
  )
  const prevValidOrders = prevStatsMap['valid']?.count ?? 0
  const prevCancelOrders = prevStatsMap['batal']?.count ?? 0
  const prevTotalOrders = prevValidOrders + prevCancelOrders
  const prevPlatform = (prevPlatformOmzet as any[])[0] ?? { total_omzet: 0, total_hpp: 0 }
  const prevOmzet = Number(prevPlatform.total_omzet ?? 0)
  const prevHpp = Number(prevPlatform.total_hpp ?? 0)
  const prevAds = Number((prevMarketingCosts as any[])[0]?.total ?? 0)
  const prevOpExVal = Number((prevOpEx as any[])[0]?.total ?? 0)
  const prevGrossProfit = prevOmzet - prevHpp
  const prevNetProfit = prevGrossProfit - prevAds - prevOpExVal
  const prevAov = prevValidOrders > 0 ? Math.round(prevOmzet / prevValidOrders) : 0
  const prevCancelRate = prevTotalOrders > 0 ? (prevCancelOrders / prevTotalOrders) * 100 : 0

  const pctChange = (cur: number, prev: number): number | null => {
    if (prev === 0) return cur === 0 ? 0 : null
    return ((cur - prev) / Math.abs(prev)) * 100
  }

  // Daily trend — pastikan tidak ada hari yang hilang (fill 0 untuk hari kosong)
  const trendMap = new Map(
    (dailyTrend as any[]).map((r: any) => [r.day, {
      omzet: Number(r.omzet),
      hpp: Number(r.hpp),
      ordersValid: Number(r.orders_valid),
      ordersBatal: Number(r.orders_batal),
    }])
  )
  const trend: any[] = []
  if (gteDate && lteDate) {
    const cur = new Date(gteDate)
    const end = new Date(lteDate)
    while (cur <= end) {
      const dayStr = cur.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
      const v = trendMap.get(dayStr) ?? { omzet: 0, hpp: 0, ordersValid: 0, ordersBatal: 0 }
      trend.push({
        day: dayStr,
        omzet: v.omzet,
        grossProfit: v.omzet - v.hpp,
        ordersValid: v.ordersValid,
        ordersBatal: v.ordersBatal,
      })
      cur.setDate(cur.getDate() + 1)
    }
  }

  // Utang & Piutang summary
  const utangRow = (utangOutstanding as any[])[0] ?? { cnt: 0, total: 0, overdue: 0 }
  const piutangRow = (piutangOutstanding as any[])[0] ?? { cnt: 0, total: 0, overdue: 0 }

  return apiSuccess({
    dateFrom,
    dateTo,
    orders: {
      perluDikirim: statsMap['perlu_dikirim']?.count ?? 0,
      terkirim: statsMap['terkirim']?.count ?? 0,
      batal: cancelOrders,
      total: totalOrders,
      valid: validOrders,
      aov,
      cancelRate, // 0..100
    },
    omzet: {
      byPlatform: (omzetByPlatform as any[]).map(p => {
        // Ad spend per platform — dari wallet is_ads_budget=true + linked_platform
        const adsMap = new Map(
          (marketingCosts as any[]).map((r: any) => [
            (r.linked_platform || '').toLowerCase(),
            Number(r.ad_spend),
          ])
        )
        const platformKey = (p.platform || '').toLowerCase()
        const adSpend = adsMap.get(platformKey) ?? 0

        const omzet = Number(p.total_omzet)
        const hpp   = Number(p.total_hpp)

        return {
          platform: p.platform,
          realOmzet: omzet,
          hpp,
          count: Number(p.cnt),
          grossProfit: omzet - hpp,
          adSpend,
          roas: adSpend > 0 ? (omzet / adSpend).toFixed(1) : '0',
        }
      }),
      total:        totalOmzet,
      totalHpp:     totalHpp,
      totalAdSpend: totalAdSpend,
      totalOpEx:    totalOpEx,
      grossProfit,
      netProfit,
      netMargin: totalOmzet > 0 ? (netProfit / totalOmzet) * 100 : 0,
    },
    delta: {
      omzet:       pctChange(totalOmzet, prevOmzet),
      grossProfit: pctChange(grossProfit, prevGrossProfit),
      netProfit:   pctChange(netProfit, prevNetProfit),
      validOrders: pctChange(validOrders, prevValidOrders),
      aov:         pctChange(aov, prevAov),
      cancelRate:  pctChange(cancelRate, prevCancelRate), // delta absolut akan di-handle di UI
      adSpend:     pctChange(totalAdSpend, prevAds),
      opEx:        pctChange(totalOpEx, prevOpExVal),
    },
    prev: {
      omzet: prevOmzet,
      grossProfit: prevGrossProfit,
      netProfit: prevNetProfit,
      validOrders: prevValidOrders,
      aov: prevAov,
      cancelRate: prevCancelRate,
      adSpend: prevAds,
      opEx: prevOpExVal,
    },
    trend,
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
    receivable: {
      utang: {
        count: Number(utangRow.cnt),
        total: Number(utangRow.total),
        overdue: Number(utangRow.overdue),
      },
      piutang: {
        count: Number(piutangRow.cnt),
        total: Number(piutangRow.total),
        overdue: Number(piutangRow.overdue),
      },
    },
    stock: {
      lowStockCount: Number((lowStockCount as any[])[0]?.cnt ?? 0),
    },
    geo: {
      topProvinces: (topProvinces as any[]).map(p => ({
        province: p.province,
        count: Number(p.cnt),
      })),
      topCities: (topCities as any[]).map(c => ({
        city: c.city,
        count: Number(c.cnt),
      })),
    },
  })
}
