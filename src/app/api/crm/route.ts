import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

// GET /api/crm — buyer list aggregated from orders
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE', 'STAFF'].includes(session.userRole)) return apiError('Forbidden', 403)

  const { searchParams } = request.nextUrl
  const search = searchParams.get('search') || ''
  const platform = searchParams.get('platform') || ''
  const page = Number(searchParams.get('page') || 1)
  const limit = Number(searchParams.get('limit') || 30)
  const offset = (page - 1) * limit

  // Build WHERE conditions using Prisma.sql for safe parameterization
  const conditions: Prisma.Sql[] = [
    Prisma.sql`status NOT ILIKE '%batal%'`,
    Prisma.sql`status NOT ILIKE '%cancel%'`,
    Prisma.sql`status NOT ILIKE '%dibatalkan%'`,
  ]
  if (search) {
    conditions.push(Prisma.sql`(receiver_name ILIKE ${'%' + search + '%'} OR buyer_username ILIKE ${'%' + search + '%'})`)
  }
  if (platform) {
    conditions.push(Prisma.sql`platform = ${platform}`)
  }
  const whereClause = Prisma.join(conditions, ' AND ')

  const buyers = await prisma.$queryRaw<any[]>`
    SELECT
      COALESCE(receiver_name, buyer_username, 'Unknown') AS buyer_key,
      MAX(buyer_username) AS buyer_username,
      receiver_name,
      MAX(phone) AS phone,
      MAX(city) AS city,
      MAX(province) AS province,
      MAX(platform) AS platform,
      COUNT(DISTINCT order_no) AS total_orders,
      SUM(real_omzet) AS total_omzet,
      MAX(order_created_at) AS last_order_date,
      MIN(order_created_at) AS first_order_date
    FROM orders
    WHERE ${whereClause}
    GROUP BY receiver_name, buyer_username
    ORDER BY total_orders DESC
    LIMIT ${limit} OFFSET ${offset}
  `

  const totalResult = await prisma.$queryRaw<[{ cnt: bigint }]>`
    SELECT COUNT(*) AS cnt
    FROM (
      SELECT receiver_name, buyer_username
      FROM orders
      WHERE ${whereClause}
      GROUP BY receiver_name, buyer_username
    ) grouped
  `

  return apiSuccess({
    buyers: buyers.map(b => ({
      ...b,
      totalOrders: Number(b.total_orders),
      totalOmzet: Number(b.total_omzet),
    })),
    total: Number(totalResult[0]?.cnt ?? 0),
  })
}
