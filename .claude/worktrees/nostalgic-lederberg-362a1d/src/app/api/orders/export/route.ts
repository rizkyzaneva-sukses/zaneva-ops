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
  const mode     = searchParams.get('mode') || 'order_date'
  const dateFrom = searchParams.get('dateFrom') || ''
  const dateTo   = searchParams.get('dateTo') || ''
  const platform = searchParams.get('platform') || ''
  const status   = searchParams.get('status') || ''

  let orders: any[] = []

  if (mode === 'payout_date') {
    // Filter order yang terhubung ke payout.releasedDate dalam rentang
    const dateFilter: any = {}
    if (dateFrom) dateFilter.gte = new Date(dateFrom)
    if (dateTo)   dateFilter.lte = new Date(`${dateTo}T23:59:59.999Z`)

    orders = await prisma.order.findMany({
      where: {
        payout: {
          ...(Object.keys(dateFilter).length ? { releasedDate: dateFilter } : {}),
        },
        ...(platform && { platform }),
        ...(status   && { status   }),
      },
      include: { payout: { select: { releasedDate: true, totalIncome: true } } },
      orderBy: { payout: { releasedDate: 'asc' } },
    })

  } else {
    // Mode order_date — filter pakai trxDate (DateTime, lebih akurat)
    const where: any = {}
    if (dateFrom || dateTo) {
      const f: any = {}
      if (dateFrom) f.gte = new Date(dateFrom)
      if (dateTo)   f.lte = new Date(`${dateTo}T23:59:59.999Z`)
      where.trxDate = f
    }
    if (platform) where.platform = platform
    if (status)   where.status   = status

    orders = await prisma.order.findMany({
      where,
      include: { payout: { select: { releasedDate: true, totalIncome: true } } },
      orderBy: { trxDate: 'asc' },
    })

    // Fallback: jika trxDate belum diisi (data lama), coba filter orderCreatedAt (String)
    if (orders.length === 0 && (dateFrom || dateTo)) {
      const fw: any = {}
      if (dateFrom) fw.orderCreatedAt = { gte: dateFrom }
      if (dateTo)   fw.orderCreatedAt = { ...fw.orderCreatedAt, lte: dateTo + ' 23:59:59' }
      if (platform) fw.platform = platform
      if (status)   fw.status   = status

      orders = await prisma.order.findMany({
        where: fw,
        include: { payout: { select: { releasedDate: true, totalIncome: true } } },
        orderBy: { orderCreatedAt: 'asc' },
      })
    }
  }

  // BOM agar Excel buka tanpa garbled
  const BOM = '\uFEFF'
  const header = [
    'No. Pesanan', 'Platform', 'SKU', 'Nama Produk', 'Qty',
    'Tgl Order', 'Tgl Cair', 'No. Resi', 'Nama Penerima', 'No. Telepon',
    'Kota', 'Provinsi', 'Status', 'Real Omzet', 'HPP', 'Tgl Pencairan (Payout)',
  ].join(',')

  const rows = orders.map((o: any) => [
    csvEscape(o.orderNo),
    csvEscape(o.platform || ''),
    csvEscape(o.sku || ''),
    csvEscape(o.productName || ''),
    o.qty ?? 0,
    csvEscape(o.orderCreatedAt ? String(o.orderCreatedAt).slice(0, 10) : ''),
    o.trxDate ? String(o.trxDate).slice(0, 10) : '',
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

  const csv = BOM + [header, ...rows].join('\n')
  const filename = `orders-export-${mode}-${new Date().toISOString().slice(0, 10)}.csv`

  return new Response(csv, {
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
