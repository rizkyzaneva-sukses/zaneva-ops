import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError, getPagination } from '@/lib/utils'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const { searchParams } = request.nextUrl
  const vendorId = searchParams.get('vendorId') || ''
  const { skip, take } = getPagination({
    page: Number(searchParams.get('page') || 1),
    limit: Number(searchParams.get('limit') || 20),
  })

  const [payments, total] = await Promise.all([
    prisma.vendorPayment.findMany({
      where: { ...(vendorId && { vendorId }) },
      orderBy: { paymentDate: 'desc' },
      skip, take,
    }),
    prisma.vendorPayment.count({ where: { ...(vendorId && { vendorId }) } }),
  ])

  return apiSuccess({ payments, total })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const body = await request.json()
  const { vendorId, poId, walletId, paymentDate, amount, paymentType, note } = body

  if (!vendorId || !walletId || !amount || !paymentDate) return apiError('Data pembayaran tidak lengkap')

  const [vendor, wallet, po] = await Promise.all([
    prisma.vendor.findUnique({ where: { id: vendorId } }),
    prisma.wallet.findUnique({ where: { id: walletId } }),
    poId ? prisma.purchaseOrder.findUnique({ where: { id: poId } }) : Promise.resolve(null),
  ])

  if (!vendor) return apiError('Vendor tidak ditemukan')
  if (!wallet) return apiError('Wallet tidak ditemukan')

  const payment = await prisma.$transaction(async (tx) => {
    // Create payment record
    const pay = await tx.vendorPayment.create({
      data: {
        paymentDate: new Date(paymentDate),
        vendorId,
        vendorName: vendor.namaVendor,
        poId: poId || null,
        poNumber: po?.poNumber || null,
        walletId,
        walletName: wallet.name,
        amount: Number(amount),
        paymentType: paymentType || 'PELUNASAN',
        note: note || null,
        createdBy: session.username,
      },
    })

    // Debit wallet — pakai VENDOR_PAYMENT agar tidak masuk beban operasional P&L
    await tx.walletLedger.create({
      data: {
        walletId,
        trxDate: new Date(paymentDate),
        trxType: 'VENDOR_PAYMENT',
        category: `Bayar Vendor - ${vendor.namaVendor}`,
        amount: -Math.abs(Number(amount)),
        note: note || null,
        createdBy: session.username,
      },
    })

    // Update PO total_paid + payment_status
    if (po) {
      const newPaid = po.totalPaid + Number(amount)
      const paymentStatus = newPaid >= po.totalAmount ? 'PAID'
        : newPaid > 0 ? 'PARTIAL_PAID' : 'UNPAID'
      await tx.purchaseOrder.update({
        where: { id: poId },
        data: { totalPaid: newPaid, paymentStatus },
      })
    }

    return pay
  })

  return apiSuccess(payment, 201)
}
