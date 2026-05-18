/**
 * Helper bersama untuk endpoint-endpoint dashboard.
 * - Hitung target bulanan (dari AppSetting)
 * - Hitung modal kerja: kas, inventory value, piutang, utang
 * - Hitung burn rate (avg 90 hari)
 */

import { prisma } from '@/lib/prisma'

export const TARGET_KEY_PREFIX = 'target.'

/** Format YYYY-MM dari Date di zona WIB. */
export function ymWIB(date: Date = new Date()): string {
  const wib = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))
  const y = wib.getFullYear()
  const m = String(wib.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/** Tanggal awal & akhir bulan (WIB) untuk YYYY-MM tertentu. */
export function monthRangeWIB(ym: string): { start: Date; end: Date; daysInMonth: number; today: Date } {
  const [y, m] = ym.split('-').map(Number)
  const start = new Date(`${ym}-01T00:00:00+07:00`)
  // last day of month
  const lastDay = new Date(y, m, 0).getDate()
  const end = new Date(`${ym}-${String(lastDay).padStart(2, '0')}T23:59:59+07:00`)
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))
  return { start, end, daysInMonth: lastDay, today }
}

export interface MonthlyTargets {
  ym: string
  omzet: number | null
  netProfit: number | null
}

/** Ambil target untuk satu bulan dari AppSetting. */
export async function getMonthlyTarget(ym: string): Promise<MonthlyTargets> {
  const keys = [`${TARGET_KEY_PREFIX}${ym}.omzet`, `${TARGET_KEY_PREFIX}${ym}.netProfit`]
  const rows = await prisma.appSetting.findMany({ where: { key: { in: keys } } })
  const map = Object.fromEntries(rows.map((r: { key: string; value: string }) => [r.key, r.value]))
  const omzetStr = map[`${TARGET_KEY_PREFIX}${ym}.omzet`]
  const netStr = map[`${TARGET_KEY_PREFIX}${ym}.netProfit`]
  return {
    ym,
    omzet: omzetStr ? Number(omzetStr) : null,
    netProfit: netStr ? Number(netStr) : null,
  }
}

/**
 * Total saldo seluruh wallet aktif (snapshot).
 */
export async function getTotalCash(): Promise<number> {
  const rows = await prisma.$queryRaw<{ balance: bigint }[]>`
    SELECT COALESCE(SUM(l.amount), 0) AS balance
    FROM wallets w
    LEFT JOIN wallet_ledger l ON l.wallet_id = w.id
    WHERE w.is_active = true
  `
  return Number(rows[0]?.balance ?? 0)
}

/**
 * Total nilai inventory (SOH × HPP) untuk produk aktif.
 * Pakai SQL yang sama dgn /api/inventory.
 */
export async function getInventoryValue(): Promise<{ totalValue: number; activeSku: number }> {
  const rows = await prisma.$queryRaw<{ total_value: bigint; active_sku: bigint }[]>`
    SELECT
      COALESCE(SUM(GREATEST(soh, 0) * hpp), 0)::bigint AS total_value,
      COUNT(*)::bigint AS active_sku
    FROM (
      SELECT p.sku, p.hpp,
        p.stok_awal
        + COALESCE(SUM(CASE WHEN l.direction = 'IN' AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
        - COALESCE(SUM(CASE WHEN l.direction = 'OUT' AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
        AS soh
      FROM master_products p
      LEFT JOIN inventory_ledger l ON l.sku = p.sku
      WHERE p.is_active = true
      GROUP BY p.sku, p.hpp, p.stok_awal, p.last_opname_date
    ) soh_calc
  `
  return {
    totalValue: Number(rows[0]?.total_value ?? 0),
    activeSku: Number(rows[0]?.active_sku ?? 0),
  }
}

/**
 * Total outstanding piutang & utang.
 */
export async function getReceivablePayable(): Promise<{
  piutang: number
  utang: number
  vendorOutstanding: number
}> {
  const [piutangRow, utangRow, vendorRow] = await Promise.all([
    prisma.$queryRaw<{ total: bigint }[]>`
      SELECT COALESCE(SUM(amount - amount_collected), 0)::bigint AS total
      FROM piutangs WHERE status IN ('OUTSTANDING', 'PARTIAL')
    `,
    prisma.$queryRaw<{ total: bigint }[]>`
      SELECT COALESCE(SUM(amount - amount_paid), 0)::bigint AS total
      FROM utangs WHERE status IN ('OUTSTANDING', 'PARTIAL')
    `,
    prisma.$queryRaw<{ total: bigint }[]>`
      SELECT COALESCE(SUM(total_amount - total_paid), 0)::bigint AS total
      FROM purchase_orders
      WHERE status IN ('OPEN', 'PARTIAL', 'COMPLETED')
        AND payment_status IN ('UNPAID', 'PARTIAL_PAID')
    `,
  ])
  return {
    piutang: Number(piutangRow[0]?.total ?? 0),
    utang: Number(utangRow[0]?.total ?? 0),
    vendorOutstanding: Number(vendorRow[0]?.total ?? 0),
  }
}

/**
 * Burn rate rata-rata = total expense (ads + opex) selama N hari terakhir / N hari × 30.
 * Default N = 90 hari.
 */
export async function getBurnRate(days = 90): Promise<{
  avgMonthlyBurn: number
  avgDailyBurn: number
  totalSpend: number
  days: number
}> {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const rows = await prisma.$queryRaw<{ total: bigint }[]>`
    SELECT COALESCE(SUM(ABS(amount)), 0)::bigint AS total
    FROM wallet_ledger
    WHERE trx_type = 'EXPENSE'
      AND trx_date >= ${since}
  `
  const total = Number(rows[0]?.total ?? 0)
  const dailyBurn = total / days
  return {
    avgDailyBurn: Math.round(dailyBurn),
    avgMonthlyBurn: Math.round(dailyBurn * 30),
    totalSpend: total,
    days,
  }
}

/** Hitung pacing target: Berapa % dari hari di bulan ini yg sudah lewat. */
export function monthPacing(ym: string): { dayIndex: number; daysInMonth: number; pacingPct: number } {
  const { daysInMonth, today } = monthRangeWIB(ym)
  const [y, m] = ym.split('-').map(Number)
  const isCurrentMonth = today.getFullYear() === y && today.getMonth() + 1 === m
  const dayIndex = isCurrentMonth ? today.getDate() : daysInMonth
  const pacingPct = (dayIndex / daysInMonth) * 100
  return { dayIndex, daysInMonth, pacingPct }
}
