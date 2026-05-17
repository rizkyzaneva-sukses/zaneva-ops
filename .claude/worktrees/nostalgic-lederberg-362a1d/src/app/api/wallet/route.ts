import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

// GET /api/wallet — all wallets with balance
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const wallets = await prisma.wallet.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  })

  // Calculate balance per wallet from ledger
  const ledgerSums = await prisma.walletLedger.groupBy({
    by: ['walletId'],
    _sum: { amount: true },
  })

  const balanceMap = new Map(ledgerSums.map(l => [l.walletId, l._sum.amount ?? 0]))

  const result = wallets.map(w => ({
    ...w,
    balance: balanceMap.get(w.id) ?? 0,
  }))

  return apiSuccess(result)
}

// POST /api/wallet — create wallet
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const body = await request.json()
  const { name } = body
  if (!name) return apiError('Nama wallet wajib diisi')

  const wallet = await prisma.wallet.create({ data: { name } })
  return apiSuccess(wallet, 201)
}
