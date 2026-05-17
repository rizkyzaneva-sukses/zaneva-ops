import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

// GET /api/sku-mappings — list dengan search & pagination
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search')?.trim() ?? ''
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)))
  const skip = (page - 1) * limit

  const where = search
    ? {
        OR: [
          { fromSku: { contains: search, mode: 'insensitive' as const } },
          { toSku: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : {}

  const [mappings, total] = await Promise.all([
    prisma.skuMapping.findMany({
      where,
      orderBy: { fromSku: 'asc' },
      skip,
      take: limit,
    }),
    prisma.skuMapping.count({ where }),
  ])

  return apiSuccess({ mappings, total, page, limit })
}

// POST /api/sku-mappings — buat mapping baru
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const body = await request.json()
  const fromSku = String(body.fromSku ?? '').trim()
  const toSku = String(body.toSku ?? '').trim()

  if (!fromSku || !toSku) return apiError('fromSku dan toSku wajib diisi')

  const existing = await prisma.skuMapping.findUnique({ where: { fromSku } })
  if (existing) return apiError(`SKU "${fromSku}" sudah ada di database mapping`)

  const mapping = await prisma.skuMapping.create({
    data: { fromSku, toSku, isActive: true, createdBy: session.username },
  })

  return apiSuccess(mapping)
}

// DELETE /api/sku-mappings — bulk delete by ids
export async function DELETE(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const body = await request.json()
  const ids: string[] = body.ids ?? []
  if (!ids.length) return apiError('Tidak ada ID yang dikirim')

  await prisma.skuMapping.deleteMany({ where: { id: { in: ids } } })
  return apiSuccess({ deleted: ids.length })
}
