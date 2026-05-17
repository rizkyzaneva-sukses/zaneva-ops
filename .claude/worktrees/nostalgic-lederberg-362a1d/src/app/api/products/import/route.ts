import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const body = await request.json()
  const { products } = body

  if (!Array.isArray(products) || products.length === 0) {
    return apiError('Data produk kosong atau tidak valid')
  }

  let successCount = 0
  let errorCount = 0
  const errors: string[] = []

  for (const item of products) {
    try {
      const { sku, productName, categoryName, unit, hpp, rop, leadTimeDays, stokAwal } = item

      if (!sku || !productName) {
        throw new Error(`SKU dan Nama Produk wajib diisi: ${JSON.stringify(item)}`)
      }

      // Check duplicate SKU
      const existing = await prisma.masterProduct.findUnique({ where: { sku: sku.toString().trim().toUpperCase() } })

      let categoryId = null
      let matchedCategoryName = null

      if (categoryName) {
        let cat = await prisma.productCategory.findFirst({
          where: { categoryName: { equals: categoryName.trim(), mode: 'insensitive' } }
        })
        if (!cat) {
          // auto create category if doesn't exist
          cat = await prisma.productCategory.create({
            data: { categoryName: categoryName.trim() }
          })
        }
        categoryId = cat.id
        matchedCategoryName = cat.categoryName
      }

      if (existing) {
        // Update data jika SKU sudah ada
        await prisma.masterProduct.update({
          where: { id: existing.id },
          data: {
            productName: productName?.toString().trim() || existing.productName,
            ...(categoryId && { categoryId }),
            ...(matchedCategoryName && { categoryName: matchedCategoryName }),
            unit: unit || existing.unit,
            hpp: hpp !== undefined && hpp !== '' ? Number(hpp) : existing.hpp,
            rop: rop !== undefined && rop !== '' ? Number(rop) : existing.rop,
            leadTimeDays: leadTimeDays !== undefined && leadTimeDays !== '' ? Number(leadTimeDays) : existing.leadTimeDays,
            stokAwal: stokAwal !== undefined && stokAwal !== '' ? Number(stokAwal) : existing.stokAwal,
          }
        })
      } else {
        // Buat baru jika belum ada
        await prisma.masterProduct.create({
          data: {
            sku: sku.toString().trim().toUpperCase(),
            productName: productName.toString().trim(),
            categoryId,
            categoryName: matchedCategoryName,
            unit: unit || 'pcs',
            hpp: Number(hpp) || 0,
            rop: Number(rop) || 0,
            leadTimeDays: Number(leadTimeDays) || 0,
            stokAwal: Number(stokAwal) || 0,
            createdBy: session.username,
          },
        })
      }
      successCount++
    } catch (err: any) {
      errorCount++
      errors.push(err.message || 'Unknown error')
    }
  }

  return apiSuccess({
    message: `Berhasil import ${successCount} produk. Gagal: ${errorCount}.`,
    errors: errors.slice(0, 10) // Tampilkan max 10 error
  }, 201)
}
