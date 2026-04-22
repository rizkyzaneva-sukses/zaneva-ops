import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

// GET /api/finance/categories
// ?all=true  → semua (aktif+nonaktif), untuk owner room CRUD
// ?all=false (default) → hanya aktif, untuk dropdown di form
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)

  const showAll = request.nextUrl.searchParams.get('all') === 'true'

  const categories = await prisma.masterExpenseCategory.findMany({
    where: showAll ? undefined : { isActive: true },
    orderBy: [{ group: 'asc' }, { name: 'asc' }],
  })

  const grouped = categories.reduce((acc: Record<string, any[]>, cat) => {
    if (!acc[cat.group]) acc[cat.group] = []
    acc[cat.group].push(cat)
    return acc
  }, {})

  return apiSuccess({ categories, grouped })
}

// POST /api/finance/categories — tambah kategori baru
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const body = await request.json()
  const { name, group, isBeban } = body

  if (!name?.trim() || !group?.trim()) {
    return apiError('Nama dan group wajib diisi')
  }

  try {
    const cat = await prisma.masterExpenseCategory.create({
      data: {
        name: name.trim(),
        group: group.trim(),
        isBeban: isBeban !== false, // default true (beban L/R)
        isSystem: false,
      },
    })
    return apiSuccess(cat, 201)
  } catch (e: any) {
    if (e.code === 'P2002') return apiError('Nama kategori sudah ada')
    throw e
  }
}

// PUT /api/finance/categories — edit nama, group, isBeban, isActive
export async function PUT(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const body = await request.json()
  const { id, name, group, isBeban, isActive } = body

  if (!id) return apiError('ID wajib diisi')

  const cat = await prisma.masterExpenseCategory.findUnique({ where: { id } })
  if (!cat) return apiError('Kategori tidak ditemukan', 404)
  if (cat.isSystem && name !== undefined) return apiError('Nama kategori system tidak dapat diubah')

  const updated = await prisma.masterExpenseCategory.update({
    where: { id },
    data: {
      ...(name !== undefined && !cat.isSystem && { name: name.trim() }),
      ...(group !== undefined && { group: group.trim() }),
      ...(isBeban !== undefined && { isBeban }),
      ...(isActive !== undefined && { isActive }),
    },
  })

  return apiSuccess(updated)
}
