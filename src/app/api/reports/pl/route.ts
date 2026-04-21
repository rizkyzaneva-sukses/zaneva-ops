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
  const dateTo   = searchParams.get('dateTo')
  if (!dateFrom || !dateTo) return apiError('dateFrom dan dateTo wajib diisi')

  const fromDate = new Date(dateFrom)
  const toDate   = new Date(dateTo)
  toDate.setHours(23, 59, 59, 999)

  // ── 1. Payout aggregate — basis tanggal cair (releasedDate) ─────────────
  const payoutBySource = await prisma.payout.groupBy({
    by: ['source'],
    where: { releasedDate: { gte: fromDate, lte: toDate } },
    _sum: {
      totalIncome:      true,
      omzet:            true,
      platformFee:      true,
      amsFee:           true,
      platformFeeOther: true,
      bebanOngkir:      true,
    },
  })

  let pencairanBersih = 0   // SUM(totalIncome) — actual cash masuk
  let omzetKotor      = 0   // SUM(omzet) — gross sebelum fee
  let feeShopee       = 0
  let feeTikTok       = 0
  let feeAms          = 0
  let feeLainnya      = 0
  let bebanKerugianTikTok = 0

  for (const row of payoutBySource) {
    pencairanBersih += row._sum.totalIncome      ?? 0
    omzetKotor      += row._sum.omzet            ?? 0
    feeAms          += row._sum.amsFee           ?? 0
    feeLainnya      += row._sum.platformFeeOther ?? 0
    if (row.source === 'shopee_income') {
      feeShopee += row._sum.platformFee ?? 0
    } else {
      feeTikTok += row._sum.platformFee ?? 0
      bebanKerugianTikTok += row._sum.bebanOngkir ?? 0
    }
  }
  const totalFee = feeShopee + feeTikTok + feeAms + feeLainnya

  // ── 2. HPP — dari Order yang payoutnya cair di periode ini ──
  // Filter via relasi payout.releasedDate agar sejajar dengan pencairanBersih di atas.
  // Order.hpp di-set saat upload order CSV (lookup dari masterProduct saat itu).
  const paidOrders = await prisma.order.findMany({
    where: {
      sku: { not: null },
      payout: {
        releasedDate: { gte: fromDate, lte: toDate },
      },
    },
    select: { sku: true, qty: true, hpp: true },
  })

  // Hitung juga totalOrdersPaid dari payout (untuk info hint)
  const payoutCount = await prisma.payout.count({
    where: { releasedDate: { gte: fromDate, lte: toDate }, omzet: { gt: 0 } },
  })

  let hpp = 0
  const ordersFound = paidOrders.length
  for (const order of paidOrders) {
    hpp += (order.hpp ?? 0) * (order.qty ?? 1)
  }

  // ── 3. Laba Kotor (Pencairan Bersih - HPP) ──────────────────────────────
  const labaKotor = pencairanBersih - hpp

  // ── 4. Beban Operasional (EXPENSE) per kategori ─────────────────────────
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

  // ── 6. Pendapatan Lain ───────────────────────────────────────────────────
  const otherIncomes = await prisma.walletLedger.aggregate({
    where: { trxType: 'OTHER_INCOME', trxDate: { gte: fromDate, lte: toDate } },
    _sum: { amount: true },
  })
  const otherIncome = otherIncomes._sum.amount || 0

  // ── 7. Laba ──────────────────────────────────────────────────────────────
  const labaBersihOperasional = labaKotor - bebanOperasional
  const labaBersih            = labaBersihOperasional + otherIncome

  return apiSuccess({
    // Basis utama — cash masuk bersih
    pencairanBersih,
    // Info saja — tidak ikut mengurangi laba (sudah ter-net di pencairanBersih)
    omzetKotor,
    totalFee,
    feePlatformDetail: { feeShopee, feeTikTok, feeAms, feeLainnya },
    // HPP dari order yang dicairkan periode ini
    hpp,
    labaKotor,
    // Beban
    bebanOperasional,
    expenseGroups,
    // Laba
    labaBersihOperasional,
    otherIncome,
    labaBersih,
    // Info tambahan
    bebanKerugianTikTok,
    totalOrdersPaid: payoutCount,
    ordersFound,
  })
}
