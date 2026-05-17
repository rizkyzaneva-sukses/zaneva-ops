import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

// GET /api/crm — buyer list aggregated from orders
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE', 'STAFF'].includes(session.userRole)) return apiError('Forbidden', 403)

  const { searchParams } = request.nextUrl
  const search   = (searchParams.get('search')   || '').trim()
  const platform = (searchParams.get('platform') || '').trim()
  const page     = Math.max(1, Number(searchParams.get('page')  || 1))
  const limit    = Math.max(1, Number(searchParams.get('limit') || 30))
  const offset   = (page - 1) * limit

  try {
    // ── Build dynamic WHERE parts as strings (safe — only controlled server values)
    const conditions: string[] = [
      // exclude cancelled orders
      `(status IS NULL OR (
        status NOT ILIKE '%batal%' AND
        status NOT ILIKE '%cancel%' AND
        status NOT ILIKE '%dibatalkan%'
      ))`,
    ]

    const params: unknown[] = []

    if (search) {
      params.push(`%${search}%`)
      const idx = params.length
      conditions.push(`(receiver_name ILIKE $${idx} OR buyer_username ILIKE $${idx})`)
    }

    if (platform) {
      params.push(platform)
      conditions.push(`platform = $${params.length}`)
    }

    const whereSQL = conditions.join(' AND ')

    // ── Main aggregate query
    const dataParams = [...params, limit, offset]
    const limitIdx  = params.length + 1
    const offsetIdx = params.length + 2

    const buyers: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        COALESCE(buyer_username, '(Tidak Diketahui)')  AS buyer_key,
        MAX(receiver_name)           AS receiver_name,
        buyer_username,
        MAX(phone)                   AS phone,
        MAX(city)                    AS city,
        MAX(province)                AS province,
        MAX(platform)                AS platform,
        COUNT(DISTINCT order_no)     AS freq_orders,
        COUNT(*)                     AS total_items,
        SUM(COALESCE(real_omzet,0))  AS total_omzet,
        MAX(order_created_at)        AS last_order_date,
        MIN(order_created_at)        AS first_order_date
      FROM orders
      WHERE ${whereSQL}
      GROUP BY buyer_username
      ORDER BY freq_orders DESC, total_omzet DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `, ...dataParams)

    // ── Count query
    const countParams = [...params]
    const countResult: any[] = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) AS cnt
      FROM (
        SELECT buyer_username
        FROM orders
        WHERE ${whereSQL}
        GROUP BY buyer_username
      ) g
    `, ...countParams)

    const total = Number(countResult[0]?.cnt ?? 0)

    return apiSuccess({
      buyers: buyers.map(b => ({
        buyerKey:      b.buyer_key,
        receiverName:  b.receiver_name,
        buyerUsername: b.buyer_username,
        phone:         b.phone,
        city:          b.city,
        province:      b.province,
        platform:      b.platform,
        freqOrders:    Number(b.freq_orders),   // jumlah order_no unik (invoice)
        totalItems:    Number(b.total_items),    // total baris (termasuk multi-SKU)
        totalOmzet:    Number(b.total_omzet),
        lastOrderDate: b.last_order_date,
        firstOrderDate:b.first_order_date,
      })),
      total,
      page,
      limit,
    })
  } catch (error: any) {
    console.error('[CRM API Error]', error)
    return apiError(`CRM query gagal: ${error.message || 'Unknown error'}`, 500)
  }
}
