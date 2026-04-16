import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

// GET /api/payouts/summary
// Query: dateFrom, dateTo, walletId
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const { searchParams } = request.nextUrl
  const dateFrom = searchParams.get('dateFrom')
  const dateTo   = searchParams.get('dateTo')
  const walletId = searchParams.get('walletId') || ''

  // ── Build date range ────────────────────────────────
  const dateFilter: { gte?: Date; lte?: Date } = {}
  if (dateFrom) dateFilter.gte = new Date(dateFrom)
  if (dateTo)   dateFilter.lte = new Date(`${dateTo}T23:59:59.999Z`)

  const payoutWhere: Record<string, unknown> = {}
  if (Object.keys(dateFilter).length) payoutWhere.releasedDate = dateFilter
  if (walletId) payoutWhere.walletId = walletId

  // ── Query 1: GROUP BY platform from payouts ─────────
  const platformGroups = await prisma.payout.groupBy({
    by: ['platform'],
    where: payoutWhere as Parameters<typeof prisma.payout.groupBy>[0]['where'],
    _sum: {
      omzet: true,
      totalIncome: true,
      platformFee: true,
      amsFee: true,
      platformFeeOther: true,
    },
  })

  // ── Query 2: Beban Ongkir from payout table (new source after fix) ─────────
  const bebanGroups = await prisma.payout.groupBy({
    by: ['platform'],
    where: payoutWhere as Parameters<typeof prisma.payout.groupBy>[0]['where'],
    _sum: { bebanOngkir: true },
  })

  let bebanShopee = 0
  let bebanTikTok = 0
  for (const g of bebanGroups) {
    const p = (g.platform ?? '').toLowerCase()
    if (p === 'shopee') bebanShopee = g._sum.bebanOngkir ?? 0
    else if (p === 'tiktok') bebanTikTok = g._sum.bebanOngkir ?? 0
  }

  // ── Shape response ───────────────────────────────────
  type PlatformSummary = {
    omzet: number
    totalCair: number
    feePlatform: number
    feeAms: number
    feeLainnya: number
  }

  const empty = (): PlatformSummary => ({
    omzet: 0, totalCair: 0, feePlatform: 0, feeAms: 0, feeLainnya: 0,
  })

  const shopee = empty()
  const tiktok = empty()
  const total  = empty()

  for (const g of platformGroups) {
    const s = g._sum
    const obj: PlatformSummary = {
      omzet:       s.omzet        ?? 0,
      totalCair:   s.totalIncome  ?? 0,
      feePlatform: s.platformFee  ?? 0,
      feeAms:      s.amsFee       ?? 0,
      feeLainnya:  s.platformFeeOther ?? 0,
    }
    const p = (g.platform ?? '').toLowerCase()
    if (p === 'shopee') {
      Object.assign(shopee, obj)
    } else if (p === 'tiktok') {
      Object.assign(tiktok, obj)
    }
    // Accumulate into total regardless of platform
    total.omzet       += obj.omzet
    total.totalCair   += obj.totalCair
    total.feePlatform += obj.feePlatform
    total.feeAms      += obj.feeAms
    total.feeLainnya  += obj.feeLainnya
  }

  return apiSuccess({
    shopee,
    tiktok,
    bebanOngkir: {
      shopee: bebanShopee,
      tiktok: bebanTikTok,
      total:  bebanShopee + bebanTikTok,
    },
    total,
  })
}
