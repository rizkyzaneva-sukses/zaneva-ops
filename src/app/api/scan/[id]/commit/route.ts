import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

// Waktu Jakarta (WIB)
function nowJakarta(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))
}


// POST /api/scan/[id]/commit
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE', 'STAFF'].includes(session.userRole)) return apiError('Forbidden', 403)

  const batch = await prisma.inventoryScanBatch.findUnique({ where: { id: (await params).id } })
  if (!batch) return apiError('Batch tidak ditemukan', 404)
  if (batch.status !== 'DRAFT') return apiError('Batch sudah diproses')

  const itemsJson = batch.itemsJson as any
  if (!itemsJson || (Array.isArray(itemsJson) ? itemsJson.length === 0 : Object.keys(itemsJson).length === 0)) {
    return apiError('Batch kosong')
  }

  // Parse skus based on if it's Array or Object
  const isArray = Array.isArray(itemsJson)
  const skus = Array.from(new Set(isArray ? itemsJson.map((x: any) => x.sku) : Object.keys(itemsJson)))

  // Validate all SKUs exist
  const products = await prisma.masterProduct.findMany({ where: { sku: { in: skus } } })
  const foundSkus = new Set(products.map(p => p.sku))
  const missing = skus.filter(s => !foundSkus.has(s))
  if (missing.length > 0) return apiError(`SKU tidak ditemukan: ${missing.join(', ')}`)

  // Prepare ledger data
  const ledgerData: any[] = []
  if (isArray) {
    for (const item of itemsJson) {
      ledgerData.push({
        sku: item.sku,
        trxDate: item.trxDate ? new Date(`${item.trxDate}T12:00:00Z`) : batch.batchDate,
        direction: batch.direction,
        reason: (batch.reason as any) || 'ADJUSTMENT',
        qty: parseInt(item.qty, 10),
        batchId: batch.id,
        note: [item.supplierName && `Supplier: ${item.supplierName}`, item.note && `Catatan: ${item.note}`].filter(Boolean).join(' - ') || null,
        createdBy: session.username,
      })
    }
  } else {
    for (const sku of skus) {
      ledgerData.push({
        sku,
        trxDate: batch.batchDate,
        direction: batch.direction,
        reason: (batch.reason as any) || 'ADJUSTMENT',
        qty: parseInt(itemsJson[sku] as string, 10),
        batchId: batch.id,
        createdBy: session.username,
      })
    }
  }

  // Create ledger entries + commit batch in transaction
  await prisma.$transaction(async (tx) => {
    // Create ledger entries
    await tx.inventoryLedger.createMany({
      data: ledgerData,
    })

    // Mark batch as committed
    await tx.inventoryScanBatch.update({
      where: { id: batch.id },
      data: { status: 'COMMITTED' },
    })

    // Audit log
    await tx.auditLog.create({
      data: {
        entityType: 'InventoryScanBatch',
        action: 'COMMIT',
        entityId: batch.id,
        afterJson: { items: itemsJson, direction: batch.direction, reason: batch.reason },
        performedBy: session.username,
      },
    })
  })

  return apiSuccess({ message: 'Batch berhasil dicommit', batchId: batch.id })
}
