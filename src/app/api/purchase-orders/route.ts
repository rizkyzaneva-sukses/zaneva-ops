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

// PATCH /api/purchase-orders — edit PO (OWNER only)
export async function PATCH(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (session.userRole !== 'OWNER') return apiError('Forbidden — hanya OWNER', 403)

  const body = await request.json()
  const { id, vendorId, poDate, expectedDate, note, items } = body

  if (!id) return apiError('ID PO wajib diisi')

  const po = await prisma.purchaseOrder.findUnique({ where: { id }, include: { items: true } })
  if (!po) return apiError('PO tidak ditemukan', 404)

  const vendor = vendorId ? await prisma.vendor.findUnique({ where: { id: vendorId } }) : null
  if (vendorId && !vendor) return apiError('Vendor tidak ditemukan')

  // Validate new items if provided
  let productMap = new Map<string, any>()
  if (items?.length) {
    const skus = items.map((i: any) => i.sku)
    const products = await prisma.masterProduct.findMany({
      where: { sku: { in: skus } },
      select: { sku: true, productName: true, hpp: true },
    })
    productMap = new Map(products.map(p => [p.sku, p]))
    const missing = skus.filter((s: string) => !productMap.has(s))
    if (missing.length > 0) return apiError(`SKU tidak ditemukan: ${missing.join(', ')}`)
  }

  await prisma.$transaction(async (tx) => {
    // Build update data
    const updateData: any = {}
    if (vendorId && vendor) {
      updateData.vendorId = vendorId
      updateData.vendorName = vendor.namaVendor
    }
    if (poDate) updateData.poDate = new Date(poDate)
    if (expectedDate !== undefined) updateData.expectedDate = expectedDate ? new Date(expectedDate) : null
    if (note !== undefined) updateData.note = note || null

    if (items?.length) {
      const totalAmount = items.reduce((sum: number, item: any) => {
        const p = productMap.get(item.sku)!
        return sum + (p.hpp * item.qtyOrder)
      }, 0)
      updateData.totalItems = items.length
      updateData.totalQtyOrder = items.reduce((s: number, i: any) => s + i.qtyOrder, 0)
      updateData.totalAmount = totalAmount

      // Delete old items and recreate
      await tx.purchaseOrderItem.deleteMany({ where: { poId: id } })
      await tx.purchaseOrderItem.createMany({
        data: items.map((item: any) => {
          const product = productMap.get(item.sku)!
          return {
            poId: id,
            poNumber: po.poNumber,
            vendorId: vendorId || po.vendorId,
            vendorName: vendor?.namaVendor || po.vendorName,
            sku: item.sku,
            productName: product.productName,
            qtyOrder: item.qtyOrder,
            unitPrice: product.hpp,
          }
        }),
      })
    }

    await tx.purchaseOrder.update({ where: { id }, data: updateData })
    await tx.auditLog.create({
      data: {
        entityType: 'PurchaseOrder',
        action: 'UPDATE',
        entityId: id,
        afterJson: body,
        performedBy: session.username,
      },
    })
  })

  const updated = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { items: true, vendor: { select: { namaVendor: true, kontak: true } } },
  })
  return apiSuccess(updated)
}

// DELETE /api/purchase-orders — OWNER delete / FINANCE request delete
export async function DELETE(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const body = await request.json()
  const { id, requestOnly } = body

  if (!id) return apiError('ID PO wajib diisi')

  const po = await prisma.purchaseOrder.findUnique({ where: { id } })
  if (!po) return apiError('PO tidak ditemukan', 404)

  // Finance hanya bisa request (flag note, bukan delete sungguhan)
  if (session.userRole === 'FINANCE' || requestOnly) {
    // Tandai dengan note khusus
    await prisma.purchaseOrder.update({
      where: { id },
      data: { note: `[DELETE_REQUESTED by ${session.username}] ${po.note || ''}`.trim() },
    })
    return apiSuccess({ requested: true, message: `Request delete PO ${po.poNumber} berhasil dikirim ke Owner` })
  }

  // OWNER: hapus sungguhan
  await prisma.$transaction([
    prisma.purchaseOrderItem.deleteMany({ where: { poId: id } }),
    prisma.purchaseOrder.delete({ where: { id } }),
  ])

  return apiSuccess({ deleted: true, message: `PO ${po.poNumber} berhasil dihapus` })
}
