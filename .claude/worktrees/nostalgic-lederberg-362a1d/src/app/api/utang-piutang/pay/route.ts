import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

// POST /api/utang-piutang/pay — bayar utang atau terima piutang
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const body = await request.json()
  const { entityType, entityId, walletId, amount, paymentDate, note } = body

  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } })
  if (!wallet) return apiError('Wallet tidak ditemukan')

  if (entityType === 'utang') {
    const utang = await prisma.utang.findUnique({ where: { id: entityId } })
    if (!utang) return apiError('Utang tidak ditemukan')

    const newPaid = utang.amountPaid + Number(amount)
    const status = newPaid >= utang.amount ? 'PAID' : 'PARTIAL'

    await prisma.$transaction(async (tx) => {
      await tx.utangPayment.create({
        data: {
          utangId: entityId,
          paymentDate: new Date(paymentDate),
          amount: Number(amount),
          walletId,
          walletName: wallet.name,
          note: note || null,
        },
      })
      await tx.utang.update({
        where: { id: entityId },
        data: { amountPaid: newPaid, status },
      })
      // Debit wallet (bayar utang)
      await tx.walletLedger.create({
        data: {
          walletId,
          trxDate: new Date(paymentDate),
          trxType: 'EXPENSE',
          category: `Bayar Utang - ${utang.creditorName}`,
          amount: -Math.abs(Number(amount)),
          note: note || null,
          createdBy: session.username,
        },
      })
    })
    return apiSuccess({ message: 'Pembayaran utang berhasil', status })
  }

  if (entityType === 'piutang') {
    const piutang = await prisma.piutang.findUnique({ where: { id: entityId } })
    if (!piutang) return apiError('Piutang tidak ditemukan')

    const newCollected = piutang.amountCollected + Number(amount)
    const status = newCollected >= piutang.amount ? 'COLLECTED' : 'PARTIAL'

    await prisma.$transaction(async (tx) => {
      await tx.piutangCollection.create({
        data: {
          piutangId: entityId,
          collectionDate: new Date(paymentDate),
          amount: Number(amount),
          walletId,
          walletName: wallet.name,
          note: note || null,
        },
      })
      await tx.piutang.update({
        where: { id: entityId },
        data: { amountCollected: newCollected, status },
      })
      // Credit wallet (terima bayaran piutang)
      await tx.walletLedger.create({
        data: {
          walletId,
          trxDate: new Date(paymentDate),
          trxType: 'OTHER_INCOME',
          category: `Terima Piutang - ${piutang.debtorName}`,
          amount: Math.abs(Number(amount)),
          note: note || null,
          createdBy: session.username,
        },
      })
    })
    return apiSuccess({ message: 'Penerimaan piutang berhasil', status })
  }

  return apiError('entityType harus utang atau piutang')
}
