import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/report/daily?date=YYYY-MM-DD
 * Endpoint khusus untuk n8n → Telegram.
 * Dilindungi API key di header: Authorization: Bearer <REPORT_API_KEY>
 * Default: hari ini WIB (laporan jam 17:30 untuk data hari berjalan)
 *
 * PENTING: Menggunakan pattern EXACT sama dengan /api/dashboard/stats
 * - trx_date (bukan COALESCE) untuk filter
 * - Date objects langsung (sama persis)
 */
export async function GET(request: NextRequest) {
  // ── Auth via API Key (tidak pakai session, untuk n8n) ──
  const apiKey = process.env.REPORT_API_KEY
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '').trim()
  if (!apiKey || token !== apiKey) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  // ── Tanggal target ──
  const { searchParams } = request.nextUrl
  const dateParam = searchParams.get('date') // YYYY-MM-DD

  // Determine dateFrom (target date string YYYY-MM-DD)
  let dateFrom: string
  if (dateParam) {
    dateFrom = dateParam
  } else {
    // Default: hari ini WIB
    const nowWIB = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))
    const y = nowWIB.getFullYear()
    const m = String(nowWIB.getMonth() + 1).padStart(2, '0')
    const d = String(nowWIB.getDate()).padStart(2, '0')
    dateFrom = `${y}-${m}-${d}`
  }

  // EXACT same date construction as dashboard/stats
  const gteDate = new Date(dateFrom + 'T00:00:00+07:00')
  const lteDate = new Date(dateFrom + 'T23:59:59+07:00')

  // Hari sebelumnya untuk perbandingan
  const prevDay = new Date(gteDate)
  prevDay.setDate(prevDay.getDate() - 1)
  const prevY = prevDay.getFullYear()
  const prevM = String(prevDay.getMonth() + 1).padStart(2, '0')
  const prevD = String(prevDay.getDate()).padStart(2, '0')
  const prevFrom = `${prevY}-${prevM}-${prevD}`
  const prevGte = new Date(prevFrom + 'T00:00:00+07:00')
  const prevLte = new Date(prevFrom + 'T23:59:59+07:00')

  try {
    const [todayOrders, prevOrders, stokKritis, aging, topPlatform] = await Promise.all([

      // Order hari target — EXACT same pattern as dashboard: trx_date (not COALESCE)
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

      // Order hari sebelumnya (untuk perbandingan) — same pattern
      prisma.$queryRaw<{ cnt: bigint; total_omzet: bigint }[]>`
        SELECT COUNT(*) AS cnt, COALESCE(SUM(real_omzet), 0) AS total_omzet
        FROM orders
        WHERE trx_date >= ${prevGte} AND trx_date <= ${prevLte}
          AND status NOT ILIKE '%batal%'
          AND status NOT ILIKE '%cancel%'
          AND status NOT ILIKE '%dibatalkan%'
      `,

      // Stok kritis (all-time) — same as dashboard
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

      // Aging backlog — same as dashboard (uses created_at, no date filter)
      prisma.$queryRaw<{ bucket: string; cnt: bigint }[]>`
        SELECT
          CASE
            WHEN EXTRACT(EPOCH FROM (NOW() - created_at))/3600 <= 12 THEN '0-12 Jam'
            WHEN EXTRACT(EPOCH FROM (NOW() - created_at))/3600 <= 24 THEN '12-24 Jam'
            WHEN EXTRACT(EPOCH FROM (NOW() - created_at))/3600 <= 48 THEN '24-48 Jam'
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

      // Per platform hari ini — EXACT same as dashboard omzetByPlatform
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

    const omzet = (statsMap['terkirim']?.omzet ?? 0) + (statsMap['perlu_dikirim']?.omzet ?? 0)
    const hpp = (statsMap['terkirim']?.hpp ?? 0) + (statsMap['perlu_dikirim']?.hpp ?? 0)
    const gp = omzet - hpp
    const margin = omzet > 0 ? ((gp / omzet) * 100).toFixed(1) : '0'

    const terkirim = statsMap['terkirim']?.count ?? 0
    const perluKirim = statsMap['perlu_dikirim']?.count ?? 0
    const batal = statsMap['batal']?.count ?? 0
    const totalOrder = terkirim + perluKirim + batal

    const prevOmzet = Number((prevOrders as any[])[0]?.total_omzet ?? 0)
    const prevCount = Number((prevOrders as any[])[0]?.cnt ?? 0)
    const omzetDiff = omzet - prevOmzet
    const countDiff = totalOrder - prevCount

    const agingMap = Object.fromEntries((aging as any[]).map((r: any) => [r.bucket, Number(r.cnt)]))

    const platforms = (topPlatform as any[]).map(p => ({
      platform: p.platform,
      count: Number(p.cnt),
      omzet: Number(p.total_omzet),
      hpp: Number(p.total_hpp),
      gp: Number(p.total_omzet) - Number(p.total_hpp),
    }))

    return NextResponse.json({
      success: true,
      data: {
        date: dateFrom,
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
          detail: agingMap,
        },
      },
      _debug: {
        dateFrom,
        gteDate: gteDate.toISOString(),
        lteDate: lteDate.toISOString(),
        todayOrderRows: (todayOrders as any[]).length,
        prevOrderRows: (prevOrders as any[]).length,
        platformRows: (topPlatform as any[]).length,
        agingRows: (aging as any[]).length,
      },
    })
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message || 'Unknown error',
      stack: err.stack?.split('\n').slice(0, 5),
      _debug: {
        dateFrom,
        gteDate: gteDate.toISOString(),
        lteDate: lteDate.toISOString(),
      },
    }, { status: 500 })
  }
}
