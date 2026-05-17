import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'
import { format } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'

// POST /api/scan/order — scan airwaybill → update status TERKIRIM
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE', 'STAFF'].includes(session.userRole)) return apiError('Forbidden', 403)

  const body = await request.json()
  const { airwaybill, note } = body

  if (!airwaybill?.trim()) return apiError('Nomor resi wajib diisi')

  // Find order by airwaybill
  const matchedOrder = await prisma.order.findFirst({
    where: { airwaybill: airwaybill.trim() },
  })

  if (!matchedOrder) {
    return apiError(`Resi "${airwaybill}" tidak ditemukan`, 404)
  }

  // Gunakan waktu Jakarta (WIB)
  const jakartaNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))
  const terkirimStatus = `TERKIRIM | ${format(jakartaNow, 'yyyy-MM-dd')}`
  const orderNo = matchedOrder.orderNo

  // Update ALL orders with same order_no
  const updateResult = await prisma.order.updateMany({
    where: { orderNo },
    data: { status: terkirimStatus },
  })

  // get all items
  const allItems = await prisma.order.findMany({
    where: { orderNo },
    select: { sku: true, productName: true, qty: true }
  })

  // Create scan log
  await prisma.orderScanLog.create({
    data: {
      orderId: matchedOrder.id,
      orderNo,
      scannedAt: new Date(),
      scannedBy: session.userId,
      note: note || null,
    },
  })

  // Audit log
  await prisma.auditLog.create({
    data: {
      entityType: 'Order',
      action: 'SCAN',
      entityId: matchedOrder.id,
      refOrderNo: orderNo,
      afterJson: { status: terkirimStatus, airwaybill },
      performedBy: session.username,
    },
  })

  return apiSuccess({
    orderNo,
    airwaybill,
    status: terkirimStatus,
    updatedCount: updateResult.count,
    receiverName: matchedOrder.receiverName,
    productName: matchedOrder.productName,
    items: allItems,
  })
}

// GET /api/scan/order?airwaybill=XXX
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)

  const { searchParams } = new URL(request.url)
  const airwaybill = searchParams.get('airwaybill')
  if (!airwaybill) return apiError('Nomor resi wajib diisi')

  const matchedOrder = await prisma.order.findFirst({
    where: { airwaybill: airwaybill.trim() },
    select: { orderNo: true, receiverName: true, productName: true, id: true }
  })

  if (!matchedOrder) {
    return apiSuccess(null)
  }

  const allItems = await prisma.order.findMany({
    where: { orderNo: matchedOrder.orderNo },
    select: { sku: true, productName: true, qty: true }
  })

  const scanLog = await prisma.orderScanLog.findFirst({
    where: { orderNo: matchedOrder.orderNo },
    orderBy: { createdAt: 'desc' }
  })

  let operator = 'Unknown'
  let scannedAtStr = ''
  
  if (scanLog) {
    operator = scanLog.scannedBy || 'Unknown'
    if (operator !== 'Unknown') {
      const user = await prisma.appUser.findFirst({ where: { id: operator } })
      if (user) operator = user.username
    }
    scannedAtStr = formatInTimeZone(scanLog.scannedAt, 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss') + ' WIB'
  }

  return apiSuccess({
    found: !!scanLog,
    scannedAt: scannedAtStr,
    scannedBy: operator,
    orderNo: matchedOrder.orderNo,
    receiverName: matchedOrder.receiverName,
    productName: matchedOrder.productName,
    items: allItems
  })
}
