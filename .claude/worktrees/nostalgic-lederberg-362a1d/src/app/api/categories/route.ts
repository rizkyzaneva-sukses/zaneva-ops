import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)

  const categories = await prisma.productCategory.findMany({
    where: { isActive: true },
    orderBy: { categoryName: 'asc' },
  })
  return apiSuccess({ categories })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const { categoryName, description } = await request.json()
  if (!categoryName) return apiError('Nama kategori wajib diisi')

  const cat = await prisma.productCategory.create({ data: { categoryName, description } })
  return apiSuccess(cat, 201)
}
