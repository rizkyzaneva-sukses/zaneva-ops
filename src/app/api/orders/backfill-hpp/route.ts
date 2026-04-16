import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

// POST /api/orders/backfill-hpp
// Update Order.hpp dari MasterProduct.hpp berdasarkan SKU
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER'].includes(session.userRole)) return apiError('Forbidden', 403)

  // Ambil semua produk dengan HPP > 0
  const products = await prisma.masterProduct.findMany({
    where: { hpp: { gt: 0 } },
    select: { sku: true, hpp: true },
  })
  if (!products.length) return apiError('Tidak ada produk dengan HPP > 0 di master produk')

  const hppMap = new Map(products.map(p => [p.sku.toLowerCase(), p.hpp]))

  // Update Order.hpp per SKU dalam batch
  let updated = 0
  for (const [sku, hpp] of hppMap.entries()) {
    const result = await prisma.order.updateMany({
      where: {
        sku: { equals: sku, mode: 'insensitive' },
        hpp: 0,
      },
      data: { hpp },
    })
    updated += result.count
  }

  return apiSuccess({ updated, message: `${updated} order berhasil diperbarui HPP-nya` })
}
