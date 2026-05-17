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
          sku, productName, unit, hpp, rop, leadTimeDays,
          categoryId, categoryName, isActive 
    } = body

  const product = await prisma.masterProduct.update({
        where: { id: params.id },
        data: {
                ...(sku && { sku: sku.trim().toUpperCase() }),
                ...(productName && { productName }),
                ...(unit && { unit }),
                ...(hpp !== undefined && { hpp: Number(hpp) }),
                ...(rop !== undefined && { rop: Number(rop) }),
                ...(leadTimeDays !== undefined && { leadTimeDays: Number(leadTimeDays) }),
                ...(categoryId !== undefined && { categoryId }),
                ...(categoryName !== undefined && { categoryName }),
                ...(isActive !== undefined && { isActive }),
        },
  })

  return apiSuccess(product)
}
