import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiSuccess, apiError } from '@/lib/utils'

/**
 * GET /api/report/daily?date=YYYY-MM-DD
 * Endpoint khusus untuk n8n → Telegram.
 * Dilindungi API key di header: Authorization: Bearer <REPORT_API_KEY>
 * Default: hari ini WIB (laporan jam 17:30 untuk data hari berjalan)
 *
 * FIX: Menggunakan EXACT same query pattern seperti /api/dashboard/stats
 */
export async function GET(request: NextRequest) {
  // ── Auth via API Key (tidak pakai session, untuk n8n) ──
  const apiKey = process.env.REPORT_API_KEY
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '').trim()
  if (!apiKey || token !== apiKey) {
    return apiError('Unauthorized', 401)
  }

  // ── Tanggal target ──
  const { searchParams } = request.nextUrl
  const dateParam = searchParams.get('date') // YYYY-MM-DD

  // Hitung tanggal WIB
  let dateFrom: string
  let dateTo: string
  if (dateParam) {
    dateFrom = dateParam
    dateTo = dateParam
  } else {
    // Hari ini WIB — sama persis dengan cara dashboard menghitung
    const now = new Date()
    const wibDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now) // format: YYYY-MM-DD
    dateFrom = wibDate
    dateTo = wibDate
  }

  // EXACT same date construction as /api/dashboard/stats
  const gteDate = new Date(dateFrom + 'T00:00:00+07:00')
  const lteDate = new Date(dateTo + 'T23:59:59+07:00')

  // Hari sebelumnya untuk perbandingan
  const prevDay = new Date(gteDate)
  prevDay.setDate(prevDay.getDate() - 1)
  const prevFrom = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(prevDay)
  const prevGteDate = new Date(prevFrom + 'T00:00:00+07:00')
  const prevLteDate = new Date(prevFrom + 'T23:59:59+07:00')

  try {
    const [todayOrders, prevOrders, stokKritis, aging, topPlatform] = await Promise.all([

      // EXACT same query as dashboard/stats orderStats
      prisma.$queryRaw<{
        group_key: string; cnt: bigint; total_omzet: bigint; total_hpp: bigint
      }[]>`
        SELECT
          CASE
            WHEN status LIKE 'TERKIRIM%' THEN 'terkirim'
            WHEN status ILIKE '%batal%' OR status ILIKE '%cancel%' OR status ILIKE '%dibatalkan%' THEN 'batal'
            ELSE 'perlu_dikirim'
          END AS group_key,
          COUNT(*) AS cnt,
          COALESCE(SUM(real_omzet), 0) AS total_omzet,
          COALESCE(SUM(hpp * qty), 0) AS total_hpp
        FROM orders
        WHERE trx_date >= ${gteDate} AND trx_date <= ${lteDate}
        GROUP BY group_key
      `,

      // Order hari sebelumnya (untuk perbandingan)
      prisma.$queryRaw<{ cnt: bigint; total_omzet: bigint }[]>`
        SELECT COUNT(*) AS cnt, COALESCE(SUM(real_omzet), 0) AS total_omzet
        FROM orders
        WHERE trx_date >= ${prevGteDate} AND trx_date <= ${prevLteDate}
          AND status NOT ILIKE '%batal%'
          AND status NOT ILIKE '%cancel%'
          AND status NOT ILIKE '%dibatalkan%'
      `,

      // Stok kritis (all-time)
      prisma.$queryRaw<{ cnt: bigint }[]>`
        SELECT COUNT(*) AS cnt
        FROM (
          SELECT p.sku,
            p.stok_awal
            + COALESCE(SUM(CASE WHEN l.direction = 'IN' AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
            - COALESCE(SUM(CASE WHEN l.direction = 'OUT' AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
            AS soh, p.rop
          FROM master_products p
          LEFT JOIN inventory_ledger l ON l.sku = p.sku
          WHERE p.is_active = true
          GROUP BY p.sku, p.stok_awal, p.rop, p.last_opname_date
        ) x WHERE soh <= rop
      `,

      // Aging backlog — order pending yang belum terkirim/batal
      prisma.$queryRaw<{ bucket: string; cnt: bigint }[]>`
        SELECT
          CASE
            WHEN EXTRACT(EPOCH FROM (NOW() - COALESCE(trx_date, created_at)))/3600 <= 12 THEN '0-12 Jam'
            WHEN EXTRACT(EPOCH FROM (NOW() - COALESCE(trx_date, created_at)))/3600 <= 24 THEN '12-24 Jam'
            WHEN EXTRACT(EPOCH FROM (NOW() - COALESCE(trx_date, created_at)))/3600 <= 48 THEN '24-48 Jam'
            ELSE '>48 Jam'
          END AS bucket,
          COUNT(*) AS cnt
        FROM orders
        WHERE status NOT LIKE 'TERKIRIM%'
          AND status NOT ILIKE '%batal%'
          AND status NOT ILIKE '%cancel%'
          AND status NOT ILIKE '%dibatalkan%'
        GROUP BY bucket
      `,

      // EXACT same query as dashboard/stats omzetByPlatform
      prisma.$queryRaw<{ platform: string; cnt: bigint; total_omzet: bigint; total_hpp: bigint }[]>`
        SELECT
          COALESCE(platform, 'Unknown') AS platform,
          COUNT(*) AS cnt,
          COALESCE(SUM(real_omzet), 0) AS total_omzet,
          COALESCE(SUM(hpp * qty), 0) AS total_hpp
        FROM orders
        WHERE trx_date >= ${gteDate} AND trx_date <= ${lteDate}
          AND status NOT ILIKE '%batal%'
          AND status NOT ILIKE '%cancel%'
          AND status NOT ILIKE '%dibatalkan%'
        GROUP BY platform
        ORDER BY total_omzet DESC
      `,
    ])

    // ── Format data ──
    const statsMap = Object.fromEntries(
      (todayOrders as any[]).map((r: any) => [
        r.group_key,
        { count: Number(r.cnt), omzet: Number(r.total_omzet), hpp: Number(r.total_hpp) }
      ])
    )

    const omzet  = (statsMap['terkirim']?.omzet ?? 0) + (statsMap['perlu_dikirim']?.omzet ?? 0)
    const hpp    = (statsMap['terkirim']?.hpp ?? 0) + (statsMap['perlu_dikirim']?.hpp ?? 0)
    const gp     = omzet - hpp
    const margin = omzet > 0 ? ((gp / omzet) * 100).toFixed(1) : '0'

    const terkirim    = statsMap['terkirim']?.count ?? 0
    const perluKirim  = statsMap['perlu_dikirim']?.count ?? 0
    const batal       = statsMap['batal']?.count ?? 0
    const totalOrder  = terkirim + perluKirim + batal

    const prevOmzet  = Number((prevOrders as any[])[0]?.total_omzet ?? 0)
    const prevCount  = Number((prevOrders as any[])[0]?.cnt ?? 0)
    const omzetDiff  = omzet - prevOmzet
    const countDiff  = (terkirim + perluKirim) - prevCount

    const agingMap = Object.fromEntries((aging as any[]).map((r: any) => [r.bucket, Number(r.cnt)]))
    const agingOver48 = agingMap['>48 Jam'] ?? 0

    const platforms = (topPlatform as any[]).map((p: any) => ({
      platform: p.platform,
      count: Number(p.cnt),
      omzet: Number(p.total_omzet),
      hpp: Number(p.total_hpp),
      gp: Number(p.total_omzet) - Number(p.total_hpp),
    }))

    return apiSuccess({
      date: dateFrom,
      _debug: {
        dateFrom,
        dateTo,
        gteDate: gteDate.toISOString(),
        lteDate: lteDate.toISOString(),
        todayOrdersRows: (todayOrders as any[]).length,
        platformRows: (topPlatform as any[]).length,
        statsMap,
      },
      summary: {
        omzet,
        hpp,
        grossProfit: gp,
        grossMargin: margin,
        totalOrder,
        terkirim,
        perluKirim,
        batal,
      },
      comparison: {
        prevOmzet,
        prevOrderCount: prevCount,
        omzetDiff,
        omzetDiffPct: prevOmzet > 0 ? ((omzetDiff / prevOmzet) * 100).toFixed(1) : null,
        orderCountDiff: countDiff,
      },
      platforms,
      stokKritis: Number((stokKritis as any[])[0]?.cnt ?? 0),
      aging: {
        total: (Object.values(agingMap) as number[]).reduce((s, v) => s + v, 0),
        over48: agingOver48,
        detail: agingMap,
      },
    })
  } catch (error: any) {
    // Return error details for debugging
    return apiSuccess({
      date: dateFrom,
      _error: error.message || String(error),
      summary: { omzet: 0, hpp: 0, grossProfit: 0, grossMargin: '0', totalOrder: 0, terkirim: 0, perluKirim: 0, batal: 0 },
      comparison: { prevOmzet: 0, prevOrderCount: 0, omzetDiff: 0, omzetDiffPct: null, orderCountDiff: 0 },
      platforms: [],
      stokKritis: 0,
      aging: { total: 0, over48: 0, detail: {} },
    })
  }
}
