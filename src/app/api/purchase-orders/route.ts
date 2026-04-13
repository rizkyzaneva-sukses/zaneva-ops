import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError, generatePONumber, getPagination } from '@/lib/utils'

// GET /api/purchase-orders
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const { searchParams } = request.nextUrl
  const status = searchParams.get('status') || ''
  const paymentStatus = searchParams.get('paymentStatus') || ''
  const vendorId = searchParams.get('vendorId') || ''
  const search = searchParams.get('search') || ''
  const { skip, take } = getPagination({
    page: Number(searchParams.get('page') || 1),
    limit: Number(searchParams.get('limit') || 20),
  })

  // paymentStatus filter — support 'UNPAID_OR_PARTIAL' compound value
  let paymentStatusFilter: object | undefined
  if (paymentStatus === 'UNPAID_OR_PARTIAL') {
    paymentStatusFilter = { paymentStatus: { in: ['UNPAID', 'PARTIAL_PAID'] } }
  } else if (paymentStatus) {
    paymentStatusFilter = { paymentStatus: paymentStatus as any }
  }

  const where = {
    ...(status && { status: status as any }),
    ...paymentStatusFilter,
    ...(vendorId && { vendorId }),
    ...(search && {
      OR: [
        { poNumber: { contains: search, mode: 'insensitive' as const } },
        { vendorName: { contains: search, mode: 'insensitive' as const } },
      ],
    }),
  }

  const [pos, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      include: {
        items: true,
        vendor: { select: { namaVendor: true, kontak: true } },
      },
      orderBy: { poDate: 'desc' },
      skip,
      take,
    }),
    prisma.purchaseOrder.count({ where }),
  ])

  return apiSuccess({ purchaseOrders: pos, total })
}

// POST /api/purchase-orders — create new PO
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const body = await request.json()
  const { vendorId, poDate, expectedDate, note, items, poNumberOverride } = body

  if (!vendorId || !poDate || !items?.length) {
    return apiError('Vendor, tanggal, dan items wajib diisi')
  }

  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } })
  if (!vendor) return apiError('Vendor tidak ditemukan')

  // Generate PO number
  const existingPOs = await prisma.purchaseOrder.findMany({ select: { poNumber: true } })
  const poNumber = poNumberOverride || generatePONumber(new Date(poDate), existingPOs.map(p => p.poNumber))

  // Check duplicate PO number
  const dupCheck = await prisma.purchaseOrder.findUnique({ where: { poNumber } })
  if (dupCheck) return apiError(`Nomor PO "${poNumber}" sudah digunakan`)

  // Validate SKUs and get HPP
  const skus = items.map((i: any) => i.sku)
  const products = await prisma.masterProduct.findMany({
    where: { sku: { in: skus } },
    select: { sku: true, productName: true, hpp: true },
  })
  const productMap = new Map(products.map(p => [p.sku, p]))

  const missing = skus.filter((s: string) => !productMap.has(s))
  if (missing.length > 0) return apiError(`SKU tidak ditemukan: ${missing.join(', ')}`)

  // Calculate totals
  const totalAmount = items.reduce((sum: number, item: any) => {
    const product = productMap.get(item.sku)!
    return sum + (product.hpp * item.qtyOrder)
  }, 0)

  // Create PO with items in transaction
  const po = await prisma.$transaction(async (tx) => {
    const newPO = await tx.purchaseOrder.create({
      data: {
        poNumber,
        vendorId,
        vendorName: vendor.namaVendor,
        poDate: new Date(poDate),
        expectedDate: expectedDate ? new Date(expectedDate) : null,
        totalItems: items.length,
        totalQtyOrder: items.reduce((s: number, i: any) => s + i.qtyOrder, 0),
        totalAmount,
        note: note || null,
        createdBy: session.username,
      },
    })

    await tx.purchaseOrderItem.createMany({
      data: items.map((item: any) => {
        const product = productMap.get(item.sku)!
        return {
          poId: newPO.id,
          poNumber,
          vendorId,
          vendorName: vendor.namaVendor,
          sku: item.sku,
          productName: product.productName,
          qtyOrder: item.qtyOrder,
          unitPrice: product.hpp,
        }
      }),
    })

    await tx.auditLog.create({
      data: {
        entityType: 'PurchaseOrder',
        action: 'CREATE',
        entityId: newPO.id,
        afterJson: { poNumber, vendorId, items },
        performedBy: session.username,
      },
    })

    return newPO
  })

  return apiSuccess(po, 201)
}
