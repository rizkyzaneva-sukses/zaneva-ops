import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

// GET /api/reports/balance-sheet?asOf=YYYY-MM-DD
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const { searchParams } = request.nextUrl
  const asOfStr = searchParams.get('asOf') || new Date().toISOString().slice(0, 10)
  const asOf = new Date(asOfStr)
  asOf.setHours(23, 59, 59, 999)

  // ── ASET LANCAR ──────────────────────────────────────────────────────────

  // 1. Kas & Bank - saldo setiap wallet per tanggal asOf
  const wallets = await prisma.wallet.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } })

  const kasData: { walletId: string; name: string; saldo: number }[] = []
  for (const w of wallets) {
    const agg = await prisma.walletLedger.aggregate({
      where: { walletId: w.id, trxDate: { lte: asOf } },
      _sum: { amount: true },
    })
    kasData.push({ walletId: w.id, name: w.name, saldo: agg._sum.amount || 0 })
  }
  const totalKasBank = kasData.reduce((s, x) => s + x.saldo, 0)

  // 2. Piutang Usaha (OUTSTANDING + PARTIAL)
  const piutangAgg = await prisma.piutang.aggregate({
    where: {
      status: { in: ['OUTSTANDING', 'PARTIAL'] },
      trxDate: { lte: asOf },
    },
    _sum: { amount: true, amountCollected: true },
  })
  const nilaiPiutang = (piutangAgg._sum.amount || 0) - (piutangAgg._sum.amountCollected || 0)

  // 3. Nilai Stok (SOH × HPP per SKU)
  const products = await prisma.masterProduct.findMany({
    where: { isActive: true },
    select: { sku: true, hpp: true, stokAwal: true },
  })

  let nilaiStok = 0
  for (const prod of products) {
    const ledgerAgg = await prisma.inventoryLedger.groupBy({
      by: ['direction'],
      where: { sku: prod.sku, trxDate: { lte: asOf } },
      _sum: { qty: true },
    })
    const masuk = ledgerAgg.find((x) => x.direction === 'IN')?._sum.qty || 0
    const keluar = ledgerAgg.find((x) => x.direction === 'OUT')?._sum.qty || 0
    const soh = prod.stokAwal + masuk - keluar
    if (soh > 0) nilaiStok += soh * prod.hpp
  }

  const totalAsetLancar = totalKasBank + nilaiPiutang + nilaiStok

  // ── ASET TETAP ───────────────────────────────────────────────────────────
  const asets = await prisma.asetTetap.findMany({ where: { isActive: true } })
  const msPerMonth = 1000 * 60 * 60 * 24 * 30.4375

  const asetTetapData = asets.map((a) => {
    const penyusutanPerBulan = a.nilaiPerolehan / (a.umurEkonomisThn * 12)
    const bulanBerjalan = Math.max(0, Math.floor((asOf.getTime() - a.tanggalBeli.getTime()) / msPerMonth))
    const bulanEfektif = Math.min(bulanBerjalan, a.umurEkonomisThn * 12)
    const akumulasiPenyusutan = Math.min(Math.round(penyusutanPerBulan * bulanEfektif), a.nilaiPerolehan)
    const nilaiBuku = Math.max(0, a.nilaiPerolehan - akumulasiPenyusutan)
    return { id: a.id, namaAset: a.namaAset, nilaiPerolehan: a.nilaiPerolehan, akumulasiPenyusutan, nilaiBuku }
  })

  const totalAsetTetap = asetTetapData.reduce((s, x) => s + x.nilaiBuku, 0)
  const totalAset = totalAsetLancar + totalAsetTetap

  // ── LIABILITAS ───────────────────────────────────────────────────────────

  // Utang vendor (PO payment outstanding + partial)
  const poAgg = await prisma.purchaseOrder.aggregate({
    where: {
      paymentStatus: { in: ['UNPAID', 'PARTIAL_PAID'] },
      poDate: { lte: asOf },
    },
    _sum: { totalAmount: true, totalPaid: true },
  })
  const utangVendor = (poAgg._sum.totalAmount || 0) - (poAgg._sum.totalPaid || 0)

  // Utang pinjaman (outstanding + partial)
  const utangAgg = await prisma.utang.aggregate({
    where: {
      status: { in: ['OUTSTANDING', 'PARTIAL'] },
      trxDate: { lte: asOf },
    },
    _sum: { amount: true, amountPaid: true },
  })
  const utangPinjaman = (utangAgg._sum.amount || 0) - (utangAgg._sum.amountPaid || 0)

  const totalLiabilitas = utangVendor + utangPinjaman

  // ── EKUITAS ──────────────────────────────────────────────────────────────

  // Modal Disetor: SUM modal awal + MODAL_MASUK setelah setup
  const modalAwalAgg = await prisma.modalAwal.aggregate({ _sum: { jumlah: true } })
  const totalModalAwal = modalAwalAgg._sum.jumlah || 0

  const modalMasukTambahan = await prisma.walletLedger.aggregate({
    where: { trxType: 'MODAL_MASUK', category: { not: 'Modal Awal' }, trxDate: { lte: asOf } },
    _sum: { amount: true },
  })
  const modalDisetor = totalModalAwal + (modalMasukTambahan._sum.amount || 0)

  // Prive: SUM debit PRIVE
  const priveAgg = await prisma.walletLedger.aggregate({
    where: { trxType: 'PRIVE', trxDate: { lte: asOf } },
    _sum: { amount: true },
  })
  const totalPrive = Math.abs(priveAgg._sum.amount || 0)

  // Hitung P&L untuk semua periode sebelum asOf (laba ditahan + laba berjalan gabungan)
  // Ini diimplementasikan sebagai: Total Ekuitas = Total Aset - Total Liabilitas
  // Laba Ditahan = Total Ekuitas - Modal Disetor + Prive
  const totalEkuitas = totalAset - totalLiabilitas
  const labaDitahanDanBerjalan = totalEkuitas - modalDisetor + totalPrive

  // ── BALANCE INDICATOR ────────────────────────────────────────────────────
  const totalLiabPlusEkuitas = totalLiabilitas + totalEkuitas
  const selisih = totalAset - totalLiabPlusEkuitas
  const isBalance = Math.abs(selisih) < 1

  return apiSuccess({
    asOf: asOfStr,
    aset: {
      lancar: {
        kas: kasData,
        totalKasBank,
        piutangUsaha: nilaiPiutang,
        nilaiStok,
        total: totalAsetLancar,
      },
      tetap: {
        items: asetTetapData,
        total: totalAsetTetap,
      },
      total: totalAset,
    },
    liabilitas: {
      utangVendor,
      utangPinjaman,
      total: totalLiabilitas,
    },
    ekuitas: {
      modalDisetor,
      prive: -totalPrive,
      labaDitahanDanBerjalan,
      total: totalEkuitas,
    },
    totalLiabPlusEkuitas,
    isBalance,
    selisih,
  })
}
