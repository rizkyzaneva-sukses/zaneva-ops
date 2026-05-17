import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

// Waktu Jakarta (WIB)
function nowJakarta(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))
}


// POST /api/opname/[id]/commit
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const batch = await prisma.stockOpnameBatch.findUnique({
    where: { id: (await params).id },
    include: { items: true },
  })
  if (!batch) return apiError('Batch opname tidak ditemukan', 404)
  if (batch.status !== 'DRAFT') return apiError('Batch sudah diproses')

  const now = nowJakarta()

  await prisma.$transaction(async (tx) => {
    for (const item of batch.items) {
      // Update master product stok_awal = actual_qty, reset opname date
      await tx.masterProduct.update({
        where: { sku: item.sku },
        data: {
          stokAwal: item.actualQty,
          lastOpnameDate: now,
        },
      })

      // Create adjustment ledger entry if diff != 0
      if (item.diffQty !== 0) {
        await tx.inventoryLedger.create({
          data: {
            sku: item.sku,
            trxDate: batch.opnameDate,
            direction: item.diffQty > 0 ? 'IN' : 'OUT',
            reason: 'ADJUSTMENT',
            qty: Math.abs(item.diffQty),
            refOpnameId: batch.id,
            note: `Opname adjustment`,
            createdBy: session.username,
          },
        })
      }
    }

    // Mark batch as committed
    await tx.stockOpnameBatch.update({
      where: { id: batch.id },
      data: {
        status: 'COMMITTED',
        committedAt: now,
        committedBy: session.username,
      },
    })

    await tx.auditLog.create({
      data: {
        entityType: 'StockOpnameBatch',
        action: 'COMMIT',
        entityId: batch.id,
        afterJson: { totalSku: batch.items.length, committedAt: now },
        performedBy: session.username,
      },
    })
  })

  return apiSuccess({ message: 'Opname berhasil dicommit' })
}
