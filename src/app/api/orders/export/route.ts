import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

// GET /api/orders/export
// Query: mode=order_date|payout_date, dateFrom, dateTo, platform, status
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) {
    return new Response('Unauthorized', { status: 401 })
  }
  if (!['OWNER', 'FINANCE', 'STAFF'].includes(session.userRole)) {
    return new Response('Forbidden', { status: 403 })
  }

  const { searchParams } = request.nextUrl
  const mode     = searchParams.get('mode') || 'order_date'   // 'order_date' | 'payout_date'
  const dateFrom = searchParams.get('dateFrom') || ''
  const dateTo   = searchParams.get('dateTo') || ''
  const platform = searchParams.get('platform') || ''
  const status   = searchParams.get('status') || ''

  let orders: any[] = []

  if (mode === 'payout_date') {
    // JOIN dengan payouts — ambil semua order yang cair di range ini
    const dateFilter: any = {}
    if (dateFrom) dateFilter.gte = new Date(dateFrom)
    if (dateTo)   dateFilter.lte = new Date(`${dateTo}T23:59:59.999Z`)

    orders = await prisma.order.findMany({
      where: {
        payout: {
          releasedDate: Object.keys(dateFilter).length ? dateFilter : undefined,
        },
        ...(platform && { platform }),
        ...(status && { status }),
      },
      include: { payout: { select: { releasedDate: true, totalIncome: true } } },
      orderBy: { payout: { releasedDate: 'asc' } },
    })
  } else {
    // Mode order_date — filter berdasarkan tanggal order
    const where: any = {}
    if (dateFrom) where.orderCreatedAt = { ...where.orderCreatedAt, gte: dateFrom }
    if (dateTo)   where.orderCreatedAt = { ...where.orderCreatedAt, lte: dateTo }
    if (platform) where.platform = platform
    if (status)   where.status = status

    orders = await prisma.order.findMany({
      where,
      include: { payout: { select: { releasedDate: true, totalIncome: true } } },
      orderBy: { orderCreatedAt: 'asc' },
    })
  }

  // Build CSV rows
  const csvRows = [
    [
      'No. Pesanan', 'Platform', 'SKU', 'Nama Produk', 'Qty',
      'Tgl Order', 'No. Resi', 'Nama Penerima', 'No. Telepon',
      'Kota', 'Provinsi', 'Status', 'Real Omzet', 'HPP', 'Tgl Pencairan'
    ].join(','),
    ...orders.map((o: any) => [
      csvEscape(o.orderNo),
      csvEscape(o.platform || ''),
      csvEscape(o.sku || ''),
      csvEscape(o.productName || ''),
      o.qty ?? 0,
      csvEscape(o.orderCreatedAt ? String(o.orderCreatedAt).slice(0, 10) : ''),
      csvEscape(o.airwaybill || ''),
      csvEscape(o.receiverName || ''),
      csvEscape(o.phone || ''),
      csvEscape(o.city || ''),
      csvEscape(o.province || ''),
      csvEscape(o.status || ''),
      o.realOmzet ?? 0,
      o.hpp ?? 0,
      o.payout?.releasedDate ? String(o.payout.releasedDate).slice(0, 10) : '',
    ].join(','))
  ].join('\n')

  const filename = `orders-export-${mode}-${new Date().toISOString().slice(0, 10)}.csv`

  return new Response(csvRows, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

function csvEscape(val: string): string {
  if (!val) return ''
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`
  }
  return val
}
