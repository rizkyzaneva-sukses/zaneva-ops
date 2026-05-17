import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

/**
 * POST /api/payouts/backfill-dates
 *
 * Untuk setiap payout yang punya releasedDate, update orders.trx_date
 * pada order yang ber-orderNo sama dan trx_date-nya berbeda dari releasedDate.
 *
 * Hanya bisa dijalankan oleh OWNER.
 * Kirim { dryRun: true } untuk preview tanpa commit perubahan.
 */
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (session.userRole !== 'OWNER') return apiError('Forbidden — hanya OWNER', 403)

  const body = await request.json().catch(() => ({}))
  const dryRun: boolean = body?.dryRun === true

  // Ambil semua payout yang punya releasedDate + terhubung ke order
  const payouts = await prisma.payout.findMany({
    where: { releasedDate: { not: undefined } },
    select: { orderNo: true, releasedDate: true },
  })

  if (payouts.length === 0) {
    return apiSuccess({ updated: 0, skipped: 0, dryRun, message: 'Tidak ada payout ditemukan' })
  }

  // Ambil semua order yang orderNo-nya ada di daftar payout
  const orderNos = payouts.map(p => p.orderNo)
  const orders = await prisma.order.findMany({
    where: { orderNo: { in: orderNos } },
    select: { id: true, orderNo: true, trxDate: true },
  })

  // Build map orderNo → { id, trxDate }[]   (satu orderNo bisa multi-baris via multi-SKU)
  const orderMap = new Map<string, { id: string; trxDate: Date | null }[]>()
  for (const o of orders) {
    const arr = orderMap.get(o.orderNo) ?? []
    arr.push({ id: o.id, trxDate: o.trxDate })
    orderMap.set(o.orderNo, arr)
  }

  // Build payout map orderNo → releasedDate (payout adalah unique per orderNo)
  const payoutMap = new Map<string, Date>()
  for (const p of payouts) {
    payoutMap.set(p.orderNo, p.releasedDate)
  }

  // Kumpulkan order yang perlu di-update (trx_date berbeda / null)
  const toUpdate: { orderNo: string; releasedDate: Date; orderCount: number }[] = []
  let skipped = 0

  for (const [orderNo, orderRows] of orderMap) {
    const releasedDate = payoutMap.get(orderNo)
    if (!releasedDate) { skipped += orderRows.length; continue }

    const needsUpdate = orderRows.some(o => {
      if (!o.trxDate) return true
      // Bandingkan per-hari (ignore time zone shift)
      return o.trxDate.toDateString() !== releasedDate.toDateString()
    })

    if (needsUpdate) {
      toUpdate.push({ orderNo, releasedDate, orderCount: orderRows.length })
    } else {
      skipped += orderRows.length
    }
  }

  if (dryRun) {
    return apiSuccess({
      dryRun: true,
      willUpdate: toUpdate.length,
      willUpdateOrders: toUpdate.reduce((s, r) => s + r.orderCount, 0),
      skipped,
      sample: toUpdate.slice(0, 10).map(r => ({
        orderNo: r.orderNo,
        newTrxDate: r.releasedDate,
        affectedRows: r.orderCount,
      })),
    })
  }

  // Eksekusi update dalam batch
  let updated = 0
  const CHUNK = 50
  for (let i = 0; i < toUpdate.length; i += CHUNK) {
    const chunk = toUpdate.slice(i, i + CHUNK)
    await Promise.all(
      chunk.map(({ orderNo, releasedDate }) =>
        prisma.order.updateMany({
          where: { orderNo },
          data: { trxDate: releasedDate },
        })
      )
    )
    updated += chunk.reduce((s, r) => s + r.orderCount, 0)
  }

  return apiSuccess({
    dryRun: false,
    updated,
    skipped,
    message: `${updated} baris order berhasil diupdate trx_date-nya dari data payout`,
  })
}
