import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError, getPagination } from '@/lib/utils'

// GET /api/products
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)

  const { searchParams } = request.nextUrl
  const search = searchParams.get('search') || ''
  const categoryId = searchParams.get('categoryId') || ''
  const isActive = searchParams.get('isActive')
  const paramLimit = searchParams.get('limit')
  const isAll = paramLimit === 'all'
  const { skip, take } = getPagination({
    page: Number(searchParams.get('page') || 1),
    limit: Number(paramLimit || 50),
  })

  const where = {
    ...(search && {
      OR: [
        { sku: { contains: search, mode: 'insensitive' as const } },
        { productName: { contains: search, mode: 'insensitive' as const } },
      ],
    }),
    ...(categoryId && { categoryId }),
    ...(isActive !== null && isActive !== '' && { isActive: isActive === 'true' }),
  }

  // Fetch all to allow natural sorting before pagination
  const allProducts = await prisma.masterProduct.findMany({
    where,
    include: { category: true },
  })

  // Natural sort by SKU
  allProducts.sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true, sensitivity: 'base' }))

  const total = allProducts.length
  const products = isAll ? allProducts : allProducts.slice(skip, skip + take)

  return apiSuccess({ products, total, skip, take: isAll ? total : take })
}

// POST /api/products
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const body = await request.json()
  const { sku, productName, categoryId, unit, hpp, rop, leadTimeDays, stokAwal, variantInfo } = body

  if (!sku || !productName) return apiError('SKU dan nama produk wajib diisi')

  const trimmedSku = sku.trim().toUpperCase()
  
  // Check duplicate SKU
  const existing = await prisma.masterProduct.findUnique({ where: { sku: trimmedSku } })
  if (existing) return apiError(`SKU "${trimmedSku}" sudah terdaftar`)

  // Get category name if categoryId provided
  let categoryName: string | null = null
  if (categoryId) {
    const cat = await prisma.productCategory.findUnique({ where: { id: categoryId } })
    categoryName = cat?.categoryName ?? null
  }

  const product = await prisma.masterProduct.create({
    data: {
      sku: trimmedSku,
      productName: productName.trim(),
      categoryId: categoryId || null,
      categoryName,
      unit: unit || 'pcs',
      hpp: hpp || 0,
      rop: rop || 0,
      leadTimeDays: leadTimeDays || 0,
      stokAwal: stokAwal || 0,
      variantInfo: variantInfo || null,
      createdBy: session.username,
    },
  })

  return apiSuccess(product, 201)
}

// DELETE /api/products — soft delete (set isActive = false)
export async function DELETE(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (session.userRole !== 'OWNER') return apiError('Forbidden', 403)

  try {
    const body = await request.json()
    const { ids } = body
    if (!ids || !Array.isArray(ids)) return apiError('Parameter ids tidak valid')

    const result = await prisma.masterProduct.updateMany({
      where: { id: { in: ids } },
      data: { isActive: false },
    })

    return apiSuccess({ message: `${result.count} produk berhasil dinonaktifkan` })
  } catch (err: any) {
    return apiError(err.message || 'Gagal menonaktifkan produk', 500)
  }
}
