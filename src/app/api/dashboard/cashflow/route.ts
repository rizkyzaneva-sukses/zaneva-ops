import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'
import { getBurnRate, getTotalCash } from '@/lib/dashboard-helpers'

/**
 * GET /api/dashboard/cashflow?days=30
 *
 * Return:
 *  - daily: array of { day, cashIn, cashOut, net } selama N hari
 *  - summary: { totalIn, totalOut, net, days }
 *  - burn: { avgMonthlyBurn, avgDailyBurn, totalSpend90d }
 *  - runway: { cash, months } estimasi runway
 *  - byCategory: top 5 kategori expense by total selama range
 */
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole))
    return apiError('Forbidden', 403)

  const { searchParams } = new URL(request.url)
  const days = Math.max(7, Math.min(90, Number(searchParams.get('days') ?? '30')))

  const since = new Date()
  since.setDate(since.getDate() - (days - 1))
  since.setHours(0, 0, 0, 0)

  const [daily, byCategory, cash, burn] = await Promise.all([
    // Daily cash in vs out
    prisma.$queryRaw<
      { day: string; in_amount: bigint; out_amount: bigint }[]
    >`
      SELECT
        TO_CHAR(trx_date AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD') AS day,
        COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0)::bigint AS in_amount,
        COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0)::bigint AS out_amount
      FROM wallet_ledger
      WHERE trx_date >= ${since}
      GROUP BY day
      ORDER BY day ASC
    `,
    // Top expense category dlm range
    prisma.$queryRaw<{ category: string; total: bigint; cnt: bigint }[]>`
      SELECT
        COALESCE(NULLIF(category, ''), 'Tanpa Kategori') AS category,
        COALESCE(SUM(ABS(amount)), 0)::bigint AS total,
        COUNT(*)::bigint AS cnt
      FROM wallet_ledger
      WHERE trx_type = 'EXPENSE'
        AND trx_date >= ${since}
      GROUP BY category
      ORDER BY total DESC
      LIMIT 5
    `,
    getTotalCash(),
    getBurnRate(90),
  ])

  // Fill missing days
  const daysArr: { day: string; cashIn: number; cashOut: number; net: number }[] = []
  const dailyMap = new Map<string, { in_amount: bigint; out_amount: bigint }>(
    daily.map((r: { day: string; in_amount: bigint; out_amount: bigint }) => [
      r.day,
      { in_amount: r.in_amount, out_amount: r.out_amount },
    ]),
  )
  let totalIn = 0
  let totalOut = 0
  for (let i = 0; i < days; i++) {
    const d = new Date(since)
    d.setDate(d.getDate() + i)
    const ymd = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
    const r = dailyMap.get(ymd)
    const cashIn = r ? Number(r.in_amount) : 0
    const cashOut = r ? Number(r.out_amount) : 0
    totalIn += cashIn
    totalOut += cashOut
    daysArr.push({ day: ymd, cashIn, cashOut, net: cashIn - cashOut })
  }

  const runwayMonths = burn.avgMonthlyBurn > 0 ? cash / burn.avgMonthlyBurn : null

  return apiSuccess({
    days,
    daily: daysArr,
    summary: {
      totalIn,
      totalOut,
      net: totalIn - totalOut,
      days,
    },
    burn: {
      avgMonthlyBurn: burn.avgMonthlyBurn,
      avgDailyBurn: burn.avgDailyBurn,
      totalSpend90d: burn.totalSpend,
    },
    runway: {
      cash,
      months: runwayMonths,
    },
    byCategory: byCategory.map((c: { category: string; total: bigint; cnt: bigint }) => ({
      category: c.category,
      total: Number(c.total),
      count: Number(c.cnt),
    })),
  })
}
