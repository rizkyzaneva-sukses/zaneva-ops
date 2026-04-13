import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

// GET /api/crm — buyer list aggregated from orders
// FIX: Group by receiver_name (bukan buyer_username) supaya Shopee yang
// buyer_username-nya disensor (****) tetap muncul berdasarkan nama penerima.
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

  // Build search clause
  const searchClause = search
    ? `AND (receiver_name ILIKE '%${search.replace(/'/g, "''")}%' OR buyer_username ILIKE '%${search.replace(/'/g, "''")}%')`
    : ''
  const platformClause = platform
    ? `AND platform = '${platform.replace(/'/g, "''")}'`
    : ''

  // Aggregate buyer data from orders
  // GROUP BY receiver_name, buyer_username — receiver_name sebagai key utama
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
    WHERE status NOT ILIKE '%batal%'
      AND status NOT ILIKE '%cancel%'
      AND status NOT ILIKE '%dibatalkan%'
      ${search ? prisma.$queryRaw`AND (receiver_name ILIKE ${'%' + search + '%'} OR buyer_username ILIKE ${'%' + search + '%'})` : prisma.$queryRaw``}
      ${platform ? prisma.$queryRaw`AND platform = ${platform}` : prisma.$queryRaw``}
    GROUP BY receiver_name, buyer_username
    ORDER BY total_orders DESC
    LIMIT ${limit} OFFSET ${offset}
  `

  const totalResult = await prisma.$queryRaw<[{ cnt: bigint }]>`
    SELECT COUNT(*) AS cnt
    FROM (
      SELECT receiver_name, buyer_username
      FROM orders
      WHERE status NOT ILIKE '%batal%'
        AND status NOT ILIKE '%cancel%'
        AND status NOT ILIKE '%dibatalkan%'
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
