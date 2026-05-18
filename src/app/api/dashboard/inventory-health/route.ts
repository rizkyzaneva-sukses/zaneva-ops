import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

/**
 * GET /api/dashboard/inventory-health
 *
 * Health metrics:
 *   - totalValue (Σ SOH × HPP) untuk produk aktif (SOH > 0)
 *   - activeSku, skuWithStock
 *   - turnover proxy = COGS 90 hari / avg inventory value
 *   - DSI (Days Sales of Inventory) = 90 / turnover
 *   - deadStock: SOH > 0 tapi 0 sales 60+ hari (top 10 by money tied up)
 *   - slowMover: sales < 5 dlm 30 hari & SOH > 30 (top 10)
 *   - lowStock: SOH ≤ rop & rop > 0 (top 10)
 */
export async function GET(_req: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole))
    return apiError('Forbidden', 403)

  const since60 = new Date()
  since60.setDate(since60.getDate() - 60)
  const since30 = new Date()
  since30.setDate(since30.getDate() - 30)
  const since90 = new Date()
  since90.setDate(since90.getDate() - 90)

  const [summary, deadStock, slowMover, lowStock, cogs90] = await Promise.all([
    // Summary inv value
    prisma.$queryRaw<
      { total_value: bigint; active_sku: bigint; sku_with_stock: bigint; sku_zero: bigint; sku_minus: bigint }[]
    >`
      SELECT
        COALESCE(SUM(GREATEST(soh, 0) * hpp), 0)::bigint AS total_value,
        COUNT(*)::bigint AS active_sku,
        SUM(CASE WHEN soh > 0 THEN 1 ELSE 0 END)::bigint AS sku_with_stock,
        SUM(CASE WHEN soh = 0 THEN 1 ELSE 0 END)::bigint AS sku_zero,
        SUM(CASE WHEN soh < 0 THEN 1 ELSE 0 END)::bigint AS sku_minus
      FROM (
        SELECT p.sku, p.hpp,
          p.stok_awal
          + COALESCE(SUM(CASE WHEN l.direction = 'IN'  AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN l.direction = 'OUT' AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
          AS soh
        FROM master_products p
        LEFT JOIN inventory_ledger l ON l.sku = p.sku
        WHERE p.is_active = true
        GROUP BY p.sku, p.hpp, p.stok_awal, p.last_opname_date
      ) soh_calc
    `,

    // Dead stock (SOH > 0 & 0 sales 60+ hari)
    prisma.$queryRaw<
      { sku: string; nama: string | null; soh: number; hpp: number; tied_up: bigint; last_sale: Date | null }[]
    >`
      WITH soh_calc AS (
        SELECT p.sku, p.nama_produk AS nama, p.hpp,
          (p.stok_awal
            + COALESCE(SUM(CASE WHEN l.direction = 'IN'  AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
            - COALESCE(SUM(CASE WHEN l.direction = 'OUT' AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
          )::int AS soh
        FROM master_products p
        LEFT JOIN inventory_ledger l ON l.sku = p.sku
        WHERE p.is_active = true
        GROUP BY p.sku, p.nama_produk, p.hpp, p.stok_awal, p.last_opname_date
      ),
      last_sale_per_sku AS (
        SELECT sku, MAX(trx_date) AS last_sale
        FROM orders
        WHERE status NOT ILIKE '%batal%'
          AND status NOT ILIKE '%cancel%'
          AND status NOT ILIKE '%dibatalkan%'
        GROUP BY sku
      )
      SELECT s.sku, s.nama, s.soh, s.hpp,
        (s.soh * s.hpp)::bigint AS tied_up,
        ls.last_sale
      FROM soh_calc s
      LEFT JOIN last_sale_per_sku ls ON ls.sku = s.sku
      WHERE s.soh > 0
        AND (ls.last_sale IS NULL OR ls.last_sale < ${since60})
      ORDER BY tied_up DESC
      LIMIT 10
    `,

    // Slow mover: sales <5 dlm 30 hari & SOH > 30
    prisma.$queryRaw<
      { sku: string; nama: string | null; soh: number; hpp: number; sales_30d: bigint; tied_up: bigint }[]
    >`
      WITH soh_calc AS (
        SELECT p.sku, p.nama_produk AS nama, p.hpp,
          (p.stok_awal
            + COALESCE(SUM(CASE WHEN l.direction = 'IN'  AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
            - COALESCE(SUM(CASE WHEN l.direction = 'OUT' AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
          )::int AS soh
        FROM master_products p
        LEFT JOIN inventory_ledger l ON l.sku = p.sku
        WHERE p.is_active = true
        GROUP BY p.sku, p.nama_produk, p.hpp, p.stok_awal, p.last_opname_date
      ),
      sales30 AS (
        SELECT sku, COALESCE(SUM(qty), 0)::bigint AS sales_30d
        FROM orders
        WHERE status NOT ILIKE '%batal%'
          AND status NOT ILIKE '%cancel%'
          AND status NOT ILIKE '%dibatalkan%'
          AND trx_date >= ${since30}
        GROUP BY sku
      )
      SELECT s.sku, s.nama, s.soh, s.hpp,
        COALESCE(s30.sales_30d, 0)::bigint AS sales_30d,
        (s.soh * s.hpp)::bigint AS tied_up
      FROM soh_calc s
      LEFT JOIN sales30 s30 ON s30.sku = s.sku
      WHERE s.soh > 30 AND COALESCE(s30.sales_30d, 0) < 5
      ORDER BY tied_up DESC
      LIMIT 10
    `,

    // Low stock (under reorder point)
    prisma.$queryRaw<
      { sku: string; nama: string | null; soh: number; rop: number; hpp: number }[]
    >`
      WITH soh_calc AS (
        SELECT p.sku, p.nama_produk AS nama, p.hpp, p.rop,
          (p.stok_awal
            + COALESCE(SUM(CASE WHEN l.direction = 'IN'  AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
            - COALESCE(SUM(CASE WHEN l.direction = 'OUT' AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
          )::int AS soh
        FROM master_products p
        LEFT JOIN inventory_ledger l ON l.sku = p.sku
        WHERE p.is_active = true
        GROUP BY p.sku, p.nama_produk, p.hpp, p.rop, p.stok_awal, p.last_opname_date
      )
      SELECT sku, nama, soh, rop, hpp
      FROM soh_calc
      WHERE rop > 0 AND soh <= rop
      ORDER BY (soh - rop) ASC, rop DESC
      LIMIT 10
    `,

    // COGS 90 hari (utk turnover)
    prisma.$queryRaw<{ total: bigint }[]>`
      SELECT COALESCE(SUM(hpp * qty), 0)::bigint AS total
      FROM orders
      WHERE trx_date >= ${since90}
        AND status NOT ILIKE '%batal%'
        AND status NOT ILIKE '%cancel%'
        AND status NOT ILIKE '%dibatalkan%'
    `,
  ])

  const sumRow = summary[0]
  const totalValue = Number(sumRow?.total_value ?? 0)
  const cogs90Total = Number(cogs90[0]?.total ?? 0)
  // Annualized turnover = (cogs 90 hari × 4) / avg inventory.
  // Asumsikan avg inventory ≈ totalValue (snapshot saat ini), karena tidak ada
  // historical snapshot. Approximate.
  const turnover = totalValue > 0 ? (cogs90Total * (365 / 90)) / totalValue : 0
  const dsi = turnover > 0 ? Math.round(365 / turnover) : null

  return apiSuccess({
    summary: {
      totalValue,
      activeSku: Number(sumRow?.active_sku ?? 0),
      skuWithStock: Number(sumRow?.sku_with_stock ?? 0),
      skuZero: Number(sumRow?.sku_zero ?? 0),
      skuMinus: Number(sumRow?.sku_minus ?? 0),
      turnover: Number(turnover.toFixed(2)),
      dsi,
      cogs90: cogs90Total,
    },
    deadStock: deadStock.map((r: typeof deadStock[number]) => ({
      sku: r.sku,
      nama: r.nama ?? r.sku,
      soh: Number(r.soh),
      hpp: Number(r.hpp),
      tiedUp: Number(r.tied_up),
      lastSale: r.last_sale,
    })),
    slowMover: slowMover.map((r: typeof slowMover[number]) => ({
      sku: r.sku,
      nama: r.nama ?? r.sku,
      soh: Number(r.soh),
      hpp: Number(r.hpp),
      sales30d: Number(r.sales_30d),
      tiedUp: Number(r.tied_up),
    })),
    lowStock: lowStock.map((r: typeof lowStock[number]) => ({
      sku: r.sku,
      nama: r.nama ?? r.sku,
      soh: Number(r.soh),
      rop: Number(r.rop),
      hpp: Number(r.hpp),
    })),
  })
}
