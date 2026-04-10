import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const session = await getSession()
    if (!session.isLoggedIn) return apiError('Unauthorized', 401)
    if (session.userRole !== 'OWNER') return apiError('Forbidden', 403)

  const body = await request.json()
    const { 
          sku, name, description, unit, buyPrice, sellPrice, 
          stock, minStock, categoryId, vendorId, isActive 
    } = body

  const product = await prisma.product.update({
        where: { id: params.id },
        data: {
                ...(sku && { sku }),
                ...(name && { name }),
                ...(description !== undefined && { description }),
                ...(unit && { unit }),
                ...(buyPrice !== undefined && { buyPrice: Number(buyPrice) }),
                ...(sellPrice !== undefined && { sellPrice: Number(sellPrice) }),
                ...(stock !== undefined && { stock: Number(stock) }),
                ...(minStock !== undefined && { minStock: Number(minStock) }),
                ...(categoryId && { categoryId }),
                ...(vendorId && { vendorId }),
                ...(isActive !== undefined && { isActive }),
        },
  })

  return apiSuccess(product)
}
