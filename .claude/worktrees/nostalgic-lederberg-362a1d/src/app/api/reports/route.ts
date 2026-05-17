import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const { searchParams } = request.nextUrl
  const dateFrom = searchParams.get('dateFrom') || ''
  const dateTo = searchParams.get('dateTo') || ''
  const type = searchParams.get('type') || 'summary'
  const fromDate = dateFrom ? new Date(dateFrom) : null
  const toDate = dateTo ? new Date(dateTo) : null
  if (toDate) toDate.setHours(23, 59, 59, 999)

  const payoutDateFilter = fromDate && toDate ? {
    payout: {
      releasedDate: { gte: fromDate, lte: toDate }
    }
  } : {}

  if (type === 'summary') {
    const [paidOrders, payoutData, expenseData] = await Promise.all([
      prisma.order.findMany({
        where: {
          ...payoutDateFilter,
          NOT: [
            { status: { contains: 'batal' } },
            { status: { contains: 'Cancel' } },
            { status: { contains: 'Dibatalkan' } },
          ],
        },
        select: {
          platform: true,
          sku: true,
          qty: true,
          hpp: true,
          realOmzet: true,
        },
      }),
      // Payout summary
      prisma.payout.aggregate({
        where: fromDate && toDate
          ? { releasedDate: { gte: fromDate, lte: toDate } }
          : {},
        _sum: { totalIncome: true, omzet: true, platformFee: true, amsFee: true },
        _count: { id: true },
      }),

      // Expense dari wallet ledger
      prisma.walletLedger.aggregate({
        where: {
          trxType: 'EXPENSE',
          ...(fromDate && toDate && {
            trxDate: { gte: fromDate, lte: toDate }
          }),
        },
        _sum: { amount: true },
        _count: { id: true },
      }),
    ])

    const platformMap = new Map<string, { omzet: number; hpp: number; qty: number; orders: number }>()
    const skuMap = new Map<string, { omzet: number; qty: number }>()

    for (const order of paidOrders) {
      const platformKey = order.platform || 'Unknown'
      const qty = order.qty ?? 0
      const orderHpp = (order.hpp ?? 0) * qty

      const platformAgg = platformMap.get(platformKey) ?? { omzet: 0, hpp: 0, qty: 0, orders: 0 }
      platformAgg.omzet += order.realOmzet ?? 0
      platformAgg.hpp += orderHpp
      platformAgg.qty += qty
      platformAgg.orders += 1
      platformMap.set(platformKey, platformAgg)

      if (order.sku) {
        const skuAgg = skuMap.get(order.sku) ?? { omzet: 0, qty: 0 }
        skuAgg.omzet += order.realOmzet ?? 0
        skuAgg.qty += qty
        skuMap.set(order.sku, skuAgg)
      }
    }

    const omzetData = Array.from(platformMap.entries())
      .map(([platform, value]) => ({ platform, ...value }))
      .sort((a, b) => b.omzet - a.omzet)

    const topSkus = Array.from(skuMap.entries())
      .map(([sku, value]) => ({ sku, ...value }))
      .sort((a, b) => b.omzet - a.omzet)
      .slice(0, 10)

    const totalOmzet = omzetData.reduce((sum, item) => sum + item.omzet, 0)
    const totalHpp = omzetData.reduce((sum, item) => sum + item.hpp, 0)
    const totalExpense = Math.abs(expenseData._sum.amount ?? 0)

    return apiSuccess({
      omzet: {
        total: totalOmzet,
        byPlatform: omzetData.map(p => ({
          platform: p.platform,
          omzet: p.omzet,
          hpp: p.hpp,
          qty: p.qty,
          orders: p.orders,
          grossProfit: p.omzet - p.hpp,
          margin: p.omzet
            ? (((p.omzet - p.hpp) / p.omzet) * 100).toFixed(1)
            : '0',
        })),
      },
      grossProfit: totalOmzet - totalHpp,
      grossMargin: totalOmzet > 0
        ? (((totalOmzet - totalHpp) / totalOmzet) * 100).toFixed(1)
        : '0',
      payout: {
        count: payoutData._count.id,
        totalIncome: payoutData._sum.totalIncome ?? 0,
        platformFee: payoutData._sum.platformFee ?? 0,
        amsFee: payoutData._sum.amsFee ?? 0,
      },
      expense: {
        total: totalExpense,
        count: expenseData._count.id,
      },
      netCashflow: (payoutData._sum.totalIncome ?? 0) - totalExpense,
      topSkus: topSkus.map(s => ({
        sku: s.sku,
        omzet: s.omzet,
        qty: s.qty,
      })),
    })
  }

  // Monthly breakdown
  if (type === 'monthly') {
    const monthly = await prisma.$queryRaw<any[]>`
      SELECT
        TO_CHAR(trx_date, 'YYYY-MM') AS month,
        platform,
        COUNT(*) AS order_count,
        SUM(real_omzet) AS omzet,
        SUM(hpp * qty) AS hpp
      FROM orders
      WHERE trx_date IS NOT NULL
        AND status NOT ILIKE '%batal%'
        AND status NOT ILIKE '%cancel%'
        AND status NOT ILIKE '%dibatalkan%'
        ${fromDate ? prisma.$queryRaw`AND trx_date >= ${fromDate}` : prisma.$queryRaw``}
        ${toDate ? prisma.$queryRaw`AND trx_date <= ${toDate}` : prisma.$queryRaw``}
      GROUP BY month, platform
      ORDER BY month DESC, platform
    `
    return apiSuccess({ monthly: monthly.map(m => ({ ...m, orderCount: Number(m.order_count), omzet: Number(m.omzet), hpp: Number(m.hpp) })) })
  }

  return apiError('Report type tidak dikenali')
}
