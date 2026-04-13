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

  // ── 1. Penjualan (dari Payout, basis tanggal PENCAIRAN) ─────────────────
  const payouts = await prisma.payout.findMany({
    where: { releasedDate: { gte: fromDate, lte: toDate } },
    include: { order: { select: { hpp: true, qty: true } } },
  })

  const penjualanPerPlatform: Record<string, number> = {}
  let totalPenjualan = 0
  let totalHpp = 0
  let totalPlatformFee = 0
  let totalAmsFee = 0
  let totalBebanOngkir = 0

  for (const p of payouts) {
    const platform = p.platform || 'Lainnya'
    penjualanPerPlatform[platform] = (penjualanPerPlatform[platform] || 0) + p.totalIncome
    totalPenjualan += p.totalIncome
    totalPlatformFee += p.platformFee + (p.platformFeeOther || 0)
    totalAmsFee += p.amsFee
    totalBebanOngkir += p.bebanOngkir || 0
    if (p.order) {
      totalHpp += (p.order.hpp || 0) * (p.order as any).qty
    }
  }

  // ── 2. Pendapatan Lain (OTHER_INCOME) ────────────────────────────────────
  const otherIncomes = await prisma.walletLedger.groupBy({
    by: ['category'],
    where: {
      trxType: 'OTHER_INCOME',
      trxDate: { gte: fromDate, lte: toDate },
    },
    _sum: { amount: true },
  })
  const totalPendapatanLain = otherIncomes.reduce((s, x) => s + (x._sum.amount || 0), 0)

  // ── 3. Beban Operasional (EXPENSE) per kategori ──────────────────────────
  const expenses = await prisma.walletLedger.groupBy({
    by: ['category'],
    where: {
      trxType: 'EXPENSE',
      trxDate: { gte: fromDate, lte: toDate },
    },
    _sum: { amount: true },
  })

  const bebanPerKategori: { category: string; amount: number }[] = expenses.map((e) => ({
    category: e.category || 'Lain-lain',
    amount: Math.abs(e._sum.amount || 0),
  }))

  const totalBebanOperasional = bebanPerKategori.reduce((s, x) => s + x.amount, 0)

  // ── 4. Beban Penyusutan Aset Tetap ───────────────────────────────────────
  const asets = await prisma.asetTetap.findMany({ where: { isActive: true } })

  // Hitung penyusutan untuk setiap bulan dalam range
  const msPerMonth = 1000 * 60 * 60 * 24 * 30.4375
  let totalBebanPenyusutan = 0

  for (const aset of asets) {
    const penyusutanPerBulan = aset.nilaiPerolehan / (aset.umurEkonomisThn * 12)

    // Hitung berapa bulan aset ini aktif dalam range
    const asetStart = aset.tanggalBeli > fromDate ? aset.tanggalBeli : fromDate

    if (asetStart > toDate) continue // Aset belum dibeli saat range dimulai

    // Cek apakah sudah fully depreciated
    const bulanSampaiFullyDep = aset.umurEkonomisThn * 12
    const bulanSejakBeli = (fromDate.getTime() - aset.tanggalBeli.getTime()) / msPerMonth

    if (bulanSejakBeli >= bulanSampaiFullyDep) continue // Sudah habis massa penyusutan

    const bulanDalamRange = Math.max(0, (toDate.getTime() - asetStart.getTime()) / msPerMonth)
    const bulanEfektif = Math.min(bulanDalamRange, bulanSampaiFullyDep - Math.max(0, bulanSejakBeli))

    totalBebanPenyusutan += Math.round(penyusutanPerBulan * bulanEfektif)
  }

  // ── 5. Hitung Laba ───────────────────────────────────────────────────────
  const totalPendapatan = totalPenjualan + totalPendapatanLain
  const labaKotor = totalPenjualan - totalHpp
  const marginKotor = totalPenjualan > 0 ? (labaKotor / totalPenjualan) * 100 : 0

  const totalBeban = totalBebanOperasional + totalBebanPenyusutan
  const labaOperasional = labaKotor - totalBeban
  const marginOperasional = totalPenjualan > 0 ? (labaOperasional / totalPenjualan) * 100 : 0

  const labaBersih = labaOperasional + totalPendapatanLain
  const marginBersih = totalPenjualan > 0 ? (labaBersih / totalPenjualan) * 100 : 0

  // Breakdown fee per platform
  const shopeePayouts = payouts.filter((p) => p.platform?.toLowerCase().includes('shopee'))
  const tiktokPayouts = payouts.filter((p) => p.platform?.toLowerCase().includes('tiktok'))

  const feePlatformShopee = shopeePayouts.reduce((s, p) => s + p.platformFee + (p.platformFeeOther || 0), 0)
  const feeAmsShopee = shopeePayouts.reduce((s, p) => s + p.amsFee, 0)
  const feePlatformTiktok = tiktokPayouts.reduce((s, p) => s + p.platformFee + (p.platformFeeOther || 0), 0)
  const feeAmsTiktok = tiktokPayouts.reduce((s, p) => s + p.amsFee, 0)

  return apiSuccess({
    periode: { from: dateFrom, to: dateTo },
    pendapatan: {
      penjualanPerPlatform,
      totalPenjualan,
      pendapatanLain: { items: otherIncomes.map((x) => ({ category: x.category, amount: x._sum.amount || 0 })), total: totalPendapatanLain },
      totalPendapatan,
    },
    hpp: { totalHpp },
    labaKotor,
    marginKotor: Math.round(marginKotor * 100) / 100,
    beban: {
      perKategori: bebanPerKategori,
      totalBebanOperasional,
      bebanPenyusutan: totalBebanPenyusutan,
      totalBeban,
    },
    labaOperasional,
    marginOperasional: Math.round(marginOperasional * 100) / 100,
    labaBersih,
    marginBersih: Math.round(marginBersih * 100) / 100,
    informasiTambahan: {
      feePlatformShopee,
      feeAmsShopee,
      feePlatformTiktok,
      feeAmsTiktok,
      totalBebanOngkir,
    },
  })
}
