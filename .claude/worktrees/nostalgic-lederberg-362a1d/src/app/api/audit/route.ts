import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError, getPagination } from '@/lib/utils'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (session.userRole !== 'OWNER') return apiError('Forbidden', 403)

  const { searchParams } = request.nextUrl
  const entityType = searchParams.get('entityType') || ''
  const performedBy = searchParams.get('performedBy') || ''
  const { skip, take } = getPagination({
    page: Number(searchParams.get('page') || 1),
    limit: Number(searchParams.get('limit') || 50),
  })

  const where = {
    ...(entityType && { entityType }),
    ...(performedBy && { performedBy: { contains: performedBy, mode: 'insensitive' as const } }),
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.auditLog.count({ where }),
  ])

  return apiSuccess({ logs, total })
}
