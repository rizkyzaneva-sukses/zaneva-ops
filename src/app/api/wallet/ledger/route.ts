import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError, getPagination } from '@/lib/utils'

// GET /api/wallet/ledger
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const { searchParams } = request.nextUrl
  const walletId = searchParams.get('walletId') || ''
  const trxType = searchParams.get('trxType') || ''
  const dateFrom = searchParams.get('dateFrom')
  const dateTo = searchParams.get('dateTo')
  const { skip, take } = getPagination({
    page: Number(searchParams.get('page') || 1),
    limit: Number(searchParams.get('limit') || 50),
  })

  const where = {
    ...(walletId && { walletId }),
    ...(trxType && { trxType: trxType as any }),
    ...(dateFrom && { trxDate: { gte: new Date(dateFrom) } }),
    ...(dateTo && { trxDate: { lte: new Date(dateTo) } }),
  }

  const [entries, total] = await Promise.all([
    prisma.walletLedger.findMany({
      where,
      include: { wallet: { select: { name: true } } },
      orderBy: { trxDate: 'desc' },
      skip,
      take,
    }),
    prisma.walletLedger.count({ where }),
  ])

  return apiSuccess({ entries, total })
}

// POST /api/wallet/ledger — manual income/expense
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const body = await request.json()
  const { walletId, trxDate, trxType, category, amount, note, refOrderNo } = body

  if (!walletId || !trxDate || !trxType || amount === undefined) {
    return apiError('Data transaksi tidak lengkap')
  }

  // Validate wallet exists
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } })
  if (!wallet) return apiError('Wallet tidak ditemukan')

  // For TRANSFER, need destWalletId
  if (trxType === 'TRANSFER') {
    const { destWalletId, destWalletName } = body
    if (!destWalletId) return apiError('Tujuan transfer wajib diisi')
    const destWallet = await prisma.wallet.findUnique({ where: { id: destWalletId } })
    if (!destWallet) return apiError('Wallet tujuan tidak ditemukan')

    await prisma.$transaction([
      prisma.walletLedger.create({
        data: {
          walletId,
          trxDate: new Date(trxDate),
          trxType: 'TRANSFER',
          category: `Transfer ke ${destWallet.name}`,
          amount: -Math.abs(amount),
          note,
          createdBy: session.username,
        },
      }),
      prisma.walletLedger.create({
        data: {
          walletId: destWalletId,
          trxDate: new Date(trxDate),
          trxType: 'TRANSFER',
          category: `Transfer dari ${wallet.name}`,
          amount: Math.abs(amount),
          note,
          createdBy: session.username,
        },
      }),
    ])

    return apiSuccess({ message: 'Transfer berhasil' }, 201)
  }

  // Tentukan tanda amount berdasarkan tipe transaksi
  // Negatif (keluar wallet): EXPENSE, PRIVE, INVESTASI, BAYAR_UTANG, PENGEMBALIAN_MODAL
  // Positif (masuk wallet): PAYOUT, OTHER_INCOME, MODAL_MASUK, TERIMA_PIUTANG_ND
  const outTypes = ['EXPENSE', 'PRIVE', 'INVESTASI', 'BAYAR_UTANG', 'PENGEMBALIAN_MODAL']
  const finalAmount = outTypes.includes(trxType) ? -Math.abs(amount) : Math.abs(amount)

  const entry = await prisma.walletLedger.create({
    data: {
      walletId,
      trxDate: new Date(trxDate),
      trxType,
      category: category || null,
      amount: finalAmount,
      note: note || null,
      refOrderNo: refOrderNo || null,
      createdBy: session.username,
    },
  })

  return apiSuccess(entry, 201)
}
