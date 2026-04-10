import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)

  const { searchParams } = request.nextUrl
  const type = searchParams.get('type')

  const filter: any = { isActive: true }
  
  if (type === 'PAYOUT' || type === 'OTHER_INCOME') {
    filter.categoryType = 'OTHER_INCOME'
  } else if (type === 'EXPENSE') {
    filter.categoryType = { in: ['EXPENSE_BEBAN', 'EXPENSE_NON_BEBAN'] }
  }

  const categories = await prisma.masterCategory.findMany({
    where: filter,
    orderBy: { name: 'asc' },
  })

  // Deduplikasi berdasarkan name khusus untuk merapikan datalist
  const uniqueNames = new Set<string>()
  const uniqueCategories = categories.filter(c => {
    if (uniqueNames.has(c.name.toLowerCase())) return false
    uniqueNames.add(c.name.toLowerCase())
    return true
  })

  return apiSuccess(uniqueCategories)
}
