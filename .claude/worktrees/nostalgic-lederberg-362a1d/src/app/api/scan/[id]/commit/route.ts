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

  // Validate all SKUs exist (include hpp for endorsement booking)
  const products = await prisma.masterProduct.findMany({ where: { sku: { in: skus } } })
  const foundSkus = new Set(products.map(p => p.sku))
  const missing = skus.filter(s => !foundSkus.has(s))
  if (missing.length > 0) return apiError(`SKU tidak ditemukan: ${missing.join(', ')}`)

  // Prepare inventory ledger data
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

  // ── Auto-booking Beban Sample untuk Endorsement ──────────────────────────
  // Jika reason = MARKETING, otomatis buat entri EXPENSE di wallet ledger
  // Nominal = HPP × qty per SKU. Default wallet = "Kas Operasional".
  const isEndorsement = batch.reason === 'MARKETING'
  let walletBookingWarning: string | null = null
  const walletLedgerData: any[] = []

  if (isEndorsement) {
    // Cari wallet "Kas Operasional" (case-insensitive, harus aktif)
    const kasOps = await prisma.wallet.findFirst({
      where: {
        isActive: true,
        name: { contains: 'Kas Operasional', mode: 'insensitive' },
      },
    })

    if (!kasOps) {
      walletBookingWarning =
        'Wallet "Kas Operasional" tidak ditemukan — Beban Sample TIDAK otomatis dibukukan ke Finance. Silakan input manual di modul Finance.'
    } else {
      // Map sku → hpp dari master_products
      const hppMap = new Map(products.map(p => [p.sku, p.hpp ?? 0]))

      for (const entry of ledgerData) {
        const hpp = hppMap.get(entry.sku) ?? 0
        const qty = entry.qty
        const totalBeban = hpp * qty

        if (totalBeban > 0) {
          walletLedgerData.push({
            walletId: kasOps.id,
            trxDate: entry.trxDate,
            trxType: 'EXPENSE' as const,
            category: 'Beban Sample',
            // Negatif = keluar dari wallet
            amount: -Math.abs(totalBeban),
            note: `Endorsement: ${entry.sku} × ${qty} unit (HPP Rp${hpp.toLocaleString('id-ID')}/unit) | Ref: ${batch.id.slice(-8)}`,
            createdBy: session.username,
          })
        }
      }

      if (walletLedgerData.length === 0) {
        walletBookingWarning =
          'Semua produk memiliki HPP = 0, Beban Sample tidak dibukukan. Pastikan HPP produk sudah diisi di Master Produk.'
      }
    }
  }

  // Create ledger entries + commit batch in transaction
  await prisma.$transaction(async (tx) => {
    // 1. Inventory ledger
    await tx.inventoryLedger.createMany({ data: ledgerData })

    // 2. Finance: Beban Sample (hanya jika endorsement & ada data)
    if (walletLedgerData.length > 0) {
      await tx.walletLedger.createMany({ data: walletLedgerData })
    }

    // 3. Commit batch
    await tx.inventoryScanBatch.update({
      where: { id: batch.id },
      data: { status: 'COMMITTED' },
    })

    // 4. Audit log
    await tx.auditLog.create({
      data: {
        entityType: 'InventoryScanBatch',
        action: 'COMMIT',
        entityId: batch.id,
        afterJson: {
          items: itemsJson,
          direction: batch.direction,
          reason: batch.reason,
          bebanSampleBooked: walletLedgerData.length,
        },
        performedBy: session.username,
      },
    })
  })

  const totalBebanSample = walletLedgerData.reduce((s, e) => s + Math.abs(e.amount), 0)

  return apiSuccess({
    message: 'Batch berhasil dicommit',
    batchId: batch.id,
    ...(isEndorsement && {
      bebanSample: {
        booked: walletLedgerData.length,
        totalAmount: totalBebanSample,
        warning: walletBookingWarning,
      },
    }),
  })
}
