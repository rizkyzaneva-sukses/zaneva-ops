import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'
import {
  ymWIB,
  monthRangeWIB,
  monthPacing,
  getMonthlyTarget,
  getTotalCash,
  getInventoryValue,
  getReceivablePayable,
  getBurnRate,
} from '@/lib/dashboard-helpers'

/**
 * GET /api/dashboard/scoreboard
 *
 * 4 angka utama untuk owner:
 *  1. Net Profit MTD vs Target (+ projected EOM)
 *  2. Total Equity = Kas + Inventory + Piutang − Utang − Vendor outstanding
 *  3. Cash Runway = Kas / avg burn rate
 *  4. Growth Quality = Omzet MoM% & Margin MoM%
 */
export async function GET(_req: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const ym = ymWIB()
  const { start: monthStart, today, daysInMonth } = monthRangeWIB(ym)
  const lteToday = new Date(`${today.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })}T23:59:59+07:00`)
  const { dayIndex, pacingPct } = monthPacing(ym)

  const prevYm = (() => {
    const [y, m] = ym.split('-').map(Number)
    const py = m === 1 ? y - 1 : y
    const pm = m === 1 ? 12 : m - 1
    return `${py}-${String(pm).padStart(2, '0')}`
  })()
  const { start: prevStart, end: prevEnd } = monthRangeWIB(prevYm)

  const [
    target,
    mtdOrders,
    mtdAds,
    mtdOpEx,
    prevOrders,
    prevAds,
    prevOpEx,
    cash,
    invValue,
    arap,
    burn,
  ] = await Promise.all([
    getMonthlyTarget(ym),
    prisma.$queryRaw<{ omzet: bigint; hpp: bigint; cnt: bigint }[]>`
      SELECT
        COALESCE(SUM(real_omzet), 0)::bigint AS omzet,
        COALESCE(SUM(hpp * qty), 0)::bigint AS hpp,
        COUNT(*)::bigint AS cnt
      FROM orders
      WHERE trx_date >= ${monthStart} AND trx_date <= ${lteToday}
        AND status NOT ILIKE '%batal%'
        AND status NOT ILIKE '%cancel%'
        AND status NOT ILIKE '%dibatalkan%'
    `,
    prisma.$queryRaw<{ total: bigint }[]>`
      SELECT COALESCE(SUM(ABS(l.amount)), 0)::bigint AS total
      FROM wallet_ledger l
      JOIN wallets w ON w.id = l.wallet_id
      WHERE w.is_ads_budget = true
        AND l.trx_type = 'EXPENSE'
        AND l.trx_date >= ${monthStart} AND l.trx_date <= ${lteToday}
    `,
    prisma.$queryRaw<{ total: bigint }[]>`
      SELECT COALESCE(SUM(ABS(l.amount)), 0)::bigint AS total
      FROM wallet_ledger l
      JOIN wallets w ON w.id = l.wallet_id
      WHERE l.trx_type = 'EXPENSE'
        AND COALESCE(w.is_ads_budget, false) = false
        AND l.trx_date >= ${monthStart} AND l.trx_date <= ${lteToday}
    `,
    prisma.$queryRaw<{ omzet: bigint; hpp: bigint }[]>`
      SELECT
        COALESCE(SUM(real_omzet), 0)::bigint AS omzet,
        COALESCE(SUM(hpp * qty), 0)::bigint AS hpp
      FROM orders
      WHERE trx_date >= ${prevStart} AND trx_date <= ${prevEnd}
        AND status NOT ILIKE '%batal%'
        AND status NOT ILIKE '%cancel%'
        AND status NOT ILIKE '%dibatalkan%'
    `,
    prisma.$queryRaw<{ total: bigint }[]>`
      SELECT COALESCE(SUM(ABS(l.amount)), 0)::bigint AS total
      FROM wallet_ledger l
      JOIN wallets w ON w.id = l.wallet_id
      WHERE w.is_ads_budget = true
        AND l.trx_type = 'EXPENSE'
        AND l.trx_date >= ${prevStart} AND l.trx_date <= ${prevEnd}
    `,
    prisma.$queryRaw<{ total: bigint }[]>`
      SELECT COALESCE(SUM(ABS(l.amount)), 0)::bigint AS total
      FROM wallet_ledger l
      JOIN wallets w ON w.id = l.wallet_id
      WHERE l.trx_type = 'EXPENSE'
        AND COALESCE(w.is_ads_budget, false) = false
        AND l.trx_date >= ${prevStart} AND l.trx_date <= ${prevEnd}
    `,
    getTotalCash(),
    getInventoryValue(),
    getReceivablePayable(),
    getBurnRate(90),
  ])

  // ── 1. Net Profit MTD vs Target ──
  const mtdOmzet = Number(mtdOrders[0]?.omzet ?? 0)
  const mtdHpp = Number(mtdOrders[0]?.hpp ?? 0)
  const mtdAdsSpend = Number(mtdAds[0]?.total ?? 0)
  const mtdOpExSpend = Number(mtdOpEx[0]?.total ?? 0)
  const mtdGP = mtdOmzet - mtdHpp
  const mtdNet = mtdGP - mtdAdsSpend - mtdOpExSpend
  // Projected EOM via simple daily linear projection
  const dailyAvg = dayIndex > 0 ? mtdNet / dayIndex : 0
  const projectedEOM = Math.round(dailyAvg * daysInMonth)
  const targetOmzet = target.omzet ?? 0
  const targetNet = target.netProfit ?? 0
  const omzetAchPct = targetOmzet > 0 ? (mtdOmzet / targetOmzet) * 100 : null
  const netAchPct = targetNet > 0 ? (mtdNet / targetNet) * 100 : null

  // ── 2. Equity (working capital snapshot) ──
  const totalEquity =
    cash + invValue.totalValue + arap.piutang - arap.utang - arap.vendorOutstanding

  // ── 3. Cash Runway ──
  // Runway dalam bulan: cash / avg monthly burn (jika burn > 0)
  let runwayMonths: number | null = null
  if (burn.avgMonthlyBurn > 0) {
    runwayMonths = cash / burn.avgMonthlyBurn
  }

  // ── 4. Growth Quality (Omzet MoM, Margin MoM) ──
  const prevOmzet = Number(prevOrders[0]?.omzet ?? 0)
  const prevHpp = Number(prevOrders[0]?.hpp ?? 0)
  const prevAdsSpend = Number(prevAds[0]?.total ?? 0)
  const prevOpExSpend = Number(prevOpEx[0]?.total ?? 0)
  const prevGP = prevOmzet - prevHpp
  const prevNet = prevGP - prevAdsSpend - prevOpExSpend
  const prevMargin = prevOmzet > 0 ? (prevNet / prevOmzet) * 100 : 0
  const mtdMargin = mtdOmzet > 0 ? (mtdNet / mtdOmzet) * 100 : 0

  // Untuk MoM, compare same-day-of-month (apples-to-apples)
  // Hitung omzet bulan lalu sd hari ke-N saja
  const prevSameDayCutoff = new Date(prevStart)
  prevSameDayCutoff.setDate(prevSameDayCutoff.getDate() + dayIndex - 1)
  prevSameDayCutoff.setHours(23, 59, 59, 999)

  const prevSameDayRows = await prisma.$queryRaw<{ omzet: bigint }[]>`
    SELECT COALESCE(SUM(real_omzet), 0)::bigint AS omzet
    FROM orders
    WHERE trx_date >= ${prevStart} AND trx_date <= ${prevSameDayCutoff}
      AND status NOT ILIKE '%batal%'
      AND status NOT ILIKE '%cancel%'
      AND status NOT ILIKE '%dibatalkan%'
  `
  const prevSameDayOmzet = Number(prevSameDayRows[0]?.omzet ?? 0)
  const omzetMoMPct = prevSameDayOmzet > 0
    ? ((mtdOmzet - prevSameDayOmzet) / prevSameDayOmzet) * 100
    : null
  const marginMoMDiff = mtdMargin - prevMargin // dalam pp (percentage point)

  return apiSuccess({
    ym,
    pacing: { dayIndex, daysInMonth, pacingPct },
    netProfit: {
      mtdOmzet,
      mtdGP,
      mtdNet,
      projectedEOM,
      targetOmzet,
      targetNet,
      omzetAchPct,
      netAchPct,
      mtdAdsSpend,
      mtdOpEx: mtdOpExSpend,
    },
    equity: {
      cash,
      inventoryValue: invValue.totalValue,
      piutang: arap.piutang,
      utang: arap.utang,
      vendorOutstanding: arap.vendorOutstanding,
      total: totalEquity,
    },
    runway: {
      cash,
      avgMonthlyBurn: burn.avgMonthlyBurn,
      avgDailyBurn: burn.avgDailyBurn,
      months: runwayMonths,
      basisDays: burn.days,
    },
    growth: {
      mtdOmzet,
      prevSameDayOmzet,
      omzetMoMPct,
      mtdMargin,
      prevMargin,
      marginMoMDiff,
      prevMonthOmzet: prevOmzet,
      prevMonthNet: prevNet,
    },
  })
}
