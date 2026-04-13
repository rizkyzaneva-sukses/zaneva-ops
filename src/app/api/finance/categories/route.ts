import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

// GET /api/finance/categories
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)

  const categories = await prisma.masterExpenseCategory.findMany({
    where: { isActive: true },
    orderBy: [{ group: 'asc' }, { name: 'asc' }],
  })

  // Group by group field
  const grouped = categories.reduce((acc: Record<string, any[]>, cat) => {
    if (!acc[cat.group]) acc[cat.group] = []
    acc[cat.group].push(cat)
    return acc
  }, {})

  return apiSuccess({ categories, grouped })
}

// POST /api/finance/categories
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const body = await request.json()
  const { name, group } = body

  if (!name?.trim() || !group?.trim()) {
    return apiError('Nama dan group wajib diisi')
  }

  try {
    const cat = await prisma.masterExpenseCategory.create({
      data: { name: name.trim(), group: group.trim(), isSystem: false },
    })
    return apiSuccess(cat, 201)
  } catch (e: any) {
    if (e.code === 'P2002') return apiError('Nama kategori sudah ada')
    throw e
  }
}

// PUT /api/finance/categories (edit & toggle active)
export async function PUT(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const body = await request.json()
  const { id, name, isActive } = body

  if (!id) return apiError('ID wajib diisi')

  const cat = await prisma.masterExpenseCategory.findUnique({ where: { id } })
  if (!cat) return apiError('Kategori tidak ditemukan', 404)
  if (cat.isSystem) return apiError('Kategori system tidak dapat diubah')

  const updated = await prisma.masterExpenseCategory.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(isActive !== undefined && { isActive }),
    },
  })

  return apiSuccess(updated)
}
