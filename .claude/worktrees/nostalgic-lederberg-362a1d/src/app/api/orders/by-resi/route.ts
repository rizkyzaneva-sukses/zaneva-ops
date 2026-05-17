import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

// GET /api/orders/by-resi?airwaybill=XXX
// Cari order berdasarkan no. resi — tanpa filter status
// (termasuk order yang sudah DICAIRKAN)
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE', 'STAFF'].includes(session.userRole)) return apiError('Forbidden', 403)

  const airwaybill = request.nextUrl.searchParams.get('airwaybill')?.trim()
  if (!airwaybill) return apiError('No. resi tidak boleh kosong')

  // Cari semua order dengan airwaybill ini (bisa lebih dari 1 jika multi-item)
  const orders = await prisma.order.findMany({
    where: { airwaybill: { equals: airwaybill, mode: 'insensitive' } },
    select: {
      id: true,
      orderNo: true,
      airwaybill: true,
      status: true,
      platform: true,
      sku: true,
      productName: true,
      qty: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  if (orders.length === 0) {
    return apiError(`Order dengan resi "${airwaybill}" tidak ditemukan`, 404)
  }

  // Group: ambil data order utama dari baris pertama
  const first = orders[0]

  // Build items list — satu baris = satu SKU
  const items = orders
    .filter(o => o.sku)
    .map(o => ({
      sku: o.sku!,
      productName: o.productName || o.sku!,
      qty: o.qty,
    }))

  return apiSuccess({
    orderId: first.id,
    orderNo: first.orderNo,
    airwaybill: first.airwaybill,
    status: first.status,
    platform: first.platform,
    items,
  })
}
