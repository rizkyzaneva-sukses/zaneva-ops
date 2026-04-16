import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const { searchParams } = request.nextUrl
  const type = searchParams.get('type') || 'utang' // utang | piutang

  if (type === 'utang') {
    const utangs = await prisma.utang.findMany({
      orderBy: { createdAt: 'desc' },
      include: { payments: true },
    })
    const totalOutstanding = utangs
      .filter(u => u.status !== 'PAID')
      .reduce((s, u) => s + (u.amount - u.amountPaid), 0)
    return apiSuccess({ utangs, totalOutstanding })
  } else {
    const piutangs = await prisma.piutang.findMany({
      orderBy: { createdAt: 'desc' },
      include: { collections: true },
    })
    const totalOutstanding = piutangs
      .filter(p => p.status !== 'COLLECTED')
      .reduce((s, p) => s + (p.amount - p.amountCollected), 0)
    return apiSuccess({ piutangs, totalOutstanding })
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const body = await request.json()
  const { entityType, ...data } = body // entityType: 'utang' | 'piutang'

  if (entityType === 'utang') {
    const wallet = await prisma.wallet.findUnique({ where: { id: data.sourceWalletId } })
    if (!wallet) return apiError('Wallet tidak ditemukan')

    const utang = await prisma.$transaction(async (tx) => {
      const u = await tx.utang.create({
        data: {
          type: data.type,
          creditorName: data.creditorName,
          sourceWalletId: data.sourceWalletId,
          sourceWalletName: wallet.name,
          amount: Number(data.amount),
          trxDate: new Date(data.trxDate),
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          note: data.note || null,
          createdBy: session.username,
        },
      })
      // Credit wallet (terima uang)
      await tx.walletLedger.create({
        data: {
          walletId: data.sourceWalletId,
          trxDate: new Date(data.trxDate),
          trxType: 'OTHER_INCOME',
          category: `Utang - ${data.creditorName}`,
          amount: Number(data.amount),
          note: data.note || null,
          createdBy: session.username,
        },
      })
      return u
    })
    return apiSuccess(utang, 201)
  }

  if (entityType === 'piutang') {
    const wallet = await prisma.wallet.findUnique({ where: { id: data.sourceWalletId } })
    if (!wallet) return apiError('Wallet tidak ditemukan')

    const piutang = await prisma.$transaction(async (tx) => {
      const p = await tx.piutang.create({
        data: {
          type: data.type,
          debtorName: data.debtorName,
          sourceWalletId: data.sourceWalletId,
          sourceWalletName: wallet.name,
          amount: Number(data.amount),
          trxDate: new Date(data.trxDate),
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          note: data.note || null,
          createdBy: session.username,
        },
      })
      // Debit wallet (keluar uang)
      await tx.walletLedger.create({
        data: {
          walletId: data.sourceWalletId,
          trxDate: new Date(data.trxDate),
          trxType: 'EXPENSE',
          category: `Piutang - ${data.debtorName}`,
          amount: -Number(data.amount),
          note: data.note || null,
          createdBy: session.username,
        },
      })
      return p
    })
    return apiSuccess(piutang, 201)
  }

  return apiError('entityType harus utang atau piutang')
}

// PATCH /api/utang-piutang — edit nama dan tipe (OWNER only)
export async function PATCH(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER'].includes(session.userRole)) return apiError('Hanya Owner yang dapat mengedit', 403)

  const { id, entityType, name, type } = await request.json()
  if (!id || !entityType) return apiError('id dan entityType wajib diisi')

  if (entityType === 'utang') {
    const updated = await prisma.utang.update({
      where: { id },
      data: {
        ...(name  && { creditorName: name }),
        ...(type  && { type }),
      },
    })
    return apiSuccess(updated)
  } else {
    const updated = await prisma.piutang.update({
      where: { id },
      data: {
        ...(name  && { debtorName: name }),
        ...(type  && { type }),
      },
    })
    return apiSuccess(updated)
  }
}

// DELETE /api/utang-piutang — hapus record (OWNER only, hanya jika belum ada pembayaran)
export async function DELETE(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER'].includes(session.userRole)) return apiError('Hanya Owner yang dapat menghapus', 403)

  const { id, entityType } = await request.json()
  if (!id || !entityType) return apiError('id dan entityType wajib diisi')

  if (entityType === 'utang') {
    const utang = await prisma.utang.findUnique({ where: { id }, include: { payments: true } })
    if (!utang) return apiError('Data tidak ditemukan', 404)
    if (utang.payments.length > 0) return apiError('Tidak bisa hapus — sudah ada riwayat pembayaran. Gunakan fitur bayar untuk melunasi.')
    await prisma.utang.delete({ where: { id } })
  } else {
    const piutang = await prisma.piutang.findUnique({ where: { id }, include: { collections: true } })
    if (!piutang) return apiError('Data tidak ditemukan', 404)
    if (piutang.collections.length > 0) return apiError('Tidak bisa hapus — sudah ada riwayat penagihan. Gunakan fitur tagih untuk melunasinya.')
    await prisma.piutang.delete({ where: { id } })
  }

  return apiSuccess({ message: 'Berhasil dihapus' })
}
