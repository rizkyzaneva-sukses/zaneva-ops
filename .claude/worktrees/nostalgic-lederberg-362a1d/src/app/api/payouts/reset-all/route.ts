import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

/**
 * DELETE /api/payouts/reset-all
 * Hapus SEMUA data payout + wallet ledger bertipe PAYOUT.
 * HANYA OWNER. Kirim { confirm: "YES_DELETE_ALL" } untuk konfirmasi.
 */
export async function DELETE(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (session.userRole !== 'OWNER') return apiError('Forbidden — hanya OWNER', 403)

  const body = await request.json().catch(() => ({}))
  if (body?.confirm !== 'YES_DELETE_ALL') {
    return apiError('Konfirmasi tidak valid. Kirim { confirm: "YES_DELETE_ALL" }', 400)
  }

  // Legacy EXPENSE entries dari retur (format lama sebelum fix)
  const legacyReturOR = [
    { note: { startsWith: 'Retur TikTok' } },
    { note: { startsWith: 'Retur Shopee' } },
    { note: { startsWith: 'Payout TikTok' } },
    { note: { startsWith: 'Payout Shopee' } },
  ]

  // Hitung dulu berapa yang akan dihapus
  const [payoutCount, ledgerPayoutCount, ledgerLegacyCount] = await Promise.all([
    prisma.payout.count(),
    prisma.walletLedger.count({ where: { trxType: 'PAYOUT' } }),
    prisma.walletLedger.count({ where: { trxType: 'EXPENSE', OR: legacyReturOR } }),
  ])
  const ledgerCount = ledgerPayoutCount + ledgerLegacyCount

  // Hapus dalam transaksi
  await prisma.$transaction([
    prisma.walletLedger.deleteMany({ where: { trxType: 'PAYOUT' } }),
    prisma.walletLedger.deleteMany({ where: { trxType: 'EXPENSE', OR: legacyReturOR } }),
    prisma.payout.deleteMany({}),
    // Reset trxDate orders ke null agar bersih sebelum re-import
    prisma.order.updateMany({ where: { trxDate: { not: null } }, data: { trxDate: null } }),
  ])

  return apiSuccess({
    message: `Reset selesai: ${payoutCount} payout dan ${ledgerCount} wallet ledger dihapus. trxDate orders di-reset.`,
    deleted: { payouts: payoutCount, ledgerEntries: ledgerCount },
  })
}
