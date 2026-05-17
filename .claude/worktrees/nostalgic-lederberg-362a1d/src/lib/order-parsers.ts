/**
 * order-parsers.ts
 * Mengolah file mentah TikTok / Shopee langsung ke format DB
 * Tanpa perlu edit manual sebelum upload
 */

export interface ParsedOrder {
  orderNo: string
  status: string
  platform: string
  airwaybill: string | null
  orderCreatedAt: string | null
  sku: string | null
  productName: string | null
  qty: number
  totalProductPrice: number  // harga setelah diskon (sebelum fee platform)
  realOmzet: number          // omzet bersih sudah dipotong fee platform
  city: string | null
  province: string | null
  buyerUsername: string | null
  receiverName: string | null
  phone: string | null
  hpp: number  // di-lookup dari MasterProduct by SKU
}

export interface FailedRow {
  rowNumber: number  // nomor baris di file upload (1-based, tidak termasuk header)
  orderNo: string
  sku: string
  reason: string
}

export interface ParseResult {
  orders: ParsedOrder[]
  failed: FailedRow[]
}

// ── Helpers ────────────────────────────────────────────

/** Parse angka dari string Shopee (200.900 → 200900) */
function parseShopeeNum(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0
  const s = String(val).replace(/\./g, '').replace(',', '.')
  const n = parseFloat(s)
  return isNaN(n) ? 0 : Math.round(n)
}

/** Parse angka biasa TikTok */
function parseTikTokNum(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0
  const n = parseFloat(String(val).replace(/,/g, ''))
  return isNaN(n) ? 0 : Math.round(n)
}

/** Status batal Shopee */
const SHOPEE_CANCEL_STATUSES = [
  'dibatalkan', 'batal', 'cancelled', 'canceled',
  'pengembalian dana', 'dikembalikan',
]

function isShopeeCancel(status: string): boolean {
  return SHOPEE_CANCEL_STATUSES.some(s => status.toLowerCase().includes(s))
}

/** Status batal TikTok */
const TIKTOK_CANCEL_STATUSES = ['cancelled', 'canceled', 'dibatalkan', 'batal']

function isTikTokCancel(status: string): boolean {
  return TIKTOK_CANCEL_STATUSES.some(s => status.toLowerCase().includes(s))
}

/**
 * Cek apakah SKU dikecualikan dari perhitungan omzet (harga = 0).
 * Produk ini tidak menanggung voucher — bebannya dialihkan ke produk lain.
 * Contoh: Kaos/T-shirt bonus, Miki Hat / Peci Uas
 */
function isKaosSku(sku: string): boolean {
  const lower = sku.toLowerCase()
  return (
    lower.includes('kaos') ||
    lower.includes('t-shirt') ||
    lower.includes('tshirt') ||
    lower.includes('peci') ||
    lower.includes('miki hat')
  )
}

/**
 * Resolve combined SKU (mengandung "+") menggunakan mapping table.
 * Mengembalikan array individual SKU internal, atau null jika tidak ditemukan di mapping.
 *
 * Contoh:
 *   fromSku = "Chino Khaki PJ + Heritage Olive PD - XL"
 *   toSku   = "Hino Khaki Panjang - XL + Heritage Olive Pendek - XL"
 *   result  = ["Hino Khaki Panjang - XL", "Heritage Olive Pendek - XL"]
 */
function resolveCombinedSku(
  sku: string,
  skuMappingMap: Map<string, string>
): string[] | null {
  if (!sku.includes('+')) return [sku]  // SKU tunggal, tidak perlu mapping
  const mapped = skuMappingMap.get(sku.toLowerCase().trim())
  if (!mapped) return null  // Tidak ditemukan di mapping → GAGAL
  return mapped.split('+').map(s => s.trim()).filter(Boolean)
}

// ── SHOPEE PARSER ──────────────────────────────────────

/**
 * Parse raw Shopee rows (dari Excel/CSV yang sudah jadi array of object)
 *
 * Logika:
 * - Skip baris dengan status batal
 * - SKU mengandung "+": lookup di skuMappingMap, pecah jadi beberapa baris
 *   - Tidak ditemukan di mapping → seluruh order GAGAL
 * - Harga dibagi rata ke item non-Kaos; Kaos mendapat harga 0
 * - Voucher Ditanggung Penjual: dibagi merata per unit ke semua item akhir
 * - Real Omzet = (basePrice - fee%) × qty
 */
export function parseShopeeOrders(
  rawRows: Record<string, unknown>[],
  hppMap: Map<string, number>,
  skuMappingMap: Map<string, string>,  // fromSku.toLowerCase() → toSku
  shopeeAdminFee = 14
): ParseResult {
  // Group by No. Pesanan untuk handle multi-item invoice
  const groups = new Map<string, { row: Record<string, unknown>; rowNumber: number }[]>()
  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i]
    const orderNo = String(row['No. Pesanan'] || '').trim()
    if (!orderNo) continue
    const arr = groups.get(orderNo) ?? []
    arr.push({ row, rowNumber: i + 1 })
    groups.set(orderNo, arr)
  }

  const orders: ParsedOrder[] = []
  const failed: FailedRow[] = []

  for (const [orderNo, entries] of groups) {
    const firstEntry = entries[0]
    const firstRow = firstEntry.row
    const status = String(firstRow['Status Pesanan'] || '').trim()

    if (isShopeeCancel(status)) continue

    const voucherSeller = parseShopeeNum(firstRow['Voucher Ditanggung Penjual'])

    // ── Fase 1: Expand semua combined SKUs, cek mapping ────
    type ExpandedItem = {
      sourceRow: Record<string, unknown>
      rowNumber: number
      sku: string           // individual internal SKU
      hargaPerUnit: number  // harga per unit setelah split
      qty: number
    }

    const expandedItems: ExpandedItem[] = []
    let orderFailed = false
    let failedSku = ''
    let failedRowNumber = firstEntry.rowNumber

    for (const { row, rowNumber } of entries) {
      const rawSku = String(row['Nomor Referensi SKU'] || '').trim()
      const hargaAfterDisc = parseShopeeNum(row['Harga Setelah Diskon'])
      const qty = Math.max(1, parseInt(String(row['Jumlah'] || '1'), 10))

      if (rawSku.includes('+')) {
        const resolved = resolveCombinedSku(rawSku, skuMappingMap)
        if (!resolved) {
          orderFailed = true
          failedSku = rawSku
          failedRowNumber = rowNumber
          break
        }
        // Hitung berapa item non-Kaos untuk bagi harga
        const nonKaosCount = resolved.filter(s => !isKaosSku(s)).length || resolved.length
        resolved.forEach(sku => {
          const hargaPerUnit = isKaosSku(sku) ? 0 : Math.round(hargaAfterDisc / nonKaosCount)
          expandedItems.push({ sourceRow: row, rowNumber, sku, hargaPerUnit, qty })
        })
      } else {
        // Produk dikecualikan (kaos/hat/peci) → harga 0, tidak menanggung voucher
        const hargaPerUnit = isKaosSku(rawSku) ? 0 : parseShopeeNum(row['Harga Setelah Diskon'])
        expandedItems.push({ sourceRow: row, rowNumber, sku: rawSku, hargaPerUnit, qty })
      }
    }

    if (orderFailed) {
      failed.push({
        rowNumber: failedRowNumber,
        orderNo,
        sku: failedSku,
        reason: 'SKU gabungan tidak ditemukan di DATABASE PRODUK GABUNGAN',
      })
      continue
    }

    // ── Fase 2: Distribusi voucher — hanya ke item non-excluded ────
    const nonExcludedQty = expandedItems
      .filter(item => !isKaosSku(item.sku))
      .reduce((sum, item) => sum + item.qty, 0)
    const voucherPerUnit = nonExcludedQty > 0 ? voucherSeller / nonExcludedQty : 0

    for (const item of expandedItems) {
      const itemVoucher = isKaosSku(item.sku) ? 0 : voucherPerUnit
      const basePrice = item.hargaPerUnit - itemVoucher
      const fee = basePrice * (shopeeAdminFee / 100)
      const realOmzet = Math.round((basePrice - fee) * item.qty)
      const skuKey = item.sku.toLowerCase()

      orders.push({
        orderNo,
        status,
        platform: 'Shopee',
        airwaybill: String(item.sourceRow['No. Resi'] || '').trim() || null,
        orderCreatedAt: String(item.sourceRow['Waktu Dana Dilepaskan'] || item.sourceRow['Waktu Pesanan Dibuat'] || '').trim() || null,
        sku: item.sku || null,
        productName: item.sku || String(item.sourceRow['Nama Produk'] || '').trim() || null,
        qty: item.qty,
        totalProductPrice: Math.round(item.hargaPerUnit * item.qty),
        realOmzet,
        city: String(item.sourceRow['Kota/Kabupaten'] || '').trim() || null,
        province: String(item.sourceRow['Provinsi'] || '').trim() || null,
        buyerUsername: String(item.sourceRow['Username (Pembeli)'] || '').trim() || null,
        receiverName: String(item.sourceRow['Nama Penerima'] || '').trim() || null,
        phone: String(item.sourceRow['No. Telepon'] || '').trim() || null,
        hpp: hppMap.get(skuKey) ?? 0,
      })
    }
  }

  return { orders, failed }
}

// ── TIKTOK PARSER ─────────────────────────────────────

/**
 * Parse raw TikTok rows (dari CSV yang sudah jadi array of object)
 *
 * Logika:
 * - Skip status batal/cancelled
 * - SKU mengandung "+": lookup di skuMappingMap, pecah jadi beberapa baris
 *   - Tidak ditemukan di mapping → baris GAGAL
 * - Harga (SKU Subtotal After Discount) dibagi rata ke item non-Kaos; Kaos = 0
 * - Real Omzet = subtotalAfterDisc × (1 - adminFee%)
 */
export function parseTikTokOrders(
  rawRows: Record<string, unknown>[],
  hppMap: Map<string, number>,
  skuMappingMap: Map<string, string>,
  tiktokAdminFee = 14.1
): ParseResult {
  const orders: ParsedOrder[] = []
  const failed: FailedRow[] = []

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i]
    const rowNumber = i + 1
    const orderNo = String(row['Order ID'] || '').trim()
    if (!orderNo) continue

    const status = String(row['Order Status'] || '').trim()
    if (isTikTokCancel(status)) continue

    const subtotalAfterDisc = parseTikTokNum(row['SKU Subtotal After Discount'])
    const qty = Math.max(1, parseInt(String(row['Quantity'] || '1'), 10))
    const rawSku = String(row['Seller SKU'] || '').trim()

    if (rawSku.includes('+')) {
      const resolved = resolveCombinedSku(rawSku, skuMappingMap)
      if (!resolved) {
        failed.push({
          rowNumber,
          orderNo,
          sku: rawSku,
          reason: 'SKU gabungan tidak ditemukan di DATABASE PRODUK GABUNGAN',
        })
        continue
      }

      const nonKaosCount = resolved.filter(s => !isKaosSku(s)).length || resolved.length
      for (const sku of resolved) {
        const splitSubtotal = isKaosSku(sku) ? 0 : Math.round(subtotalAfterDisc / nonKaosCount)
        const realOmzet = Math.round(splitSubtotal * (1 - tiktokAdminFee / 100))
        const skuKey = sku.toLowerCase()

        orders.push({
          orderNo,
          status,
          platform: 'TikTok',
          airwaybill: String(row['Tracking ID'] || '').trim() || null,
          orderCreatedAt: String(row['Order settled time'] || row['Created Time'] || '').trim() || null,
          sku: sku || null,
          productName: sku || String(row['Product Name'] || '').trim() || null,
          qty,
          totalProductPrice: splitSubtotal,
          realOmzet,
          city: String(row['Regency and City'] || '').trim() || null,
          province: String(row['Province'] || '').trim() || null,
          buyerUsername: String(row['Buyer Username'] || '').trim() || null,
          receiverName: String(row['Recipient'] || '').trim() || null,
          phone: String(row['Phone #'] || '').trim() || null,
          hpp: hppMap.get(skuKey) ?? 0,
        })
      }
    } else {
      // Produk dikecualikan → subtotal dan omzet = 0
      const effectiveSubtotal = isKaosSku(rawSku) ? 0 : subtotalAfterDisc
      const realOmzet = Math.round(effectiveSubtotal * (1 - tiktokAdminFee / 100))
      const skuKey = rawSku.toLowerCase()

      orders.push({
        orderNo,
        status,
        platform: 'TikTok',
        airwaybill: String(row['Tracking ID'] || '').trim() || null,
        orderCreatedAt: String(row['Order settled time'] || row['Created Time'] || '').trim() || null,
        sku: rawSku || null,
        productName: String(row['Product Name'] || '').trim() || null,
        qty,
        totalProductPrice: effectiveSubtotal,
        realOmzet,
        city: String(row['Regency and City'] || '').trim() || null,
        province: String(row['Province'] || '').trim() || null,
        buyerUsername: String(row['Buyer Username'] || '').trim() || null,
        receiverName: String(row['Recipient'] || '').trim() || null,
        phone: String(row['Phone #'] || '').trim() || null,
        hpp: hppMap.get(skuKey) ?? 0,
      })
    }
  }

  return { orders, failed }
}

// ── AUTO DETECT PLATFORM ───────────────────────────────

/** Deteksi platform dari header kolom */
export function detectPlatform(headers: string[]): 'TikTok' | 'Shopee' | null {
  const headerSet = new Set(headers.map(h => h?.toLowerCase?.() ?? ''))
  if (headerSet.has('order id') || headerSet.has('seller sku') || headerSet.has('tracking id') || headerSet.has('order settled time')) {
    return 'TikTok'
  }
  if (headerSet.has('no. pesanan') || headerSet.has('nomor referensi sku') || headerSet.has('waktu dana dilepaskan') || headerSet.has('waktu pesanan dibuat')) {
    return 'Shopee'
  }
  return null
}
