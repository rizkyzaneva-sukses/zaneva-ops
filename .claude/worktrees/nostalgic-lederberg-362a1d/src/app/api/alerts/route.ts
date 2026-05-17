import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError, calculateSOH } from '@/lib/utils'

/**
 * GET /api/alerts
 * Response: {
 *   stockEmpty: [...products with SOH = 0],
 *   stockLow: [...products with 0 < SOH <= ROP],
 *   orderOverdue: [...orders pending > 24 jam],
 *   summary: { emptyCount, lowCount, overdue24h, overdue48h }
 * }
 */
export async function GET(_request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const [products, ledgerEntries, overdueOrders] = await Promise.all([
    // All active products with category
    prisma.masterProduct.findMany({
      where: { isActive: true },
      include: { category: { select: { categoryName: true } } },
      orderBy: { sku: 'asc' },
    }),

    // All inventory ledger
    prisma.inventoryLedger.findMany({
      select: { sku: true, direction: true, qty: true, trxDate: true },
    }),

    // Orders pending lebih dari 24 jam
    prisma.$queryRaw<{
      id: string
      order_no: string
      platform: string | null
      sku: string | null
      receiver_name: string | null
      city: string | null
      status: string
      created_at: Date
      hours_pending: number
    }[]>`
      SELECT
        id,
        order_no,
        platform,
        sku,
        receiver_name,
        city,
        status,
        created_at,
        ROUND(EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600) AS hours_pending
      FROM orders
      WHERE status NOT LIKE 'TERKIRIM%'
        AND status NOT ILIKE '%batal%'
        AND status NOT ILIKE '%cancel%'
        AND status NOT ILIKE '%dibatalkan%'
        AND created_at < NOW() - INTERVAL '24 hours'
      ORDER BY created_at ASC
      LIMIT 200
    `,
  ])

  // Group ledger by SKU
  const ledgerBySku = new Map<string, typeof ledgerEntries>()
  for (const entry of ledgerEntries) {
    const list = ledgerBySku.get(entry.sku) ?? []
    list.push(entry)
    ledgerBySku.set(entry.sku, list)
  }

  // Calculate SOH per product — same logic as /api/inventory
  const withSoh = products.map(p => {
    const entries = ledgerBySku.get(p.sku) ?? []
    const soh = calculateSOH(
      p.stokAwal,
      p.lastOpnameDate,
      entries.map(e => ({
        sku: e.sku,
        direction: e.direction as 'IN' | 'OUT',
        qty: e.qty,
        trxDate: e.trxDate,
      }))
    )
    return {
      sku: p.sku,
      productName: p.productName,
      categoryName: p.category?.categoryName ?? p.categoryName ?? '—',
      soh,
      rop: p.rop,
      hpp: p.hpp,
      leadTimeDays: p.leadTimeDays,
      stockStatus: soh <= 0 ? 'EMPTY' : soh <= p.rop ? 'LOW' : 'OK',
    }
  })

  // Separate by stock status
  const stockEmpty = withSoh.filter(p => p.soh <= 0).sort((a, b) => a.soh - b.soh)
  const stockLow   = withSoh.filter(p => p.soh > 0 && p.soh <= p.rop).sort((a, b) => a.soh - b.soh)

  // Format overdue orders
  const orderOverdue = (overdueOrders as any[]).map(o => ({
    id: o.id,
    orderNo: o.order_no,
    platform: o.platform,
    sku: o.sku,
    receiverName: o.receiver_name,
    city: o.city,
    status: o.status,
    createdAt: o.created_at,
    hoursPending: Number(o.hours_pending),
  }))

  const overdue48h = orderOverdue.filter(o => o.hoursPending > 48)
  const overdue24h = orderOverdue.filter(o => o.hoursPending > 24)

  return apiSuccess({
    stockEmpty,
    stockLow,
    orderOverdue,
    summary: {
      emptyCount: stockEmpty.length,
      lowCount: stockLow.length,
      overdue24h: overdue24h.length,
      overdue48h: overdue48h.length,
    },
  })
}
