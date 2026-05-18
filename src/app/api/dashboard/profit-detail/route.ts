import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

/**
 * GET /api/dashboard/profit-detail?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD
 *
 * Return:
 *  - topProducts: Top 10 produk by gross profit (omzet × margin)
 *  - lowMarginProducts: 5 produk margin negatif/terendah (qty>=3 supaya tidak noise)
 *  - marginTrend: Daily margin% selama range
 */
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole))
    return apiError('Forbidden', 403)

  const { searchParams } = request.nextUrl
  const dateFrom = searchParams.get('dateFrom')
  const dateTo = searchParams.get('dateTo')
  if (!dateFrom || !dateTo) return apiError('dateFrom & dateTo wajib (YYYY-MM-DD)')

  const gte = new Date(`${dateFrom}T00:00:00+07:00`)
  const lte = new Date(`${dateTo}T23:59:59+07:00`)

  const [topProducts, lowMarginProducts, marginTrend] = await Promise.all([
    // Top 10 by gross profit
    prisma.$queryRaw<
      {
        sku: string
        nama: string | null
        qty: bigint
        omzet: bigint
        hpp_total: bigint
        gp: bigint
        margin_pct: number
      }[]
    >`
      SELECT
        o.sku,
        MAX(p.nama_produk) AS nama,
        SUM(o.qty)::bigint AS qty,
        SUM(o.real_omzet)::bigint AS omzet,
        SUM(o.hpp * o.qty)::bigint AS hpp_total,
        (SUM(o.real_omzet) - SUM(o.hpp * o.qty))::bigint AS gp,
        CASE WHEN SUM(o.real_omzet) > 0
          THEN ROUND((((SUM(o.real_omzet) - SUM(o.hpp * o.qty))::float8) / SUM(o.real_omzet)::float8) * 100, 2)
          ELSE 0
        END AS margin_pct
      FROM orders o
      LEFT JOIN master_products p ON p.sku = o.sku
      WHERE o.trx_date >= ${gte} AND o.trx_date <= ${lte}
        AND o.status NOT ILIKE '%batal%'
        AND o.status NOT ILIKE '%cancel%'
        AND o.status NOT ILIKE '%dibatalkan%'
        AND o.sku IS NOT NULL AND o.sku != ''
      GROUP BY o.sku
      HAVING SUM(o.real_omzet) > 0
      ORDER BY gp DESC
      LIMIT 10
    `,
    // Lowest margin (incl. negative) — minimal 3 qty supaya tidak fluke
    prisma.$queryRaw<
      {
        sku: string
        nama: string | null
        qty: bigint
        omzet: bigint
        hpp_total: bigint
        gp: bigint
        margin_pct: number
      }[]
    >`
      SELECT
        o.sku,
        MAX(p.nama_produk) AS nama,
        SUM(o.qty)::bigint AS qty,
        SUM(o.real_omzet)::bigint AS omzet,
        SUM(o.hpp * o.qty)::bigint AS hpp_total,
        (SUM(o.real_omzet) - SUM(o.hpp * o.qty))::bigint AS gp,
        CASE WHEN SUM(o.real_omzet) > 0
          THEN ROUND((((SUM(o.real_omzet) - SUM(o.hpp * o.qty))::float8) / SUM(o.real_omzet)::float8) * 100, 2)
          ELSE 0
        END AS margin_pct
      FROM orders o
      LEFT JOIN master_products p ON p.sku = o.sku
      WHERE o.trx_date >= ${gte} AND o.trx_date <= ${lte}
        AND o.status NOT ILIKE '%batal%'
        AND o.status NOT ILIKE '%cancel%'
        AND o.status NOT ILIKE '%dibatalkan%'
        AND o.sku IS NOT NULL AND o.sku != ''
      GROUP BY o.sku
      HAVING SUM(o.qty) >= 3 AND SUM(o.real_omzet) > 0
      ORDER BY margin_pct ASC
      LIMIT 5
    `,
    // Daily margin trend
    prisma.$queryRaw<
      { day: string; omzet: bigint; hpp: bigint; margin_pct: number }[]
    >`
      SELECT
        TO_CHAR(trx_date AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD') AS day,
        SUM(real_omzet)::bigint AS omzet,
        SUM(hpp * qty)::bigint AS hpp,
        CASE WHEN SUM(real_omzet) > 0
          THEN ROUND((((SUM(real_omzet) - SUM(hpp * qty))::float8) / SUM(real_omzet)::float8) * 100, 2)
          ELSE 0
        END AS margin_pct
      FROM orders
      WHERE trx_date >= ${gte} AND trx_date <= ${lte}
        AND status NOT ILIKE '%batal%'
        AND status NOT ILIKE '%cancel%'
        AND status NOT ILIKE '%dibatalkan%'
      GROUP BY day
      ORDER BY day ASC
    `,
  ])

  type ProductRow = {
    sku: string
    nama: string | null
    qty: bigint
    omzet: bigint
    hpp_total: bigint
    gp: bigint
    margin_pct: number
  }

  const mapProduct = (rows: ProductRow[]) =>
    rows.map((r) => ({
      sku: r.sku,
      nama: r.nama ?? r.sku,
      qty: Number(r.qty),
      omzet: Number(r.omzet),
      hpp: Number(r.hpp_total),
      gp: Number(r.gp),
      marginPct: Number(r.margin_pct),
    }))

  return apiSuccess({
    topProducts: mapProduct(topProducts),
    lowMarginProducts: mapProduct(lowMarginProducts),
    marginTrend: marginTrend.map((r: { day: string; omzet: bigint; hpp: bigint; margin_pct: number }) => ({
      day: r.day,
      omzet: Number(r.omzet),
      hpp: Number(r.hpp),
      marginPct: Number(r.margin_pct),
    })),
  })
}
