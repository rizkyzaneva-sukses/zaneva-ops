import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError, getPagination } from '@/lib/utils'

// ─────────────────────────────────────────────
// Helper: safe number coercion
// ─────────────────────────────────────────────
function n(v: unknown): number {
  const x = Number(v)
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
  const omzet = n(row['Total Revenue'] || row['Total Pendapatan'] || row['Total pendapatan'] || 0)

  const biayaPlatform =
    n(row['Platform commission fee'] || row['Biaya komisi platform'] || 0) +
    n(row['Order processing fee'] || row['Biaya pemrosesan pesanan'] || 0) +
    n(row['Dynamic commission'] || row['Komisi dinamis'] || 0) +
    n(row['Shipping cost'] || row['Biaya pengiriman'] || 0)

  const biayaAms =
    n(row['Affiliate Commission'] || row['Komisi afiliasi'] || 0) +
    n(row['Affiliate Shop Ads commission'] || row['Komisi Iklan Toko Afiliasi'] || 0)

  const yangDiterima = n(row['Total settlement amount'] || row['Total Settlement Amount'] || row['Jumlah penyelesaian'] || row['Total Penyelesaian'] || 0)

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

  const { rawRows, periodeFrom, periodeTo } = body
  if (!Array.isArray(rawRows) || rawRows.length === 0)
    return apiError('Data rows kosong')

  const platform     = source === 'shopee_income' ? 'Shopee' : 'TikTok'
  const ledgerCat    = `Payout ${platform}`
  const CHUNK        = 200

  let normalCount    = 0
  let returCount     = 0
  let bebanCount     = 0
  let duplikatCount  = 0
  let totalMasuk     = 0
  let totalBeban     = 0
  const detailBeban: { orderNo: string; amount: number }[] = []
  const detailDuplikat: string[] = []

  // Filter valid rows based on source
  let filteredRows: Record<string, unknown>[] = []
  if (source === 'tiktok_income') {
    filteredRows = (rawRows as Record<string, unknown>[]).filter(r => {
      const typeStr = String(r['Type'] || r['Jenis'] || r['Tipe'] || '').trim()
      return typeStr === 'Order' || typeStr === 'Pesanan'
    })
  } else {
    filteredRows = rawRows as Record<string, unknown>[]
  }

  if (filteredRows.length === 0 && rawRows.length > 0) {
    const cols = Object.keys(rawRows[0] || {}).slice(0, 7).join(', ')
    return apiError(`Format file tidak sesuai atau kosong. Kolom terdeteksi: ${cols}`)
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

  // Process in chunks
  for (let i = 0; i < filteredRows.length; i += CHUNK) {
    const chunk = filteredRows.slice(i, i + CHUNK)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payoutInserts: any[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ledgerInserts: any[] = []

    for (const row of chunk) {
      if (source === 'shopee_income') {
        const orderNo = String(row['No. Pesanan'] ?? '').trim()
        if (!orderNo) continue

        const calc = calcShopee(row)
        const settlement = calc.yangDiterima

        // CASE 2: retur full
        if (settlement === 0) { returCount++; continue }

        // CASE 3: beban ongkir (settlement < 0)
        if (settlement < 0) {
          bebanCount++
          totalBeban += settlement
          detailBeban.push({ orderNo, amount: settlement })
          ledgerInserts.push({
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

        // CASE 1: normal
        if (existingSet.has(orderNo)) {
          duplikatCount++
          detailDuplikat.push(orderNo)
          continue
        }

        // Parse released date
        const rawDate = String(row['Tanggal Dana Diterima'] ?? '').trim()
        const releasedDate = rawDate ? new Date(rawDate) : new Date()

        payoutInserts.push({
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
        })
        ledgerInserts.push({
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
        if (!orderNo) continue

        const calc = calcTikTok(row)
        const settlement = calc.yangDiterima

        // CASE 2: retur full
        if (settlement === 0) { returCount++; continue }

        // CASE 3: beban ongkir
        if (settlement < 0) {
          bebanCount++
          totalBeban += settlement
          detailBeban.push({ orderNo, amount: settlement })
          const rawSettledDate = String(row['Order settled time'] || row['Waktu penyelesaian pesanan'] || '').trim()
          const trxDate = rawSettledDate
            ? new Date(rawSettledDate.replace(/\//g, '-'))
            : new Date()
          ledgerInserts.push({
            walletId,
            trxDate,
            trxType:  'EXPENSE',
            category: 'Beban Kerugian Ongkir',
            amount:   settlement,
            note:     `Retur TikTok - ${orderNo}`,
            createdBy: session.username,
          })
          continue
        }

        // CASE 1: normal
        if (existingSet.has(orderNo)) {
          duplikatCount++
          detailDuplikat.push(orderNo)
          continue
        }

        const rawSettledDate = String(row['Order settled time'] || row['Waktu penyelesaian pesanan'] || '').trim()
        const releasedDate = rawSettledDate
          ? new Date(rawSettledDate.replace(/\//g, '-'))
          : new Date()

        payoutInserts.push({
          orderNo,
          releasedDate,
          platform,
          omzet:            Math.round(Math.abs(calc.omzet)),
          platformFee:      Math.round(Math.abs(calc.biayaPlatform)),
          amsFee:           Math.round(Math.abs(calc.biayaAms)),
          platformFeeOther: 0,
          bebanOngkir:      0,
          totalIncome:      Math.round(settlement),
          walletId,
          source:           'tiktok_income',
          createdBy:        session.username,
        })
        ledgerInserts.push({
          walletId,
          trxDate:  releasedDate,
          trxType:  'PAYOUT',
          category: ledgerCat,
          amount:   Math.round(settlement),
          refOrderNo: orderNo,
          note:     `Payout TikTok - ${orderNo}`,
          createdBy: session.username,
        })
        normalCount++
        totalMasuk += settlement
      }
    }

    // Batch insert for this chunk
    if (payoutInserts.length > 0 || ledgerInserts.length > 0) {
      const ops = []
      if (payoutInserts.length > 0)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ops.push(prisma.payout.createMany({ data: payoutInserts as any[] }))
      if (ledgerInserts.length > 0)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ops.push(prisma.walletLedger.createMany({ data: ledgerInserts as any[] }))
      await prisma.$transaction(ops)
    }
  }

  return apiSuccess({
    platform,
    periodeFrom,
    periodeTo,
    normal:              normalCount,
    retur:               returCount,
    bebanOngkir:         bebanCount,
    duplikat:            duplikatCount,
    totalMasuk:          Math.round(totalMasuk),
    totalBeban:          Math.round(totalBeban),
    detailBebanOngkir:   detailBeban,
    detailDuplikat,
  }, 201)
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
