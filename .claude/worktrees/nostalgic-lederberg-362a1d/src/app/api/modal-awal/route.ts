import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

// GET /api/modal-awal
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER'].includes(session.userRole)) return apiError('Forbidden', 403)

  const modals = await prisma.modalAwal.findMany({
    include: { wallet: { select: { id: true, name: true, isActive: true } } },
    orderBy: { createdAt: 'asc' },
  })

  // Juga ambil semua wallet aktif yg belum punya modal awal
  const wallets = await prisma.wallet.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } })
  const existingWalletIds = new Set(modals.map((m) => m.walletId))
  const walletsWithoutModal = wallets.filter((w) => !existingWalletIds.has(w.id))

  return apiSuccess({ modals, walletsWithoutModal })
}

// POST /api/modal-awal — simpan/update modal awal per wallet
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER'].includes(session.userRole)) return apiError('Hanya Owner yang dapat setup modal awal', 403)

  const body = await request.json()
  // body: [{ walletId, jumlah, tanggalSetup, note }]
  const items: { walletId: string; jumlah: number; tanggalSetup: string; note?: string }[] = Array.isArray(body)
    ? body
    : [body]

  const results = []

  for (const item of items) {
    const { walletId, jumlah, tanggalSetup, note } = item
    if (!walletId || jumlah === undefined || !tanggalSetup) continue

    const wallet = await prisma.wallet.findUnique({ where: { id: walletId } })
    if (!wallet) continue

    // Upsert modal awal
    const modal = await prisma.modalAwal.upsert({
      where: { walletId },
      update: { jumlah, tanggalSetup: new Date(tanggalSetup), note: note || null },
      create: { walletId, jumlah, tanggalSetup: new Date(tanggalSetup), note: note || null },
    })

    // Buat WalletLedger MODAL_MASUK jika belum ada
    const existing = await prisma.walletLedger.findFirst({
      where: { walletId, trxType: 'MODAL_MASUK', category: 'Modal Awal' },
    })

    if (!existing) {
      await prisma.walletLedger.create({
        data: {
          walletId,
          trxDate: new Date(tanggalSetup),
          trxType: 'MODAL_MASUK',
          category: 'Modal Awal',
          amount: Math.abs(jumlah),
          note: 'Setup modal awal sistem',
          createdBy: session.username,
        },
      })
    } else {
      // Update jika berubah
      await prisma.walletLedger.update({
        where: { id: existing.id },
        data: { amount: Math.abs(jumlah), trxDate: new Date(tanggalSetup), note: 'Setup modal awal sistem' },
      })
    }

    results.push(modal)
  }

  return apiSuccess({ message: 'Modal awal berhasil disimpan', results }, 201)
}
