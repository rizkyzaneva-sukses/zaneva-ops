import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError, getPagination } from '@/lib/utils'
import { parseShopeeOrders, parseTikTokOrders, detectPlatform } from '@/lib/order-parsers'

/**
 * Parse raw order_created_at string menjadi Date untuk kolom trx_date
 * Format TikTok: "09/04/2026 00:17:22" (DD/MM/YYYY HH:mm:ss)
 * Format Shopee: "2026-04-09 06:19"    (YYYY-MM-DD HH:mm)
 */
function parseOrderDate(raw: string | null | undefined): Date | null {
  if (!raw) return null
  // Format Shopee: "2026-04-09 06:19"
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return new Date(raw.replace(' ', 'T') + ':00+07:00')
  }
  // Format TikTok: "09/04/2026 00:17:22"
  if (/^\d{2}\/\d{2}\/\d{4}/.test(raw)) {
    const [datePart, timePart] = raw.split(' ')
    const [d, m, y] = datePart.split('/')
    return new Date(`${y}-${m}-${d}T${timePart || '00:00:00'}+07:00`)
  }
  return null
}

// GET /api/orders
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE', 'STAFF'].includes(session.userRole)) return apiError('Forbidden', 403)

  const { searchParams } = request.nextUrl
  const search = searchParams.get('search') || ''
  const statusGroup = searchParams.get('statusGroup') || ''
  const platform = searchParams.get('platform') || ''
  const dateFrom = searchParams.get('dateFrom')
  const dateTo = searchParams.get('dateTo')
  const { skip, take } = getPagination({
    page: Number(searchParams.get('page') || 1),
    limit: Number(searchParams.get('limit') || 50),
  })

  let statusFilter: object | undefined
  if (statusGroup === 'perlu_dikirim') {
    statusFilter = {
      AND: [
        { status: { not: { startsWith: 'TERKIRIM' } } },
        { NOT: { OR: [
          { status: { contains: 'Batal' } },
          { status: { contains: 'Cancel' } },
          { status: { contains: 'Dibatalkan' } },
        ]}},
      ],
    }
  } else if (statusGroup === 'terkirim') {
    statusFilter = { status: { startsWith: 'TERKIRIM' } }
  } else if (statusGroup === 'dicairkan') {
    statusFilter = { payout: { isNot: null } }
  } else if (statusGroup === 'batal') {
    statusFilter = {
      OR: [
        { status: { contains: 'Batal' } },
        { status: { contains: 'Cancel' } },
        { status: { contains: 'Dibatalkan' } },
      ],
    }
  }

  const where = {
    ...(search && {
      OR: [
        { orderNo: { contains: search, mode: 'insensitive' as const } },
        { airwaybill: { contains: search, mode: 'insensitive' as const } },
        { receiverName: { contains: search, mode: 'insensitive' as const } },
        { productName: { contains: search, mode: 'insensitive' as const } },
        { buyerUsername: { contains: search, mode: 'insensitive' as const } },
        { sku: { contains: search, mode: 'insensitive' as const } },
      ],
    }),
    ...(platform && { platform }),
    ...(dateFrom && { orderCreatedAt: { gte: dateFrom } }),
    ...(dateTo && { orderCreatedAt: { lte: dateTo } }),
    ...statusFilter,
  }

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: { payout: { select: { releasedDate: true, totalIncome: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.order.count({ where }),
  ])

  return apiSuccess({ orders, total })
}

// POST /api/orders — import file mentah TikTok/Shopee langsung
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE', 'STAFF'].includes(session.userRole)) return apiError('Forbidden', 403)

  const body = await request.json()
  const { rawRows, headers } = body

  if (!Array.isArray(rawRows) || rawRows.length === 0) return apiError('Data kosong')

  // Auto-detect platform dari header kolom
  const platform = detectPlatform(headers ?? Object.keys(rawRows[0] ?? {}))
  if (!platform) {
    return apiError('Format file tidak dikenali. Pastikan upload file ekspor dari TikTok atau Shopee.')
  }

  // HPP map: sku.toLowerCase() → hpp
  const products = await prisma.masterProduct.findMany({ select: { sku: true, hpp: true } })
  const hppMap = new Map(products.map(p => [p.sku.toLowerCase(), p.hpp]))

  // Parse
  const parsed = platform === 'Shopee'
    ? parseShopeeOrders(rawRows, hppMap)
    : parseTikTokOrders(rawRows, hppMap)

  if (parsed.length === 0) {
    return apiError('Tidak ada data valid — semua order mungkin berstatus batal.')
  }

  // Cek duplikat berdasarkan orderNo + sku
  const existingOrderNos = [...new Set(parsed.map(p => p.orderNo))]
  const existing = await prisma.order.findMany({
    where: { orderNo: { in: existingOrderNos } },
    select: { orderNo: true, sku: true },
  })
  const existingKeys = new Set(existing.map(e => `${e.orderNo}__${e.sku ?? ''}`))

  const toInsert = parsed.filter(p => !existingKeys.has(`${p.orderNo}__${p.sku ?? ''}`))
  const skipped = parsed.length - toInsert.length

  if (toInsert.length === 0) {
    if (body.preview) {
      return apiSuccess({
        platform,
        totalParsed: parsed.length,
        skipped,
        toInsertCount: 0,
        previewItems: [],
      })
    }
    return apiSuccess({ inserted: 0, skipped, platform, message: 'Semua data sudah ada.' })
  }

  if (body.preview) {
    return apiSuccess({
      platform,
      totalParsed: parsed.length,
      skipped,
      toInsertCount: toInsert.length,
      previewItems: toInsert.slice(0, 5), // Preview first 5 items
    })
  }

  // Chunked insert — tidak ada batas baris, 500 per chunk
  const rows = toInsert.map(o => ({
    orderNo: o.orderNo,
    status: o.status,
    platform: o.platform,
    airwaybill: o.airwaybill,
    orderCreatedAt: o.orderCreatedAt,
    trxDate: parseOrderDate(o.orderCreatedAt),  // parsed DateTime untuk filter yg reliable
    sku: o.sku,
    productName: o.productName,
    qty: o.qty,
    totalProductPrice: o.totalProductPrice,
    realOmzet: o.realOmzet,
    city: o.city,
    province: o.province,
    buyerUsername: o.buyerUsername,
    receiverName: o.receiverName,
    phone: o.phone,
    hpp: o.hpp,
    createdBy: session.username,
  }))

  let inserted = 0
  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const r = await prisma.order.createMany({ data: chunk })
    inserted += r.count
  }

  return apiSuccess({
    inserted,
    skipped,
    platform,
    message: `${inserted} order ${platform} berhasil diimport${skipped > 0 ? `, ${skipped} dilewati (duplikat)` : ''}.`,
  })
}

// DELETE /api/orders — Bulk delete by ids
export async function DELETE(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE', 'STAFF'].includes(session.userRole)) return apiError('Forbidden', 403)

  const body = await request.json()
  const { ids } = body

  if (!Array.isArray(ids) || ids.length === 0) {
    return apiError('Tidak ada ID yang dikirim.')
  }

  const { count } = await prisma.order.deleteMany({
    where: { id: { in: ids } },
  })

  return apiSuccess({ message: `${count} pesanan berhasil dihapus!` })
}

// ── Chunked insert helper (tidak ada batas baris) ─────
// Dipanggil dari POST di atas, replace createMany biasa
async function insertInChunks(
  data: any[],
  chunkSize = 500
): Promise<number> {
  let total = 0
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize)
    const res = await prisma.order.createMany({ data: chunk })
    total += res.count
  }
  return total
}
