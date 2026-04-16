import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

// GET /api/reports/pl?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD
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

  const dateFilterOrders = {
    orderCreatedAt: { gte: dateFrom, lte: dateTo + ' 23:59:59' }
  }

  // ── 1. Penjualan & HPP (dari Order, basis tanggal transaksi/upload) ─────
  const orderAgg = await prisma.order.aggregate({
    where: {
      ...dateFilterOrders,
      NOT: [
        { status: { contains: 'batal' } },
        { status: { contains: 'Cancel' } },
        { status: { contains: 'Dibatalkan' } },
      ],
    },
    _sum: { realOmzet: true, hpp: true },
  })

  const pendapatanKotor = orderAgg._sum.realOmzet || 0
  const hpp = orderAgg._sum.hpp || 0
  const labaKotor = pendapatanKotor - hpp

  // ── 2. Biaya Penjualan (Fee Platform & AMS) dari Payout ─────────────────
  const payoutBySource = await prisma.payout.groupBy({
    by: ['source'],
    where: { releasedDate: { gte: fromDate, lte: toDate } },
    _sum: { platformFee: true, amsFee: true, platformFeeOther: true, bebanOngkir: true },
  })

  let feeShopee = 0, feeTikTok = 0, feeAms = 0, feeLainnya = 0, bebanKerugianTikTok = 0
  for (const row of payoutBySource) {
    const pf  = row._sum.platformFee      || 0
    const af  = row._sum.amsFee           || 0
    const pfo = row._sum.platformFeeOther || 0
    const bo  = row._sum.bebanOngkir      || 0
    feeAms     += af
    feeLainnya += pfo
    if (row.source === 'shopee_income') feeShopee  += pf
    else                                feeTikTok  += pf
    if (row.source === 'tiktok_income') bebanKerugianTikTok += bo
  }
  const feePlatform = feeShopee + feeTikTok + feeAms + feeLainnya

  // ── 3. Pendapatan Lain (OTHER_INCOME) ────────────────────────────────────
  const otherIncomes = await prisma.walletLedger.aggregate({
    where: { trxType: 'OTHER_INCOME', trxDate: { gte: fromDate, lte: toDate } },
    _sum: { amount: true },
  })
  const otherIncome = otherIncomes._sum.amount || 0

  // ── 4. Beban Operasional (EXPENSE) per kategori ──────────────────────────
  const expenses = await prisma.walletLedger.groupBy({
    by: ['category'],
    where: { trxType: 'EXPENSE', trxDate: { gte: fromDate, lte: toDate } },
    _sum: { amount: true },
  })

  let bebanOperasional = 0
  const expenseGroups: { group: string; amount: number }[] = expenses.map(e => {
    const amt = Math.abs(e._sum.amount || 0)
    bebanOperasional += amt
    return { group: e.category || 'Lain-lain', amount: amt }
  })

  // ── 5. Beban Penyusutan Aset Tetap ───────────────────────────────────────
  const asets = await prisma.asetTetap.findMany({ where: { isActive: true } })
  const msPerMonth = 1000 * 60 * 60 * 24 * 30.4375
  let totalBebanPenyusutan = 0

  for (const aset of asets) {
    const penyusutanPerBulan = aset.nilaiPerolehan / (aset.umurEkonomisThn * 12)
    const asetStart = aset.tanggalBeli > fromDate ? aset.tanggalBeli : fromDate
    if (asetStart > toDate) continue
    
    const bulanSampaiFullyDep = aset.umurEkonomisThn * 12
    const bulanSejakBeli = (fromDate.getTime() - aset.tanggalBeli.getTime()) / msPerMonth
    if (bulanSejakBeli >= bulanSampaiFullyDep) continue

    const bulanDalamRange = Math.max(0, (toDate.getTime() - asetStart.getTime()) / msPerMonth)
    const bulanEfektif = Math.min(bulanDalamRange, bulanSampaiFullyDep - Math.max(0, bulanSejakBeli))
    totalBebanPenyusutan += Math.round(penyusutanPerBulan * bulanEfektif)
  }

  if (totalBebanPenyusutan > 0) {
    bebanOperasional += totalBebanPenyusutan
    expenseGroups.push({ group: 'Penyusutan Aset Tetap', amount: totalBebanPenyusutan })
  }

  // ── 6. Hitung Laba ───────────────────────────────────────────────────────
  const labaBersihOperasional = labaKotor - feePlatform - bebanOperasional
  const labaBersih = labaBersihOperasional + otherIncome

  return apiSuccess({
    pendapatanKotor,
    hpp,
    labaKotor,
    feePlatform,
    feePlatformDetail: { feeShopee, feeTikTok, feeAms, feeLainnya },
    bebanOperasional,
    expenseGroups,
    labaBersihOperasional,
    otherIncome,
    labaBersih,
    bebanKerugianTikTok,
  })
}
