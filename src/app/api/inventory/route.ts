import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError, calculateSOH } from '@/lib/utils'

// GET /api/inventory — semua produk + SOH terhitung
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)

  const { searchParams } = request.nextUrl
  const search = searchParams.get('search') || ''
  const belowRop = searchParams.get('belowRop') === 'true'

  // Fetch all active products
  const products = await prisma.masterProduct.findMany({
    where: {
      isActive: true,
      ...(search && {
        OR: [
          { sku: { contains: search, mode: 'insensitive' } },
          { productName: { contains: search, mode: 'insensitive' } },
        ],
      }),
    },
    include: { category: true },
    orderBy: { sku: 'asc' },
  })

  // Fetch all ledger entries for these SKUs
  const skus = products.map(p => p.sku)
  const ledger = await prisma.inventoryLedger.findMany({
    where: { sku: { in: skus } },
    select: { sku: true, direction: true, qty: true, trxDate: true },
  })

  // Group ledger by SKU
  const ledgerBySku = new Map<string, typeof ledger>()
  for (const entry of ledger) {
    const list = ledgerBySku.get(entry.sku) ?? []
    list.push(entry)
    ledgerBySku.set(entry.sku, list)
  }

  // Calculate SOH per product
  const result = products.map(p => {
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
      ...p,
      soh,
      isBelowRop: soh <= p.rop,
      stockStatus: soh <= 0 ? 'EMPTY' : soh <= p.rop ? 'LOW' : 'OK',
    }
  })

  const filtered = belowRop ? result.filter(p => p.isBelowRop) : result

  return apiSuccess({
    products: filtered,
    total: filtered.length,
    summary: {
      totalProducts: filtered.length,
      emptyStock: filtered.filter(p => p.soh <= 0).length,
      lowStock: filtered.filter(p => p.soh > 0 && p.isBelowRop).length,
      okStock: filtered.filter(p => !p.isBelowRop && p.soh > 0).length,
    },
  })
}
