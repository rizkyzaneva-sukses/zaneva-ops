import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

// POST /api/scan/retur
// Body: {
//   orderNo: string,
//   airwaybill: string,
//   items: [{ sku: string, qtyRetur: number, kondisi: 'Baik'|'Rusak'|'Tidak Sesuai' }]
// }
//
// Dalam 1 transaksi:
// 1. Tambah stok via InventoryLedger (direction=IN, reason=RETURN_SALES)
// 2. Update status order → 'RETUR'
// 3. Buat OrderScanLog (dengan note kondisi)
// 4. Buat AuditLog

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE', 'STAFF'].includes(session.userRole)) return apiError('Forbidden', 403)

  const body = await request.json()
  const { orderNo, airwaybill, items } = body as {
    orderNo: string
    airwaybill: string
    items: { sku: string; qtyRetur: number; kondisi: 'Baik' | 'Rusak' | 'Tidak Sesuai'; note?: string }[]
  }

  if (!orderNo) return apiError('orderNo tidak boleh kosong')
  if (!Array.isArray(items) || items.length === 0) return apiError('Items tidak boleh kosong')

  // Resolve SKU: Order.sku bisa berisi nama marketplace (mis. "Airflow Navy - XXL"),
  // bukan internal SKU (mis. ELY01). Coba match by sku dulu, fallback ke productName.
  const rawSkus = [...new Set(items.map(i => i.sku))]
  const allProducts = await prisma.masterProduct.findMany({
    where: {
      OR: [
        { sku: { in: rawSkus } },
        { productName: { in: rawSkus, mode: 'insensitive' } },
      ],
    },
    select: { sku: true, productName: true },
  })
  // Build map: input sku (atau productName) → internal sku
  const skuResolutionMap = new Map<string, string>()
  for (const p of allProducts) {
    skuResolutionMap.set(p.sku.toLowerCase(), p.sku)
    skuResolutionMap.set(p.productName.toLowerCase(), p.sku)
  }
  const missing = rawSkus.filter(s => !skuResolutionMap.has(s.toLowerCase()))
  if (missing.length > 0) return apiError(`SKU tidak ditemukan: ${missing.join(', ')}`)

  // Resolve setiap item ke internal SKU
  const resolvedItems = items.map(i => ({
    ...i,
    sku: skuResolutionMap.get(i.sku.toLowerCase()) ?? i.sku,
  }))

  // Cari order yang akan dir-retur
  const order = await prisma.order.findFirst({
    where: { orderNo },
  })
  if (!order) return apiError(`Order "${orderNo}" tidak ditemukan`, 404)

  const now = new Date()

  await prisma.$transaction(async (tx) => {
    // 1. Buat entri InventoryLedger untuk setiap item
    for (const item of resolvedItems) {
      const note = `Retur ${orderNo} - Kondisi: ${item.kondisi}${item.note ? ` - Catatan: ${item.note}` : ''}`
      await tx.inventoryLedger.create({
        data: {
          sku: item.sku,
          trxDate: now,
          direction: 'IN',
          reason: 'RETURN_SALES',
          qty: item.qtyRetur,
          note,
          createdBy: session.username,
        },
      })
    }

    // 2. Update status semua order dengan orderNo ini → RETUR
    await tx.order.updateMany({
      where: { orderNo },
      data: { status: 'RETUR' },
    })

    // 3. Buat OrderScanLog dengan detail kondisi
    const kondisiSummary = resolvedItems.map(i => `${i.sku}: ${i.kondisi}${i.note ? ` (${i.note})` : ''}`).join(', ')
    await tx.orderScanLog.create({
      data: {
        orderId: order.id,
        orderNo,
        scannedAt: now,
        scannedBy: session.username,
        note: `Retur dikonfirmasi. Konfirmasi: ${kondisiSummary}`,
      },
    })

    // 4. Buat AuditLog
    const totalQty = resolvedItems.reduce((s, i) => s + i.qtyRetur, 0)
    await tx.auditLog.create({
      data: {
        entityType: 'Order',
        action: 'COMMIT',           // Reuse COMMIT — tidak perlu migrasi enum
        entityId: order.id,
        refOrderNo: orderNo,
        afterJson: {
          event: 'RETUR',
          status: 'RETUR',
          airwaybill: airwaybill || order.airwaybill,
          items: resolvedItems.map(i => ({
            sku: i.sku,
            qtyRetur: i.qtyRetur,
            kondisi: i.kondisi,
            note: i.note,
          })),
          totalQtyRetur: totalQty,
        },
        note: `Retur ${orderNo} oleh ${session.username}`,
        performedBy: session.username,
      },
    })
  })

  // Summary untuk toast
  const skuSummary = resolvedItems.map(i => `${i.sku} +${i.qtyRetur}`).join(', ')
  return apiSuccess({
    message: `Retur berhasil — stok ${skuSummary}. Status order: RETUR`,
    orderNo,
    items,
  })
}
