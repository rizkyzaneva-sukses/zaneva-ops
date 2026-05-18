import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

/**
 * GET /api/dashboard/sparklines?days=14
 *
 * Return 14-day daily series for KPI sparklines:
 *   - omzet, gp, net (proxy: omzet - hpp - ads spend), aov, orders, marginPct
 *
 * Lightweight: aggregate per day in SQL.
 */
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)

  const { searchParams } = new URL(request.url)
  const days = Math.max(1, Math.min(60, Number(searchParams.get('days') ?? '14')))

  const since = new Date()
  since.setDate(since.getDate() - (days - 1))
  since.setHours(0, 0, 0, 0)

  const [orderRows, adsRows] = await Promise.all([
    prisma.$queryRaw<
      { day: string; omzet: bigint; hpp: bigint; cnt: bigint }[]
    >`
      SELECT
        TO_CHAR(trx_date AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD') AS day,
        COALESCE(SUM(real_omzet), 0)::bigint AS omzet,
        COALESCE(SUM(hpp * qty), 0)::bigint AS hpp,
        COUNT(*)::bigint AS cnt
      FROM orders
      WHERE trx_date >= ${since}
        AND status NOT ILIKE '%batal%'
        AND status NOT ILIKE '%cancel%'
        AND status NOT ILIKE '%dibatalkan%'
      GROUP BY day
      ORDER BY day ASC
    `,
    prisma.$queryRaw<{ day: string; total: bigint }[]>`
      SELECT
        TO_CHAR(l.trx_date AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD') AS day,
        COALESCE(SUM(ABS(l.amount)), 0)::bigint AS total
      FROM wallet_ledger l
      JOIN wallets w ON w.id = l.wallet_id
      WHERE w.is_ads_budget = true
        AND l.trx_type = 'EXPENSE'
        AND l.trx_date >= ${since}
      GROUP BY day
      ORDER BY day ASC
    `,
  ])

  const orderMap = new Map<string, { omzet: number; hpp: number; cnt: number }>(
    orderRows.map((r: { day: string; omzet: bigint; hpp: bigint; cnt: bigint }) => [
      r.day,
      { omzet: Number(r.omzet), hpp: Number(r.hpp), cnt: Number(r.cnt) },
    ]),
  )
  const adsMap = new Map<string, number>(
    adsRows.map((r: { day: string; total: bigint }) => [r.day, Number(r.total)]),
  )

  // Fill missing days
  const omzet: number[] = []
  const gp: number[] = []
  const net: number[] = []
  const aov: number[] = []
  const orders: number[] = []
  const marginPct: number[] = []

  for (let i = 0; i < days; i++) {
    const d = new Date(since)
    d.setDate(d.getDate() + i)
    const ymd = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
    const o = orderMap.get(ymd) ?? { omzet: 0, hpp: 0, cnt: 0 }
    const ads = adsMap.get(ymd) ?? 0
    const gpVal = o.omzet - o.hpp
    const netVal = gpVal - ads
    omzet.push(o.omzet)
    gp.push(gpVal)
    net.push(netVal)
    orders.push(o.cnt)
    aov.push(o.cnt > 0 ? Math.round(o.omzet / o.cnt) : 0)
    marginPct.push(o.omzet > 0 ? Number(((gpVal / o.omzet) * 100).toFixed(2)) : 0)
  }

  return apiSuccess({
    days,
    series: { omzet, gp, net, aov, orders, marginPct },
  })
}
