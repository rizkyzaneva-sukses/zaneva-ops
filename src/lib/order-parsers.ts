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

// ── SHOPEE PARSER ──────────────────────────────────────

/**
 * Parse raw Shopee rows (dari Excel/CSV yang sudah jadi array of object)
 *
 * Logika:
 * - Skip baris dengan status batal
 * - Voucher Ditanggung Penjual: hanya ambil dari baris PERTAMA per invoice
 * - Real Omzet per baris = (HargaAfterDisc - ((HargaAfterDisc - Voucher) * 14%)) * Qty
 * - SKU = Nomor Referensi SKU
 * - Tanggal = Waktu Dana Dilepaskan (bukan Waktu Pesanan Dibuat)
 */
export function parseShopeeOrders(
  rawRows: Record<string, unknown>[],
  hppMap: Map<string, number>,  // sku.toLowerCase() → hpp
  shopeeAdminFee = 14
): ParsedOrder[] {
  // Group by No. Pesanan untuk handle multi-item invoice
  const groups = new Map<string, Record<string, unknown>[]>()
  for (const row of rawRows) {
    const orderNo = String(row['No. Pesanan'] || '').trim()
    if (!orderNo) continue
    const arr = groups.get(orderNo) ?? []
    arr.push(row)
    groups.set(orderNo, arr)
  }

  const result: ParsedOrder[] = []

  for (const [orderNo, items] of groups) {
    const firstItem = items[0]
    const status = String(firstItem['Status Pesanan'] || '').trim()

    // Skip batal
    if (isShopeeCancel(status)) continue

    // Voucher seller hanya dari baris pertama
    const voucherSeller = parseShopeeNum(firstItem['Voucher Ditanggung Penjual'])

    items.forEach((item, idx) => {
      const hargaAfterDisc = parseShopeeNum(item['Harga Setelah Diskon'])
      const qty = Math.max(1, parseInt(String(item['Jumlah'] || '1'), 10))

      // Voucher hanya berlaku di baris pertama
      const voucher = idx === 0 ? voucherSeller : 0

      // Real Omzet = ((HargaAfterDisc - Voucher) - ((HargaAfterDisc - Voucher) * adminFee%)) * Qty
      const basePrice = hargaAfterDisc - voucher
      const fee = basePrice * (shopeeAdminFee / 100)
      const realOmzetPerItem = Math.round((basePrice - fee) * qty)

      // SKU = Nomor Referensi SKU
      const sku = String(item['Nomor Referensi SKU'] || '').trim() || null
      const skuKey = sku?.toLowerCase() ?? ''

      result.push({
        orderNo,
        status,
        platform: 'Shopee',
        airwaybill: String(item['No. Resi'] || '').trim() || null,
        orderCreatedAt: String(item['Waktu Dana Dilepaskan'] || item['Waktu Pesanan Dibuat'] || '').trim() || null,
        sku,
        productName: String(item['Nama Produk'] || '').trim() || null,
        qty,
        totalProductPrice: Math.round(hargaAfterDisc * qty),
        realOmzet: realOmzetPerItem,
        city: String(item['Kota/Kabupaten'] || '').trim() || null,
        province: String(item['Provinsi'] || '').trim() || null,
        buyerUsername: String(item['Username (Pembeli)'] || '').trim() || null,
        receiverName: String(item['Nama Penerima'] || '').trim() || null,
        phone: String(item['No. Telepon'] || '').trim() || null,
        hpp: hppMap.get(skuKey) ?? 0,
      })
    })
  }

  return result
}

// ── TIKTOK PARSER ─────────────────────────────────────

/**
 * Parse raw TikTok rows (dari CSV yang sudah jadi array of object)
 *
 * Logika:
 * - Skip status batal/cancelled
 * - Real Omzet = SKU Subtotal After Discount * (1 - 14.1%)
 * - SKU = Seller SKU
 * - Setiap baris = 1 produk (TikTok sudah 1 row per SKU)
 * - Tanggal = Order settled time (bukan Created Time)
 */
export function parseTikTokOrders(
  rawRows: Record<string, unknown>[],
  hppMap: Map<string, number>,
  tiktokAdminFee = 14.1
): ParsedOrder[] {
  const result: ParsedOrder[] = []

  for (const row of rawRows) {
    const orderNo = String(row['Order ID'] || '').trim()
    if (!orderNo) continue

    const status = String(row['Order Status'] || '').trim()
    if (isTikTokCancel(status)) continue

    const subtotalAfterDisc = parseTikTokNum(row['SKU Subtotal After Discount'])
    const qty = Math.max(1, parseInt(String(row['Quantity'] || '1'), 10))

    // Real Omzet = Subtotal After Discount * (1 - adminFee%)
    const realOmzetPerItem = Math.round(subtotalAfterDisc * (1 - tiktokAdminFee / 100))

    const sku = String(row['Seller SKU'] || '').trim() || null
    const skuKey = sku?.toLowerCase() ?? ''

    result.push({
      orderNo,
      status,
      platform: 'TikTok',
      airwaybill: String(row['Tracking ID'] || '').trim() || null,
      orderCreatedAt: String(row['Order settled time'] || row['Created Time'] || '').trim() || null,
      sku,
      productName: String(row['Product Name'] || '').trim() || null,
      qty,
      totalProductPrice: subtotalAfterDisc,
      realOmzet: realOmzetPerItem,
      city: String(row['Regency and City'] || '').trim() || null,
      province: String(row['Province'] || '').trim() || null,
      buyerUsername: String(row['Buyer Username'] || '').trim() || null,
      receiverName: String(row['Recipient'] || '').trim() || null,
      phone: String(row['Phone #'] || '').trim() || null,
      hpp: hppMap.get(skuKey) ?? 0,
    })
  }

  return result
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
