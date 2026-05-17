/**
 * db-helpers.ts
 * Utility untuk bulk insert tanpa batas baris.
 * Semua upload (orders, payout, scan, opname) pakai ini.
 */

import { prisma } from './prisma'

/**
 * Insert data dalam chunk — tidak ada batas baris.
 * Default 500 rows per chunk agar tidak timeout.
 */
export async function chunkedCreateMany<T extends object>(
  model: any,
  data: T[],
  chunkSize = 500
): Promise<number> {
  if (data.length === 0) return 0
  let total = 0
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize)
    const result = await model.createMany({ data: chunk, skipDuplicates: false })
    total += result.count
  }
  return total
}

/**
 * Upsert dalam chunk — untuk data yang mungkin sudah ada.
 * Gunakan untuk payout (skip duplicate by orderNo).
 */
export async function chunkedUpsert<T extends { orderNo?: string }>(
  data: T[],
  existingKeys: Set<string>,
  keyFn: (item: T) => string,
  chunkSize = 500
): Promise<{ inserted: number; skipped: number }> {
  const toInsert = data.filter(item => !existingKeys.has(keyFn(item)))
  const skipped = data.length - toInsert.length

  if (toInsert.length === 0) return { inserted: 0, skipped }

  let inserted = 0
  for (let i = 0; i < toInsert.length; i += chunkSize) {
    const chunk = toInsert.slice(i, i + chunkSize)
    const result = await prisma.order.createMany({ data: chunk as any })
    inserted += result.count
  }

  return { inserted, skipped }
}

/**
 * Format timestamp ke WIB (Asia/Jakarta)
 */
export function toJakartaTime(date: Date = new Date()): string {
  return date.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

/**
 * Format jam WIB untuk display
 */
export function formatJakartaDatetime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }) + ' WIB'
}
