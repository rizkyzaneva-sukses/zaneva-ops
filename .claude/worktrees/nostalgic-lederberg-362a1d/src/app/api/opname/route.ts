import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError, calculateSOH } from '@/lib/utils'

// GET /api/opname
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const batches = await prisma.stockOpnameBatch.findMany({
    orderBy: { opnameDate: 'desc' },
    include: { items: { take: 5 } },
    take: 20,
  })
  return apiSuccess(batches)
}

// POST /api/opname — create draft from CSV upload
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const body = await request.json()
  const { opnameDate, warehouseName, items, note } = body
  // items: [{ sku, actualQty }]

  if (!items?.length) return apiError('Data opname kosong')

  // Get all products
  const skus = items.map((i: any) => i.sku)
  const products = await prisma.masterProduct.findMany({
    where: { sku: { in: skus } },
  })
  const productMap = new Map(products.map(p => [p.sku, p]))

  const missing = skus.filter((s: string) => !productMap.has(s))
  if (missing.length > 0) return apiError(`SKU tidak ditemukan: ${missing.join(', ')}`)

  // Get ledger for SOH calculation
  const ledger = await prisma.inventoryLedger.findMany({
    where: { sku: { in: skus } },
    select: { sku: true, direction: true, qty: true, trxDate: true },
  })
  const ledgerBySku = new Map<string, typeof ledger>()
  for (const e of ledger) {
    const arr = ledgerBySku.get(e.sku) ?? []
    arr.push(e)
    ledgerBySku.set(e.sku, arr)
  }

  // Build opname items with system vs actual
  const opnameItems = items.map((item: any) => {
    const product = productMap.get(item.sku)!
    const entries = ledgerBySku.get(item.sku) ?? []
    const systemQty = calculateSOH(
      product.stokAwal,
      product.lastOpnameDate,
      entries.map(e => ({
        sku: e.sku,
        direction: e.direction as 'IN' | 'OUT',
        qty: e.qty,
        trxDate: e.trxDate,
      }))
    )
    return {
      sku: item.sku,
      systemQty,
      actualQty: item.actualQty,
      diffQty: item.actualQty - systemQty,
    }
  })

  // Create DRAFT batch
  const batch = await prisma.stockOpnameBatch.create({
    data: {
      opnameDate: new Date(opnameDate || new Date()),
      warehouseName: warehouseName || null,
      status: 'DRAFT',
      note: note || null,
      totalSku: opnameItems.length,
      totalAdjustmentQty: opnameItems.reduce((s: number, i: any) => s + Math.abs(i.diffQty), 0),
      createdBy: session.username,
      items: {
        create: opnameItems.map((i: any) => ({ ...i, note: null })),
      },
    },
    include: { items: true },
  })

  return apiSuccess(batch, 201)
}
