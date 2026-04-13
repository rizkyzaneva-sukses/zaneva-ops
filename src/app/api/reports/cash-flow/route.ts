import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

// GET /api/reports/cash-flow?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const { searchParams } = request.nextUrl
  const dateFrom = searchParams.get('dateFrom')
  const dateTo = searchParams.get('dateTo')
  if (!dateFrom || !dateTo) return apiError('dateFrom dan dateTo wajib diisi')

  const fromDate = new Date(dateFrom)
  const toDate = new Date(dateTo)
  toDate.setHours(23, 59, 59, 999)

  const prevDate = new Date(fromDate)
  prevDate.setMilliseconds(-1)

  // ── SALDO AWAL KAS (total semua wallet sebelum fromDate) ─────────────────
  const wallets = await prisma.wallet.findMany({ where: { isActive: true } })
  let saldoAwalKas = 0
  for (const w of wallets) {
    const agg = await prisma.walletLedger.aggregate({
      where: { walletId: w.id, trxDate: { lte: prevDate } },
      _sum: { amount: true },
    })
    saldoAwalKas += agg._sum.amount || 0
  }

  // ── ARUS KAS OPERASIONAL ─────────────────────────────────────────────────

  // Penerimaan penjualan (PAYOUT)
  const payoutAgg = await prisma.walletLedger.aggregate({
    where: { trxType: 'PAYOUT', trxDate: { gte: fromDate, lte: toDate } },
    _sum: { amount: true },
  })
  const penerimaanPenjualan = payoutAgg._sum.amount || 0

  // Penerimaan lain (OTHER_INCOME)
  const otherIncomeAgg = await prisma.walletLedger.aggregate({
    where: { trxType: 'OTHER_INCOME', trxDate: { gte: fromDate, lte: toDate } },
    _sum: { amount: true },
  })
  const penerimaanLain = otherIncomeAgg._sum.amount || 0

  // Beban operasional (EXPENSE)
  const expenseAgg = await prisma.walletLedger.aggregate({
    where: { trxType: 'EXPENSE', trxDate: { gte: fromDate, lte: toDate } },
    _sum: { amount: true },
  })
  const bebanOperasional = expenseAgg._sum.amount || 0 // sudah negatif

  // Pembayaran vendor
  const vendorPayAgg = await prisma.vendorPayment.aggregate({
    where: {
      status: 'COMPLETED',
      paymentDate: { gte: fromDate, lte: toDate },
    },
    _sum: { amount: true },
  })
  const pembayaranVendor = -(vendorPayAgg._sum.amount || 0)

  const netKasOperasional = penerimaanPenjualan + penerimaanLain + bebanOperasional + pembayaranVendor

  // ── ARUS KAS INVESTASI ───────────────────────────────────────────────────
  const investasiAgg = await prisma.walletLedger.aggregate({
    where: { trxType: 'INVESTASI', trxDate: { gte: fromDate, lte: toDate } },
    _sum: { amount: true },
  })
  const pembelianAset = investasiAgg._sum.amount || 0 // sudah negatif
  const netKasInvestasi = pembelianAset

  // ── ARUS KAS PENDANAAN ───────────────────────────────────────────────────

  // Suntikan modal (MODAL_MASUK, exclude Modal Awal setup)
  const modalMasukAgg = await prisma.walletLedger.aggregate({
    where: {
      trxType: 'MODAL_MASUK',
      category: { not: 'Modal Awal' },
      trxDate: { gte: fromDate, lte: toDate },
    },
    _sum: { amount: true },
  })
  const suntikanModal = modalMasukAgg._sum.amount || 0

  // Prive
  const priveAgg = await prisma.walletLedger.aggregate({
    where: { trxType: 'PRIVE', trxDate: { gte: fromDate, lte: toDate } },
    _sum: { amount: true },
  })
  const prive = priveAgg._sum.amount || 0 // sudah negatif

  // Terima pinjaman (utang baru dalam range)
  const utangBaru = await prisma.utang.aggregate({
    where: { trxDate: { gte: fromDate, lte: toDate } },
    _sum: { amount: true },
  })
  const terimaPinjaman = utangBaru._sum.amount || 0

  // Bayar pinjaman (UtangPayment)
  const utangPayAgg = await prisma.utangPayment.aggregate({
    where: { paymentDate: { gte: fromDate, lte: toDate } },
    _sum: { amount: true },
  })
  const bayarPinjaman = -(utangPayAgg._sum.amount || 0)

  // Terima piutang (PiutangCollection)
  const piutangCollectAgg = await prisma.piutangCollection.aggregate({
    where: { collectionDate: { gte: fromDate, lte: toDate } },
    _sum: { amount: true },
  })
  const terimaPiutang = piutangCollectAgg._sum.amount || 0

  // Beri piutang (Piutang baru)
  const piutangBaru = await prisma.piutang.aggregate({
    where: { trxDate: { gte: fromDate, lte: toDate } },
    _sum: { amount: true },
  })
  const beriPiutang = -(piutangBaru._sum.amount || 0)

  const netKasPendanaan = suntikanModal + prive + terimaPinjaman + bayarPinjaman + terimaPiutang + beriPiutang

  // ── REKAP ────────────────────────────────────────────────────────────────
  const netPerubahanKas = netKasOperasional + netKasInvestasi + netKasPendanaan
  const saldoAkhirKas = saldoAwalKas + netPerubahanKas

  // Verifikasi saldo aktual sekarang
  let saldoAktual = 0
  for (const w of wallets) {
    const agg = await prisma.walletLedger.aggregate({
      where: { walletId: w.id },
      _sum: { amount: true },
    })
    saldoAktual += agg._sum.amount || 0
  }

  return apiSuccess({
    periode: { from: dateFrom, to: dateTo },
    operasional: {
      penerimaanPenjualan,
      penerimaanLain,
      bebanOperasional,
      pembayaranVendor,
      net: netKasOperasional,
    },
    investasi: {
      pembelianAset,
      net: netKasInvestasi,
    },
    pendanaan: {
      suntikanModal,
      terimaPinjaman,
      bayarPinjaman,
      prive,
      terimaPiutang,
      beriPiutang,
      net: netKasPendanaan,
    },
    saldoAwalKas,
    netPerubahanKas,
    saldoAkhirKas,
    saldoAktual,
    isBalance: Math.abs(saldoAkhirKas - saldoAktual) < 1,
  })
}
