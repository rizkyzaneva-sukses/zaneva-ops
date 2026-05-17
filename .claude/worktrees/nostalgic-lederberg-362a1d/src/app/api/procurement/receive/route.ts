import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

// POST /api/procurement/receive — goods receipt
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const body = await request.json()
  const { poId, receiptDate, items, note } = body
  // items: [{ sku, qtyReceived }]

  if (!poId || !items?.length) return apiError('PO dan items wajib diisi')

  const po = await prisma.purchaseOrder.findUnique({
    where: { id: poId },
    include: { items: true },
  })
  if (!po) return apiError('PO tidak ditemukan')
  if (po.status === 'CANCELLED') return apiError('PO sudah dibatalkan')

  await prisma.$transaction(async (tx) => {
    const date = new Date(receiptDate || new Date())

    // Create goods receipt record
    const receipt = await tx.goodsReceipt.create({
      data: {
        poId,
        poNumber: po.poNumber,
        vendorId: po.vendorId,
        vendorName: po.vendorName,
        receiptDate: date,
        itemsJson: items.reduce((obj: any, i: any) => ({ ...obj, [i.sku]: i.qtyReceived }), {}),
        note: note || null,
        createdBy: session.username,
      },
    })

    // Update PO items qty_received
    let allCompleted = true
    let totalQtyReceived = po.totalQtyReceived

    for (const item of items) {
      const poItem = po.items.find(pi => pi.sku === item.sku)
      if (!poItem) continue

      const newQtyReceived = poItem.qtyReceived + item.qtyReceived
      const itemStatus = newQtyReceived >= poItem.qtyOrder ? 'COMPLETED' : 'PARTIAL'
      if (itemStatus !== 'COMPLETED') allCompleted = false

      await tx.purchaseOrderItem.update({
        where: { id: poItem.id },
        data: { qtyReceived: newQtyReceived, status: itemStatus },
      })

      totalQtyReceived += item.qtyReceived

      // Create inventory ledger entry
      await tx.inventoryLedger.create({
        data: {
          sku: item.sku,
          trxDate: date,
          direction: 'IN',
          reason: 'PURCHASE',
          qty: item.qtyReceived,
          note: `GR dari ${po.poNumber}`,
          createdBy: session.username,
        },
      })
    }

    // Determine PO status after receipt
    const updatedItems = await tx.purchaseOrderItem.findMany({ where: { poId } })
    const anyReceived = updatedItems.some(i => i.qtyReceived > 0)
    const poStatus = updatedItems.every(i => i.status === 'COMPLETED')
      ? 'COMPLETED'
      : anyReceived ? 'PARTIAL' : 'OPEN'

    await tx.purchaseOrder.update({
      where: { id: poId },
      data: { status: poStatus, totalQtyReceived },
    })

    await tx.auditLog.create({
      data: {
        entityType: 'GoodsReceipt',
        action: 'CREATE',
        entityId: receipt.id,
        afterJson: { poId, items },
        performedBy: session.username,
      },
    })
  })

  return apiSuccess({ message: 'Penerimaan barang berhasil dicatat' }, 201)
}
