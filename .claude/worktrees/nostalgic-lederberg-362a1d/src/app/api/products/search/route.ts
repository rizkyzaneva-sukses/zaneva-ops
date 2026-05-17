import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

// GET /api/products/search?q=ely&limit=20
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)

  const { searchParams } = request.nextUrl
  const q     = (searchParams.get('q') || '').trim()
  const limit = Math.min(Number(searchParams.get('limit') || 20), 100)

  if (!q) return apiSuccess([])

  // Ambil semua match, prioritaskan prefix SKU
  const products = await prisma.masterProduct.findMany({
    where: {
      isActive: true,
      OR: [
        { sku:         { contains: q, mode: 'insensitive' } },
        { productName: { contains: q, mode: 'insensitive' } },
      ],
    },
    select: { sku: true, productName: true, hpp: true, unit: true, categoryName: true },
    take: limit * 3, // ambil lebih untuk re-sort di app
  })

  // Sort: prefix-SKU match dulu, lalu alphabetical by SKU (natural)
  const lower = q.toLowerCase()
  const sorted = products.sort((a, b) => {
    const aPrefix = a.sku.toLowerCase().startsWith(lower) ? 0 : 1
    const bPrefix = b.sku.toLowerCase().startsWith(lower) ? 0 : 1
    if (aPrefix !== bPrefix) return aPrefix - bPrefix
    return a.sku.localeCompare(b.sku, undefined, { numeric: true, sensitivity: 'base' })
  }).slice(0, limit)

  return apiSuccess(sorted)
}
