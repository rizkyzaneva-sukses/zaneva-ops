import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError, getPagination } from '@/lib/utils'

// ─────────────────────────────────────────────
// Helper: safe number coercion
// Handles: number, string (with comma thousand-sep), undefined, null
// ─────────────────────────────────────────────
function n(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0
  if (typeof v === 'number') return isNaN(v) ? 0 : v
  // Remove thousand-separator commas before parsing (e.g. "1,234.56" → 1234.56)
  const cleaned = String(v).replace(/,/g, '').trim()
  const x = Number(cleaned)
  return isNaN(x) ? 0 : x
}

// ─────────────────────────────────────────────
// Shopee Income formula
// ─────────────────────────────────────────────
interface ShopeeCalc {
  omzet: number
  biayaPlatform: number
  biayaAms: number
  biayaPlatformLainnya: number
  bebanOngkir: number
  yangDiterima: number
}

function calcShopee(row: Record<string, unknown>): ShopeeCalc {
  const omzet =
    n(row['Harga Asli Produk']) +
    n(row['Total Diskon Produk']) +
    n(row['Voucher disponsor oleh Penjual']) +
    n(row['Voucher co-fund disponsor oleh Penjual'])

  const biayaPlatform =
    n(row['Biaya Administrasi']) +
    n(row['Biaya Layanan']) +
    n(row['Biaya Proses Pesanan'])

  const biayaAms = n(row['Biaya Komisi AMS'])

  const biayaPlatformLainnya =
    n(row['Premi']) +
    n(row['Biaya Program Hemat Biaya Kirim']) +
    n(row['Biaya Transaksi']) +
    n(row['Biaya Kampanye']) +
    n(row['Bea Masuk, PPN & PPh']) +
    n(row['Biaya Isi Saldo Otomatis (dari Penghasilan)'])

  const bebanOngkir =
    n(row['Ongkos Kirim Pengembalian Barang']) +
    n(row['Kembali ke Biaya Pengiriman Pengirim']) +
    n(row['Pengembalian Biaya Kirim'])

  const yangDiterima = n(row['Total Penghasilan'])

  return { omzet, biayaPlatform, biayaAms, biayaPlatformLainnya, bebanOngkir, yangDiterima }
}

// ─────────────────────────────────────────────
// TikTok Income formula
// ─────────────────────────────────────────────
interface TikTokCalc {
  omzet: number
  biayaPlatform: number
  biayaAms: number
  yangDiterima: number
}

function calcTikTok(row: Record<string, unknown>): TikTokCalc {
  // Omzet / Revenue — berbagai format ekspor TikTok
  const omzet =
    n(row['Total Revenue']) ||
    n(row['Total Pendapatan']) ||
    n(row['Total pendapatan']) ||
    n(row['Seller Revenue']) ||
    n(row['Pendapatan Penjual']) ||
    0

  const biayaPlatform =
    n(row['Platform commission fee'] || row['Biaya komisi platform'] || 0) +
    n(row['Order processing fee']    || row['Biaya pemrosesan pesanan'] || 0) +
    n(row['Dynamic commission']      || row['Komisi dinamis'] || 0) +
    n(row['Shipping cost']           || row['Biaya pengiriman'] || 0) +
    n(row['Transaction fee']         || row['Biaya transaksi'] || 0) +
    n(row['Seller Transaction Fee']  || row['Biaya Transaksi Penjual'] || 0)

  const biayaAms =
    n(row['Affiliate Commission']          || row['Komisi afiliasi'] || 0) +
    n(row['Affiliate Shop Ads commission'] || row['Komisi Iklan Toko Afiliasi'] || 0)

  // Settlement amount — ini yang harus jadi totalIncome
  // TikTok punya banyak varian nama kolom tergantung versi export
  const yangDiterima =
    n(row['Total settlement amount'])  ||
    n(row['Total Settlement Amount'])  ||
    n(row['Settlement Amount'])        ||
    n(row['Jumlah penyelesaian'])      ||
    n(row['Total Penyelesaian'])       ||
    n(row['Jumlah Penyelesaian'])      ||
    n(row['Seller Settlement Amount']) ||
    n(row['Jumlah Penyelesaian Penjual']) ||
    0

  return { omzet, biayaPlatform, biayaAms, yangDiterima }
}

// ─────────────────────────────────────────────
// GET /api/payouts
// ─────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const { searchParams } = request.nextUrl
  const walletId  = searchParams.get('walletId') || ''
  const dateFrom  = searchParams.get('dateFrom')
  const dateTo    = searchParams.get('dateTo')
  const platform  = searchParams.get('platform') || ''
  const { skip, take } = getPagination({
    page:  Number(searchParams.get('page')  || 1),
    limit: Number(searchParams.get('limit') || 50),
  })

  const where: Record<string, unknown> = {}
  if (walletId)  where.walletId = walletId
  if (platform)  where.platform = platform
  if (dateFrom || dateTo) {
    const rf: Record<string, Date> = {}
    if (dateFrom) rf.gte = new Date(dateFrom)
    if (dateTo)   rf.lte = new Date(`${dateTo}T23:59:59.999Z`)
    where.releasedDate = rf
  }

  const [payouts, total, sumResult] = await Promise.all([
    prisma.payout.findMany({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      where: where as any,
      include: { wallet: { select: { name: true } } },
      orderBy: { releasedDate: 'desc' },
      skip,
      take,
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma.payout.count({ where: where as any }),
    prisma.payout.aggregate({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      where: where as any,
      _sum: { omzet: true, totalIncome: true, platformFee: true, amsFee: true },
    }),
  ])

  return apiSuccess({
    payouts,
    total,
    summary: {
      totalOmzet:       sumResult._sum.omzet       ?? 0,
      totalIncome:      sumResult._sum.totalIncome  ?? 0,
      totalPlatformFee: sumResult._sum.platformFee  ?? 0,
      totalAmsFee:      sumResult._sum.amsFee       ?? 0,
    },
  })
}

// ─────────────────────────────────────────────
// POST /api/payouts
// Supports: CSV manual (legacy) + Shopee Income + TikTok Income
// ─────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const body = await request.json()
  const { source = 'manual_csv', walletId } = body

  if (!walletId) return apiError('Wallet wajib dipilih')
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } })
  if (!wallet) return apiError('Wallet tidak ditemukan')

  // ── LEGACY: CSV manual ───────────────────────────────
  if (source === 'manual_csv' || !source) {
    const { payouts } = body
    if (!Array.isArray(payouts) || payouts.length === 0)
      return apiError('Data payout kosong')

    const orderNos = payouts.map((p: Record<string, unknown>) =>
      String(p.order_no || p.orderNo || ''))
    const existing = await prisma.payout.findMany({
      where: { orderNo: { in: orderNos } },
      select: { orderNo: true },
    })
    const existingSet = new Set(existing.map(e => e.orderNo))

    const newPayouts = payouts.filter((p: Record<string, unknown>) => {
      const orderNo = String(p.order_no || p.orderNo || '')
      return orderNo && !existingSet.has(orderNo)
    })

    if (newPayouts.length === 0)
      return apiSuccess({ inserted: 0, skipped: payouts.length, message: 'Semua data sudah ada' })

    const matchOrderNos = newPayouts.map((p: Record<string, unknown>) =>
      String(p.order_no || p.orderNo))
    const orders = await prisma.order.findMany({
      where: { orderNo: { in: matchOrderNos } },
      select: { id: true, orderNo: true },
      distinct: ['orderNo'],
    })
    const orderMap = new Map(orders.map(o => [o.orderNo, o.id]))

    const CHUNK = 300
    let inserted = 0

    for (let i = 0; i < newPayouts.length; i += CHUNK) {
      const chunk = newPayouts.slice(i, i + CHUNK)
      const payoutRows = chunk.map((p: Record<string, unknown>) => {
        const orderNo     = String(p.order_no || p.orderNo || '')
        const omzet       = n(p.omzet)
        const platformFee = n(p.platform_fee || p.platformFee)
        const amsFee      = n(p.ams_fee || p.amsFee)
        const totalIncome = omzet - platformFee - amsFee
        const releasedDate = new Date(String(p.released_date || p.releasedDate || new Date()))
        return {
          orderNo, omzet, platformFee, amsFee, totalIncome,
          releasedDate, walletId, source: 'manual_csv',
          orderId: orderMap.get(orderNo) ?? null,
          createdBy: session.username,
        }
      })
      const ledgerRows = chunk.map((p: Record<string, unknown>) => {
        const orderNo     = String(p.order_no || p.orderNo || '')
        const omzet       = n(p.omzet)
        const platformFee = n(p.platform_fee || p.platformFee)
        const amsFee      = n(p.ams_fee || p.amsFee)
        const totalIncome = omzet - platformFee - amsFee
        const releasedDate = new Date(String(p.released_date || p.releasedDate || new Date()))
        return {
          walletId, trxDate: releasedDate, trxType: 'PAYOUT' as const,
          category: 'Payout Marketplace', amount: totalIncome,
          refOrderNo: orderNo, note: `Payout order ${orderNo}`,
          createdBy: session.username,
        }
      })
      await prisma.$transaction([
        prisma.payout.createMany({ data: payoutRows }),
        prisma.walletLedger.createMany({ data: ledgerRows }),
      ])
      inserted += chunk.length
    }
    return apiSuccess({ inserted, skipped: payouts.length - newPayouts.length }, 201)
  }

  // ── NEW: Shopee / TikTok Income Excel ───────────────
  if (source !== 'shopee_income' && source !== 'tiktok_income')
    return apiError('Source tidak dikenal')

  const { rawRows, isPreview } = body
  let { periodeFrom, periodeTo } = body
  if (!Array.isArray(rawRows) || rawRows.length === 0)
    return apiError('Data rows kosong')

  const platform     = source === 'shopee_income' ? 'Shopee' : 'TikTok'
  const ledgerCat    = `Payout ${platform}`
  const CHUNK        = 200

  // Normalize row keys (trim whitespace) — TikTok CSV headers may have trailing spaces
  const normalizedRawRows: Record<string, unknown>[] = rawRows.map((row: Record<string, unknown>) => {
    if (source !== 'tiktok_income') return row
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(row)) out[k.trim()] = v
    return out
  })

  let normalCount    = 0
  let returCount     = 0
  let bebanCount     = 0
  let duplikatCount  = 0
  let totalMasuk     = 0
  let totalBeban     = 0
  const detailBeban: { orderNo: string; amount: number }[] = []
  const detailDuplikat: string[] = []
  // For UI preview
  const invalidRows: { rowNumber: number; value: string; reason: string }[] = []
  
  // Filter valid rows based on source to keep line numbers accurate
  const mappedRows = normalizedRawRows.map((row, idx) => ({ ...row, __lineNum: idx + 2 })) // +2 because header is row 1
  let filteredRows: any[] = []
  
  if (source === 'tiktok_income') {
    filteredRows = mappedRows.filter((r: any) => {
      const typeStr = String(r['Type'] || r['Jenis'] || r['Tipe'] || '').trim()
      // If TikTok data has NO type column at all, accept all rows
      if (!('Type' in r) && !('Jenis' in r) && !('Tipe' in r)) return true
      // Accept Order/Pesanan rows only — skip Refund/Adjustment/Return rows
      return typeStr === 'Order' || typeStr === 'Pesanan'
    })
  } else {
    filteredRows = mappedRows
  }

  if (filteredRows.length === 0 && rawRows.length > 0) {
    const cols = Object.keys(normalizedRawRows[0] || {}).slice(0, 10).join(', ')
    return apiError(`Format file tidak sesuai atau kosong. Kolom terdeteksi: ${cols}`)
  }

  // ── Server-side fallback: derive periodeFrom/periodeTo from Order settled time ──
  // This handles cases where client couldn't extract period from the file (XLSX Reports sheet missing/wrong format)
  if (source === 'tiktok_income' && (!periodeFrom || !periodeTo)) {
    const times: number[] = []
    for (const row of filteredRows) {
      const raw = String((row as Record<string, unknown>)['Order settled time'] || (row as Record<string, unknown>)['Waktu penyelesaian pesanan'] || '').trim()
      if (raw) {
        const d = new Date(raw.replace(/\//g, '-'))
        if (!isNaN(d.getTime())) times.push(d.getTime())
      }
    }
    if (times.length > 0) {
      periodeFrom = new Date(Math.min(...times)).toISOString().slice(0, 10)
      periodeTo   = new Date(Math.max(...times)).toISOString().slice(0, 10)
    }
  }
  if (source === 'shopee_income' && (!periodeFrom || !periodeTo)) {
    const times: number[] = []
    for (const row of filteredRows) {
      const raw = String((row as Record<string, unknown>)['Tanggal Dana Dilepaskan'] || '').trim()
      if (raw) {
        const d = new Date(raw)
        if (!isNaN(d.getTime())) times.push(d.getTime())
      }
    }
    if (times.length > 0) {
      periodeFrom = new Date(Math.min(...times)).toISOString().slice(0, 10)
      periodeTo   = new Date(Math.max(...times)).toISOString().slice(0, 10)
    }
  }

  // ── For TikTok: detect which column is being used for settlement & omzet ──
  let detectedSettlementCol = '(tidak ditemukan)'
  let detectedOmzetCol = '(tidak ditemukan)'
  let detectedSettlementRaw: unknown = undefined
  let detectedOmzetRaw: unknown = undefined
  if (source === 'tiktok_income' && filteredRows.length > 0) {
    const sampleRow = filteredRows[0] as Record<string, unknown>
    const settlementCols = ['Total settlement amount','Total Settlement Amount','Settlement Amount','Jumlah penyelesaian','Total Penyelesaian','Jumlah Penyelesaian','Seller Settlement Amount','Jumlah Penyelesaian Penjual']
    const omzetCols = ['Total Revenue','Total Pendapatan','Total pendapatan','Seller Revenue','Pendapatan Penjual']
    detectedSettlementCol = settlementCols.find(c => sampleRow[c] !== undefined) ?? '(tidak ditemukan)'
    detectedOmzetCol = omzetCols.find(c => sampleRow[c] !== undefined) ?? '(tidak ditemukan)'
    if (detectedSettlementCol !== '(tidak ditemukan)') detectedSettlementRaw = sampleRow[detectedSettlementCol]
    if (detectedOmzetCol !== '(tidak ditemukan)') detectedOmzetRaw = sampleRow[detectedOmzetCol]
  }

  // Collect all orderNos for bulk duplicate check
  const allOrderNos = filteredRows.map(r => {
    if (source === 'shopee_income') return String(r['No. Pesanan'] ?? '').trim()
    return String(r['Order/adjustment ID'] || r['ID Pesanan/Penyesuaian'] || r['ID pesanan/penyesuaian'] || '').trim()
  }).filter(Boolean)

  const existingPayouts = await prisma.payout.findMany({
    where: { orderNo: { in: allOrderNos } },
    select: { orderNo: true },
  })
  const existingSet = new Set(existingPayouts.map(e => e.orderNo))

  // ── Pre-fetch matching orders for orderId link + trxDate update ─────
  const existingOrders = await prisma.order.findMany({
    where: { orderNo: { in: allOrderNos } },
    select: { id: true, orderNo: true },
    distinct: ['orderNo'],
  })
  const orderIdMap = new Map(existingOrders.map(o => [o.orderNo, o.id]))

  const allPayoutInserts: any[] = []
  const allLedgerInserts: any[] = []
  // Map orderNo → releasedDate, to patch orders.trx_date after insert
  const orderDateUpdates: { orderNo: string; releasedDate: Date }[] = []

  // Process rows
  for (const row of filteredRows) {
    const lineNum = row.__lineNum

    if (source === 'shopee_income') {
      const orderNo = String(row['No. Pesanan'] ?? '').trim()
      if (!orderNo) {
        invalidRows.push({ rowNumber: lineNum, value: '-', reason: 'Tidak ada No. Pesanan' })
        continue
      }

      const calc = calcShopee(row)
      if (isNaN(calc.yangDiterima) || isNaN(calc.omzet)) {
        invalidRows.push({ rowNumber: lineNum, value: orderNo, reason: 'Format numerik (jumlah/omzet) tidak valid' })
        continue
      }
      const settlement = calc.yangDiterima

      if (settlement === 0) { returCount++; continue }
      if (settlement < 0) {
        bebanCount++
        totalBeban += settlement
        detailBeban.push({ orderNo, amount: settlement })
        allLedgerInserts.push({
          walletId,
          trxDate:  periodeFrom ? new Date(periodeFrom) : new Date(),
          trxType:  'EXPENSE',
          category: 'Beban Kerugian Ongkir',
          amount:   settlement,
          note:     `Retur Shopee - ${orderNo}`,
          createdBy: session.username,
        })
        continue
      }

      if (existingSet.has(orderNo)) {
        duplikatCount++
        detailDuplikat.push(orderNo)
        continue
      }

      const rawDate = String(row['Tanggal Dana Dilepaskan'] ?? '').trim()
      const releasedDate = rawDate ? new Date(rawDate) : new Date()
      if (isNaN(releasedDate.getTime())) {
        invalidRows.push({ rowNumber: lineNum, value: orderNo, reason: 'Format Tanggal Dana Dilepaskan tidak valid' })
        continue
      }

      allPayoutInserts.push({
        orderNo,
        releasedDate,
        platform,
        omzet:            Math.round(Math.abs(calc.omzet)),
        platformFee:      Math.round(Math.abs(calc.biayaPlatform)),
        amsFee:           Math.round(Math.abs(calc.biayaAms)),
        platformFeeOther: Math.round(Math.abs(calc.biayaPlatformLainnya)),
        bebanOngkir:      0,
        totalIncome:      Math.round(settlement),
        walletId,
        source:           'shopee_income',
        createdBy:        session.username,
        orderId:          orderIdMap.get(orderNo) ?? null,
      })
      // Track for trxDate update
      if (orderIdMap.has(orderNo)) {
        orderDateUpdates.push({ orderNo, releasedDate })
      }
      allLedgerInserts.push({
        walletId,
        trxDate:  releasedDate,
        trxType:  'PAYOUT',
        category: ledgerCat,
        amount:   Math.round(settlement),
        refOrderNo: orderNo,
        note:     `Payout Shopee - ${orderNo}`,
        createdBy: session.username,
      })
      normalCount++
      totalMasuk += settlement

    } else {
      // TikTok
      const orderNo = String(row['Order/adjustment ID'] || row['ID Pesanan/Penyesuaian'] || row['ID pesanan/penyesuaian'] || '').trim()
      if (!orderNo) {
        invalidRows.push({ rowNumber: lineNum, value: '-', reason: 'Tidak ada ID Pesanan' })
        continue
      }

      const calc = calcTikTok(row)
      if (isNaN(calc.yangDiterima) || isNaN(calc.omzet)) {
        invalidRows.push({ rowNumber: lineNum, value: orderNo, reason: 'Format numerik settlement/omzet tidak valid' })
        continue
      }
      const settlement = calc.yangDiterima

      // settlement === 0: order processed but net = 0 (fully offset by fees/promos)
      // Report as invalid so user can investigate — don't silently count as "retur"
      if (settlement === 0) {
        returCount++
        continue
      }
      // TikTok: transaksi negatif MENGURANGI total pencairan (saling mengurangi dengan order positif)
      // Bukan dipisah sebagai beban ongkir — sesuai cara TikTok hitung settlement batch
      if (settlement < 0) {
        bebanCount++
        totalBeban += settlement
        detailBeban.push({ orderNo, amount: settlement })
        const rawSettledDate = String(row['Order settled time'] || row['Waktu penyelesaian pesanan'] || '').trim()
        const trxDate = rawSettledDate ? new Date(rawSettledDate.replace(/\//g, '-')) : new Date()
        // Tetap masuk sebagai PAYOUT (nilai negatif) supaya mengurangi total pencairan
        allPayoutInserts.push({
          orderNo,
          releasedDate: isNaN(trxDate.getTime()) ? new Date() : trxDate,
          platform,
          omzet:            0,
          platformFee:      0,
          amsFee:           0,
          platformFeeOther: 0,
          bebanOngkir:      Math.round(Math.abs(settlement)),
          totalIncome:      Math.round(settlement), // nilai negatif
          walletId,
          source:           'tiktok_income',
          createdBy:        session.username,
          orderId:          orderIdMap.get(orderNo) ?? null,
        })
        allLedgerInserts.push({
          walletId,
          trxDate: isNaN(trxDate.getTime()) ? new Date() : trxDate,
          trxType:  'PAYOUT',
          category: ledgerCat,
          amount:   Math.round(settlement), // negatif → mengurangi saldo
          refOrderNo: orderNo,
          note:     `Payout TikTok (minus) - ${orderNo}`,
          createdBy: session.username,
        })
        continue
      }

      if (existingSet.has(orderNo)) {
        duplikatCount++
        detailDuplikat.push(orderNo)
        continue
      }

      const rawSettledDate = String(row['Order settled time'] || row['Waktu penyelesaian pesanan'] || '').trim()
      const releasedDate = rawSettledDate ? new Date(rawSettledDate.replace(/\//g, '-')) : new Date()
      if (rawSettledDate && isNaN(releasedDate.getTime())) {
        invalidRows.push({ rowNumber: lineNum, value: orderNo, reason: 'Waktu penyelesaian pesanan tidak valid' })
        continue
      }

      allPayoutInserts.push({
        orderNo,
        releasedDate,
        platform,
        omzet:            Math.round(Math.abs(calc.omzet)),
        platformFee:      Math.round(Math.abs(calc.biayaPlatform)),
        amsFee:           Math.round(Math.abs(calc.biayaAms)),
        platformFeeOther: 0,
        bebanOngkir:      0,
        // Math.round() = bulatkan ke 1 Rp terdekat (akurat, bukan ke ribuan)
        totalIncome:      Math.round(settlement),
        walletId,
        source:           'tiktok_income',
        createdBy:        session.username,
        orderId:          orderIdMap.get(orderNo) ?? null,
      })
      // Track for trxDate update
      if (orderIdMap.has(orderNo)) {
        orderDateUpdates.push({ orderNo, releasedDate })
      }
      allLedgerInserts.push({
        walletId,
        trxDate:  releasedDate,
        trxType:  'PAYOUT',
        category: ledgerCat,
        // Math.round() = bulatkan ke 1 Rp terdekat (akurat, bukan ke ribuan)
        amount:   Math.round(settlement),
        refOrderNo: orderNo,
        note:     `Payout TikTok - ${orderNo}`,
        createdBy: session.username,
      })
      normalCount++
      totalMasuk += settlement
    }
  }

  // Construct summary results
  const summaryResult = {
    platform,
    periodeFrom,
    periodeTo,
    totalBarisData:      filteredRows.length,
    normal:              normalCount,
    retur:               returCount,
    bebanOngkir:         bebanCount,
    duplikat:            duplikatCount,
    totalMasuk:          Math.round(totalMasuk),
    totalBeban:          Math.round(totalBeban),
    detailBebanOngkir:   detailBeban,
    detailDuplikat,
    invalidRows,
    // TikTok debug: which column was used
    ...(source === 'tiktok_income' && {
      debug: {
        settlementColumn:   detectedSettlementCol,
        settlementRawValue: detectedSettlementRaw,
        omzetColumn:        detectedOmzetCol,
        omzetRawValue:      detectedOmzetRaw,
        allColumns:         Object.keys((filteredRows[0] as Record<string, unknown>) ?? {}),
      }
    }),
  }


  if (isPreview) {
    return apiSuccess({ isPreview: true, ...summaryResult }, 200)
  }

  // Actual execution in chunks
  if (allPayoutInserts.length > 0 || allLedgerInserts.length > 0) {
    for (let i = 0; i < Math.max(allPayoutInserts.length, allLedgerInserts.length); i += CHUNK) {
      const ops = []
      const cPayout = allPayoutInserts.slice(i, i + CHUNK)
      const cLedger = allLedgerInserts.slice(i, i + CHUNK)
      if (cPayout.length > 0) ops.push(prisma.payout.createMany({ data: cPayout }))
      if (cLedger.length > 0) ops.push(prisma.walletLedger.createMany({ data: cLedger }))
      await prisma.$transaction(ops)
    }
  }

  // ── Sync trx_date on matched orders ────────────────────────────────────
  // Update orders.trx_date = payout.releasedDate for every matched order
  if (orderDateUpdates.length > 0) {
    const UPDATE_CHUNK = 100
    for (let i = 0; i < orderDateUpdates.length; i += UPDATE_CHUNK) {
      const chunk = orderDateUpdates.slice(i, i + UPDATE_CHUNK)
      await Promise.all(
        chunk.map(({ orderNo, releasedDate }) =>
          prisma.order.updateMany({
            where: { orderNo },
            data: { trxDate: releasedDate },
          })
        )
      )
    }
  }

  return apiSuccess({ isPreview: false, ...summaryResult }, 201)
}

// ─────────────────────────────────────────────
// DELETE /api/payouts
// ─────────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (session.userRole !== 'OWNER') return apiError('Forbidden', 403)

  try {
    const body = await request.json()
    const { ids } = body
    if (!ids || !Array.isArray(ids)) return apiError('Parameter ids tidak valid')

    const payouts = await prisma.payout.findMany({
      where: { id: { in: ids } },
      select: { orderNo: true }
    })
    const orderNos = payouts.map(p => p.orderNo)

    await prisma.$transaction([
      prisma.walletLedger.deleteMany({
        where: {
          refOrderNo: { in: orderNos },
          trxType: 'PAYOUT'
        }
      }),
      prisma.payout.deleteMany({
        where: { id: { in: ids } }
      })
    ])

    return apiSuccess({ message: `${payouts.length} payout berhasil dihapus` })
  } catch (error: any) {
    return apiError(error.message || 'Gagal menghapus payout', 500)
  }
}
