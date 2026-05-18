import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  try {
    const since = new Date()
    since.setDate(since.getDate() - 13)
    since.setHours(0, 0, 0, 0)

    const orderRows = await prisma.$queryRaw<
      { day: string; omzet: bigint; hpp: bigint; cnt: bigint }[]
    >`
      SELECT
        TO_CHAR(trx_date AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD') AS day,
        COALESCE(SUM(real_omzet), 0)::bigint AS omzet,
        COALESCE(SUM(hpp * qty), 0)::bigint AS hpp,
        COUNT(*)::bigint AS cnt
      FROM orders
      WHERE trx_date >= ${since}
        AND status NOT ILIKE '%batal%'
        AND status NOT ILIKE '%cancel%'
        AND status NOT ILIKE '%dibatalkan%'
      GROUP BY day
      ORDER BY day ASC
    `
    console.log('Orders:', orderRows)
  } catch (err) {
    console.error('Order query error:', err)
  }

  try {
    const since = new Date()
    since.setDate(since.getDate() - 13)
    since.setHours(0, 0, 0, 0)

    const adsRows = await prisma.$queryRaw<{ day: string; total: bigint }[]>`
      SELECT
        TO_CHAR(l.trx_date AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD') AS day,
        COALESCE(SUM(ABS(l.amount)), 0)::bigint AS total
      FROM wallet_ledger l
      JOIN wallets w ON w.id = l.wallet_id
      WHERE w.is_ads_budget = true
        AND l.trx_type = 'EXPENSE'
        AND l.trx_date >= ${since}
      GROUP BY day
      ORDER BY day ASC
    `
    console.log('Ads:', adsRows)
  } catch (err) {
    console.error('Ads query error:', err)
  }

  await prisma.$disconnect()
}

main()
