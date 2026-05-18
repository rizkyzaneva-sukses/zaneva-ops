import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

/**
 * GET /api/dashboard/ar-ap
 *
 * Aging analysis untuk piutang & utang:
 *   buckets: 0-7 hari, 8-30, 31-60, >60 (berdasarkan due_date)
 *   plus: top 5 outstanding masing-masing
 *
 * "Tenor" = umur dari today vs due_date.
 *  Jika due_date belum lewat → bucket 0-7 (atau "current" kalau >7 hari ke depan
 *  untuk simplicity dimasukkan ke 0-7).
 *  Jika due_date NULL → masuk "no_due_date" bucket terpisah.
 */
export async function GET(_req: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole))
    return apiError('Forbidden', 403)

  const [piutangBuckets, utangBuckets, topPiutang, topUtang] = await Promise.all([
    prisma.$queryRaw<{ bucket: string; cnt: bigint; total: bigint }[]>`
      SELECT
        CASE
          WHEN due_date IS NULL THEN 'no_due'
          WHEN (NOW()::date - due_date::date) <= 7  THEN 'b_0_7'
          WHEN (NOW()::date - due_date::date) <= 30 THEN 'b_8_30'
          WHEN (NOW()::date - due_date::date) <= 60 THEN 'b_31_60'
          ELSE 'b_60_plus'
        END AS bucket,
        COUNT(*)::bigint AS cnt,
        COALESCE(SUM(amount - amount_collected), 0)::bigint AS total
      FROM piutangs
      WHERE status IN ('OUTSTANDING', 'PARTIAL')
      GROUP BY bucket
    `,
    prisma.$queryRaw<{ bucket: string; cnt: bigint; total: bigint }[]>`
      SELECT
        CASE
          WHEN due_date IS NULL THEN 'no_due'
          WHEN (NOW()::date - due_date::date) <= 7  THEN 'b_0_7'
          WHEN (NOW()::date - due_date::date) <= 30 THEN 'b_8_30'
          WHEN (NOW()::date - due_date::date) <= 60 THEN 'b_31_60'
          ELSE 'b_60_plus'
        END AS bucket,
        COUNT(*)::bigint AS cnt,
        COALESCE(SUM(amount - amount_paid), 0)::bigint AS total
      FROM utangs
      WHERE status IN ('OUTSTANDING', 'PARTIAL')
      GROUP BY bucket
    `,
    prisma.$queryRaw<
      {
        id: string
        debtor_name: string
        outstanding: bigint
        due_date: Date | null
        trx_date: Date
        days_outstanding: number | null
      }[]
    >`
      SELECT
        id,
        debtor_name,
        (amount - amount_collected)::bigint AS outstanding,
        due_date,
        trx_date,
        CASE WHEN due_date IS NOT NULL THEN (NOW()::date - due_date::date) ELSE NULL END AS days_outstanding
      FROM piutangs
      WHERE status IN ('OUTSTANDING', 'PARTIAL')
      ORDER BY outstanding DESC
      LIMIT 5
    `,
    prisma.$queryRaw<
      {
        id: string
        creditor_name: string
        outstanding: bigint
        due_date: Date | null
        trx_date: Date
        days_to_due: number | null
      }[]
    >`
      SELECT
        id,
        creditor_name,
        (amount - amount_paid)::bigint AS outstanding,
        due_date,
        trx_date,
        CASE WHEN due_date IS NOT NULL THEN (due_date::date - NOW()::date) ELSE NULL END AS days_to_due
      FROM utangs
      WHERE status IN ('OUTSTANDING', 'PARTIAL')
      ORDER BY outstanding DESC
      LIMIT 5
    `,
  ])

  type BucketRow = { bucket: string; cnt: bigint; total: bigint }
  const toBucketObj = (rows: BucketRow[]) => {
    const empty = { count: 0, total: 0 }
    const map: Record<string, { count: number; total: number }> = {
      b_0_7: { ...empty },
      b_8_30: { ...empty },
      b_31_60: { ...empty },
      b_60_plus: { ...empty },
      no_due: { ...empty },
    }
    for (const r of rows) {
      map[r.bucket] = { count: Number(r.cnt), total: Number(r.total) }
    }
    return [
      { key: 'b_0_7', label: '≤ 7 hari', ...map.b_0_7 },
      { key: 'b_8_30', label: '8-30 hari', ...map.b_8_30 },
      { key: 'b_31_60', label: '31-60 hari', ...map.b_31_60 },
      { key: 'b_60_plus', label: '> 60 hari', ...map.b_60_plus },
      { key: 'no_due', label: 'Tanpa due date', ...map.no_due },
    ]
  }

  return apiSuccess({
    piutang: {
      buckets: toBucketObj(piutangBuckets),
      top: topPiutang.map((r: typeof topPiutang[number]) => ({
        id: r.id,
        name: r.debtor_name,
        outstanding: Number(r.outstanding),
        dueDate: r.due_date,
        trxDate: r.trx_date,
        daysOutstanding: r.days_outstanding === null ? null : Number(r.days_outstanding),
      })),
    },
    utang: {
      buckets: toBucketObj(utangBuckets),
      top: topUtang.map((r: typeof topUtang[number]) => ({
        id: r.id,
        name: r.creditor_name,
        outstanding: Number(r.outstanding),
        dueDate: r.due_date,
        trxDate: r.trx_date,
        daysToDue: r.days_to_due === null ? null : Number(r.days_to_due),
      })),
    },
  })
}
