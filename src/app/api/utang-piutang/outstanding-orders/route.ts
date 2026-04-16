import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

// GET /api/utang-piutang/outstanding-orders
// Returns sum of realOmzet for orders with status starting with TERKIRIM, grouped by platform
export async function GET(_request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const results = await prisma.order.groupBy({
    by: ['platform'],
    where: {
      status: { startsWith: 'TERKIRIM' },
      platform: { in: ['Shopee', 'TikTok'] },
    },
    _sum: { realOmzet: true },
    _count: { id: true },
  })

  const shopee = results.find(r => r.platform === 'Shopee')
  const tiktok = results.find(r => r.platform === 'TikTok')

  return apiSuccess({
    shopee: shopee?._sum.realOmzet ?? 0,
    shopeeCount: shopee?._count.id ?? 0,
    tiktok: tiktok?._sum.realOmzet ?? 0,
    tiktokCount: tiktok?._count.id ?? 0,
  })
}
