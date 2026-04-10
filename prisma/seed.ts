import { PrismaClient, UserRole, LedgerDirection, LedgerReason, POStatus, POPaymentStatus, POItemStatus, ScanBatchStatus, ScanBatchReason, OpnameBatchStatus, WalletTrxType, VendorPaymentType, VendorPaymentStatus, UtangType, UtangStatus, PiutangType, PiutangStatus, MasterCategoryType } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database with demo data...')

  // ── 1. Default OWNER user ──────────────────────────────
  const passwordHash = await bcrypt.hash('admin123', 12)
  const owner = await prisma.appUser.upsert({
    where: { username: 'admin' },
    update: {},
    create: { username: 'admin', passwordHash, userRole: UserRole.OWNER, fullName: 'Administrator', isActive: true },
  })

  // ── 2. Default Wallets ─────────────────────────────────
  const wallets = [
    { name: 'Kas Utama' }, { name: 'BCA Bisnis' }, { name: 'BRI Bisnis' },
    { name: 'TikTok Shop Wallet' }, { name: 'Shopee Wallet' }
  ]
  const createdWallets: any[] = []
  for (const w of wallets) {
    const ww = await prisma.wallet.upsert({ where: { name: w.name }, update: {}, create: w })
    createdWallets.push(ww)
  }
  const kasUtama = createdWallets.find(x => x.name === 'Kas Utama')

  // ── 3. Default Categories ──────────────────────────────
  const categories = [
    { categoryType: MasterCategoryType.OTHER_INCOME, name: 'Penjualan Marketplace' },
    { categoryType: MasterCategoryType.OTHER_INCOME, name: 'Refund Platform' },
    { categoryType: MasterCategoryType.EXPENSE_BEBAN, name: 'Pembelian Stok' },
    { categoryType: MasterCategoryType.EXPENSE_BEBAN, name: 'Biaya Operasional' },
    { categoryType: MasterCategoryType.EXPENSE_BEBAN, name: 'Gaji Karyawan' },
    { categoryType: MasterCategoryType.EXPENSE_NON_BEBAN, name: 'Investasi' },
    { categoryType: MasterCategoryType.EXPENSE_NON_BEBAN, name: 'Prive' },
  ]
  for (const c of categories) {
    await prisma.masterCategory.create({ data: c }).catch(() => {})
  }

  // ── 4. Product Categories ─────────────────────
  const productCats = [
    { categoryName: 'Atasan' }, { categoryName: 'Bawahan' }, { categoryName: 'Outwear' },
  ]
  const createdCats: any[] = []
  for (const pc of productCats) {
    const c = await prisma.productCategory.upsert({
      where: { id: pc.categoryName }, update: {}, create: pc
    }).catch(async () => {
      // If error, try find first
      return await prisma.productCategory.findFirst({where: { categoryName: pc.categoryName }})
    })
    if(c) createdCats.push(c)
  }
  const catAtasan = createdCats.find(c => c?.categoryName === 'Atasan')?.id

  // ── 5. Master Product (Inventori) ─────────────────────
  const productA = await prisma.masterProduct.upsert({
    where: { sku: 'KEM-01-M' },
    update: {},
    create: {
      sku: 'KEM-01-M', productName: 'Kemeja Pria Polos - Hitam M',
      categoryId: catAtasan, categoryName: 'Atasan', unit: 'pcs',
      hpp: 45000, rop: 50, leadTimeDays: 7, stokAwal: 100, isActive: true
    }
  })
  
  const productB = await prisma.masterProduct.upsert({
    where: { sku: 'KEM-01-L' },
    update: {},
    create: {
      sku: 'KEM-01-L', productName: 'Kemeja Pria Polos - Hitam L',
      categoryId: catAtasan, categoryName: 'Atasan', unit: 'pcs',
      hpp: 45000, rop: 50, leadTimeDays: 7, stokAwal: 80, isActive: true
    }
  })

  // ── 6. Inventory Ledger & Scan Masuk (Inventori) ─────────────────────
  // Create a Scan Batch 
  const scanBatch = await prisma.inventoryScanBatch.create({
    data: {
      batchDate: new Date(),
      direction: LedgerDirection.IN,
      reason: ScanBatchReason.RETURN_SALES,
      status: ScanBatchStatus.COMMITTED,
      scannedBy: 'admin',
      itemsJson: JSON.stringify([{ sku: 'KEM-01-M', qty: 2 }])
    }
  })

  await prisma.inventoryLedger.create({
    data: {
      sku: 'KEM-01-M',
      trxDate: new Date(),
      direction: LedgerDirection.IN,
      reason: LedgerReason.RETURN_SALES,
      qty: 2,
      batchId: scanBatch.id,
      note: 'Retur customer',
      createdBy: 'admin'
    }
  })

  // ── 7. Stock Opname (Inventori) ─────────────────────
  // systemQty = 102 (100 stokAwal + 2 in), actualQty = 100, diffQty = -2
  const opname = await prisma.stockOpnameBatch.create({
    data: {
      opnameDate: new Date(),
      warehouseName: 'Gudang Pusat',
      status: OpnameBatchStatus.COMMITTED,
      totalSku: 1,
      totalAdjustmentQty: -2,
      committedAt: new Date(),
      committedBy: 'admin',
      note: 'Opname rutin bulanan'
    }
  })

  await prisma.stockOpnameItem.create({
    data: {
      opnameId: opname.id, sku: 'KEM-01-M',
      systemQty: 102, actualQty: 100, diffQty: -2, note: 'Barang reject/hilang'
    }
  })

  await prisma.inventoryLedger.create({
    data: {
      sku: 'KEM-01-M',
      trxDate: new Date(),
      direction: LedgerDirection.OUT,
      reason: LedgerReason.ADJUSTMENT,
      qty: 2,
      refOpnameId: opname.id,
      note: 'Penyesuaian Stock Opname',
      createdBy: 'admin'
    }
  })

  // ── 8. Vendor (Procurement) ─────────────────────
  const vendor = await prisma.vendor.upsert({
    where: { vendorCode: 'VND-001' },
    update: {},
    create: { vendorCode: 'VND-001', namaVendor: 'PT Tekstil Jaya Makmur', kontak: '081234567890', alamat: 'Bandung', rekening: '1234567890', bank: 'BCA', termPayment: 14 }
  })

  // ── 9. Purchase Orders (Procurement) ─────────────────────
  const qtyOrder = 100
  const unitPrice = 45000
  const totalAmount = qtyOrder * unitPrice // 4,500,000
  const paymentAmount = 2000000 // DP

  const po = await prisma.purchaseOrder.create({
    data: {
      poNumber: 'PO-20260410-001',
      vendorId: vendor.id, vendorName: vendor.namaVendor,
      poDate: new Date(), expectedDate: new Date(Date.now() + 7 * 86400000),
      status: POStatus.OPEN, paymentStatus: POPaymentStatus.PARTIAL_PAID,
      totalItems: 1, totalQtyOrder: qtyOrder, totalQtyReceived: 0,
      totalAmount: totalAmount, totalPaid: paymentAmount,
      note: 'PO Rutin'
    }
  })

  await prisma.purchaseOrderItem.create({
    data: {
      poId: po.id, poNumber: po.poNumber, vendorId: vendor.id, vendorName: vendor.namaVendor,
      sku: 'KEM-01-M', productName: 'Kemeja Pria Polos - Hitam M',
      qtyOrder: qtyOrder, unitPrice: unitPrice, status: POItemStatus.OPEN
    }
  })

  // ── 10. Vendor Payment (Procurement & Keuangan) ─────────────────────
  const vp = await prisma.vendorPayment.create({
    data: {
      paymentNumber: 'PAY-PO-001', paymentDate: new Date(),
      vendorId: vendor.id, vendorName: vendor.namaVendor,
      poId: po.id, poNumber: po.poNumber,
      walletId: kasUtama.id, walletName: kasUtama.name,
      amount: paymentAmount, paymentType: VendorPaymentType.DP,
      status: VendorPaymentStatus.COMPLETED, note: 'DP Pembelian'
    }
  })

  await prisma.walletLedger.create({
    data: {
      walletId: kasUtama.id, trxDate: new Date(),
      trxType: WalletTrxType.EXPENSE, category: 'Pembelian Stok',
      amount: -paymentAmount, note: `Payment for ${po.poNumber}`, createdBy: 'admin'
    }
  })

  // ── 11. Utang (Keuangan) ─────────────────────
  const utang = await prisma.utang.create({
    data: {
      type: UtangType.PINJAMAN_BANK, creditorName: 'Bank BCA',
      sourceWalletId: kasUtama.id, sourceWalletName: kasUtama.name,
      amount: 50000000, amountPaid: 5000000,
      trxDate: new Date(), dueDate: new Date(Date.now() + 30 * 86400000),
      status: UtangStatus.PARTIAL, note: 'Modal Usaha'
    }
  })

  await prisma.walletLedger.create({
    data: {
      walletId: kasUtama.id, trxDate: new Date(),
      trxType: WalletTrxType.OTHER_INCOME, category: 'Suntikan Modal',
      amount: 50000000, note: `Penerimaan Pinjaman ${utang.creditorName}`, createdBy: 'admin'
    }
  })

  const utangPayment = await prisma.utangPayment.create({
    data: {
      utangId: utang.id, paymentDate: new Date(), amount: 5000000,
      walletId: kasUtama.id, walletName: kasUtama.name, note: 'Cicilan 1'
    }
  })

  await prisma.walletLedger.create({
    data: {
      walletId: kasUtama.id, trxDate: new Date(),
      trxType: WalletTrxType.EXPENSE, category: 'Pembayaran Utang',
      amount: -5000000, note: `Cicilan utang ${utang.creditorName}`, createdBy: 'admin'
    }
  })

  // ── 12. Piutang (Keuangan) ─────────────────────
  const piutang = await prisma.piutang.create({
    data: {
      type: PiutangType.PINJAMAN_KARYAWAN, debtorName: 'Budi (Staff)',
      sourceWalletId: kasUtama.id, sourceWalletName: kasUtama.name,
      amount: 2000000, amountCollected: 0,
      trxDate: new Date(), dueDate: new Date(Date.now() + 15 * 86400000),
      status: PiutangStatus.OUTSTANDING, note: 'Kasbon Bulanan'
    }
  })

  await prisma.walletLedger.create({
    data: {
      walletId: kasUtama.id, trxDate: new Date(),
      trxType: WalletTrxType.EXPENSE, category: 'Piutang',
      amount: -2000000, note: `Kasbon ${piutang.debtorName}`, createdBy: 'admin'
    }
  })

  // ── 13. Orders & Payout (Keuangan) ─────────────────────
  const order = await prisma.order.create({
    data: {
      orderNo: 'ORD-123456789', status: 'COMPLETED', platform: 'TikTok',
      airwaybill: 'JX123456789', orderCreatedAt: new Date().toISOString(),
      sku: 'KEM-01-M', productName: 'Kemeja Pria Polos - Hitam M', qty: 2,
      totalProductPrice: 150000, realOmzet: 135000, hpp: 90000,
      buyerUsername: 'johndoe', city: 'Jakarta Selatan'
    }
  })

  const payoutAmt = 135000
  const payout = await prisma.payout.create({
    data: {
      orderNo: order.orderNo,
      orderId: order.id,
      releasedDate: new Date(),
      omzet: 150000,
      platformFee: 10000,
      amsFee: 5000,
      totalIncome: payoutAmt,
      walletId: createdWallets.find(w => w.name === 'TikTok Shop Wallet').id
    }
  })

  await prisma.walletLedger.create({
    data: {
      walletId: payout.walletId, trxDate: payout.releasedDate,
      trxType: WalletTrxType.PAYOUT, category: 'Penjualan Marketplace',
      amount: payoutAmt, note: `Payout Order ${order.orderNo}`, createdBy: 'admin', refOrderNo: order.orderNo
    }
  })

  console.log('✅ Semua data demo (Inventori, Procurement, Keuangan) berhasil di-seed dengan rumus yang sesuai!')
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
