import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

// POST /api/orders/backfill-hpp
// Update Order.hpp dari MasterProduct.hpp
// Prioritas lookup: (1) internal SKU langsung, (2) via SkuMapping, (3) via productName
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER'].includes(session.userRole)) return apiError('Forbidden', 403)

  const [products, skuMappings] = await Promise.all([
    prisma.masterProduct.findMany({
      where: { hpp: { gt: 0 } },
      select: { sku: true, productName: true, hpp: true },
    }),
    prisma.skuMapping.findMany({
      where: { isActive: true },
      select: { fromSku: true, toSku: true },
    }),
  ])
  if (!products.length) return apiError('Tidak ada produk dengan HPP > 0 di master produk')

  // Map: internal SKU → hpp
  const byInternalSku = new Map(products.map(p => [p.sku.toLowerCase(), p.hpp]))
  // Map: productName → hpp
  const byProductName = new Map(products.map(p => [p.productName.toLowerCase(), p.hpp]))
  // Map: marketplace fromSku → hpp (via SkuMapping + split multi-SKU)
  const byMarketplaceSku = new Map<string, number>()
  for (const m of skuMappings) {
    const toSkus = m.toSku.split('+').map(s => s.trim().toLowerCase())
    // Cari hpp dari SKU pertama yang valid (proxy untuk combined product)
    const hpp = toSkus.reduce((sum, s) => sum + (byInternalSku.get(s) ?? 0), 0)
    if (hpp > 0) byMarketplaceSku.set(m.fromSku.toLowerCase(), hpp)
  }

  // Ambil semua order yang hpp-nya 0
  const zeroOrders = await prisma.order.findMany({
    where: { hpp: 0, sku: { not: null } },
    select: { id: true, sku: true },
  })

  let updated = 0
  for (const order of zeroOrders) {
    const key = (order.sku ?? '').toLowerCase()
    const hpp = byInternalSku.get(key)
      ?? byMarketplaceSku.get(key)
      ?? byProductName.get(key)
      ?? 0
    if (hpp > 0) {
      await prisma.order.update({ where: { id: order.id }, data: { hpp } })
      updated++
    }
  }

  return apiSuccess({ updated, message: `${updated} order berhasil diperbarui HPP-nya` })
}
