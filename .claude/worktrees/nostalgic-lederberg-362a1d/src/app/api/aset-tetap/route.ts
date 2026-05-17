import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

// GET /api/aset-tetap
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const asets = await prisma.asetTetap.findMany({
    orderBy: { tanggalBeli: 'desc' },
    include: { wallet: { select: { name: true } } },
  })

  const now = new Date()
  const result = asets.map((a) => {
    const penyusutanPerBulan = Math.round(a.nilaiPerolehan / (a.umurEkonomisThn * 12))
    const msPerMonth = 1000 * 60 * 60 * 24 * 30.4375
    const bulanBerjalan = Math.max(0, Math.floor((now.getTime() - a.tanggalBeli.getTime()) / msPerMonth))
    const akumulasiPenyusutan = Math.min(penyusutanPerBulan * bulanBerjalan, a.nilaiPerolehan)
    const nilaiBuku = Math.max(0, a.nilaiPerolehan - akumulasiPenyusutan)

    return {
      ...a,
      penyusutanPerBulan,
      bulanBerjalan,
      akumulasiPenyusutan,
      nilaiBuku,
    }
  })

  return apiSuccess({ asets: result })
}

// POST /api/aset-tetap
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER'].includes(session.userRole)) return apiError('Hanya Owner yang dapat menambah aset', 403)

  const body = await request.json()
  const { namaAset, nilaiPerolehan, tanggalBeli, umurEkonomisThn, walletId, note } = body

  if (!namaAset || !nilaiPerolehan || !tanggalBeli || !umurEkonomisThn) {
    return apiError('Data aset tidak lengkap')
  }

  const aset = await prisma.asetTetap.create({
    data: {
      namaAset,
      nilaiPerolehan: parseInt(nilaiPerolehan),
      tanggalBeli: new Date(tanggalBeli),
      umurEkonomisThn: parseInt(umurEkonomisThn),
      walletId: walletId || null,
      note: note || null,
      createdBy: session.username,
    },
  })

  // Otomatis buat WalletLedger INVESTASI jika wallet diisi
  if (walletId) {
    const wallet = await prisma.wallet.findUnique({ where: { id: walletId } })
    if (wallet) {
      await prisma.walletLedger.create({
        data: {
          walletId,
          trxDate: new Date(tanggalBeli),
          trxType: 'INVESTASI',
          category: `Pembelian Aset - ${namaAset}`,
          amount: -Math.abs(parseInt(nilaiPerolehan)),
          note: note || `Pembelian aset tetap: ${namaAset}`,
          createdBy: session.username,
        },
      })
    }
  }

  return apiSuccess(aset, 201)
}

// PUT /api/aset-tetap (edit/nonaktifkan)
export async function PUT(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER'].includes(session.userRole)) return apiError('Forbidden', 403)

  const body = await request.json()
  const { id, isActive } = body

  if (!id) return apiError('ID wajib diisi')

  const aset = await prisma.asetTetap.update({
    where: { id },
    data: { ...(isActive !== undefined && { isActive }) },
  })

  return apiSuccess(aset)
}
