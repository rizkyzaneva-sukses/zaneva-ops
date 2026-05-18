import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'
import {
  ymWIB,
  monthRangeWIB,
  getMonthlyTarget,
  monthPacing,
} from '@/lib/dashboard-helpers'

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'

interface AlertItem {
  id: string
  severity: Severity
  category:
    | 'finance'
    | 'inventory'
    | 'orders'
    | 'ads'
    | 'target'
    | 'cashflow'
  title: string
  detail: string
  href?: string
  count?: number
  amount?: number
}

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
}

/**
 * GET /api/dashboard/action-center
 *
 * Agregasi alert kritikal:
 * - Stok minus & habis
 * - Piutang overdue >30 hari
 * - Utang & PO jatuh tempo dalam 7 hari
 * - Order pending >48 jam
 * - Cancel rate spike (vs avg 30 hari)
 * - ROAS drop signifikan vs bulan lalu
 * - Pacing target MTD (omzet & net profit)
 *
 * Response: { items: AlertItem[], summary }
 */
export async function GET(_req: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const items: AlertItem[] = []

  // ── Periode untuk MTD ──
  const ym = ymWIB()
  const { start: monthStart, today, daysInMonth } = monthRangeWIB(ym)
  const lteToday = new Date(`${today.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })}T23:59:59+07:00`)
  const { dayIndex, pacingPct } = monthPacing(ym)

  // Bulan lalu untuk komparasi ROAS / cancel rate
  const prevYm = (() => {
    const [y, m] = ym.split('-').map(Number)
    const py = m === 1 ? y - 1 : y
    const pm = m === 1 ? 12 : m - 1
    return `${py}-${String(pm).padStart(2, '0')}`
  })()
  const { start: prevStart, end: prevEnd } = monthRangeWIB(prevYm)

  const next7 = new Date()
  next7.setDate(next7.getDate() + 7)

  const last30 = new Date()
  last30.setDate(last30.getDate() - 30)

  const [
    stockMinus,
    stockEmpty,
    piutangOverdue,
    utangDueSoon,
    poDueSoon,
    orderOverdue48,
    mtdOrderStats,
    last30CancelStats,
    mtdAds,
    prevMonthStats,
    prevMonthAds,
    targetRow,
  ] = await Promise.all([
    // Stok minus
    prisma.$queryRaw<{ cnt: bigint }[]>`
      SELECT COUNT(*)::bigint AS cnt FROM (
        SELECT p.sku,
          p.stok_awal
          + COALESCE(SUM(CASE WHEN l.direction = 'IN'  AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN l.direction = 'OUT' AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
          AS soh
        FROM master_products p
        LEFT JOIN inventory_ledger l ON l.sku = p.sku
        WHERE p.is_active = true
        GROUP BY p.sku, p.stok_awal, p.last_opname_date
      ) x WHERE soh < 0
    `,

    // Stok habis (=0)
    prisma.$queryRaw<{ cnt: bigint }[]>`
      SELECT COUNT(*)::bigint AS cnt FROM (
        SELECT p.sku,
          p.stok_awal
          + COALESCE(SUM(CASE WHEN l.direction = 'IN'  AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN l.direction = 'OUT' AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
          AS soh
        FROM master_products p
        LEFT JOIN inventory_ledger l ON l.sku = p.sku
        WHERE p.is_active = true
        GROUP BY p.sku, p.stok_awal, p.last_opname_date
      ) x WHERE soh = 0
    `,

    // Piutang overdue >30 hari
    prisma.$queryRaw<{ cnt: bigint; total: bigint }[]>`
      SELECT COUNT(*)::bigint AS cnt, COALESCE(SUM(amount - amount_collected), 0)::bigint AS total
      FROM piutangs
      WHERE status IN ('OUTSTANDING', 'PARTIAL')
        AND due_date IS NOT NULL
        AND due_date < (NOW() - INTERVAL '30 days')
    `,

    // Utang jatuh tempo 7 hari ke depan (atau sudah lewat)
    prisma.$queryRaw<{ cnt: bigint; total: bigint }[]>`
      SELECT COUNT(*)::bigint AS cnt, COALESCE(SUM(amount - amount_paid), 0)::bigint AS total
      FROM utangs
      WHERE status IN ('OUTSTANDING', 'PARTIAL')
        AND due_date IS NOT NULL
        AND due_date <= ${next7}
    `,

    // PO unpaid jatuh tempo 7 hari (pakai expected_date sbg proxy karena PO tidak punya due_date)
    prisma.$queryRaw<{ cnt: bigint; total: bigint }[]>`
      SELECT COUNT(*)::bigint AS cnt, COALESCE(SUM(total_amount - total_paid), 0)::bigint AS total
      FROM purchase_orders
      WHERE payment_status IN ('UNPAID', 'PARTIAL_PAID')
        AND expected_date IS NOT NULL
        AND expected_date <= ${next7}
    `,

    // Order pending >48 jam
    prisma.$queryRaw<{ cnt: bigint }[]>`
      SELECT COUNT(*)::bigint AS cnt
      FROM orders
      WHERE status NOT LIKE 'TERKIRIM%'
        AND status NOT ILIKE '%batal%'
        AND status NOT ILIKE '%cancel%'
        AND status NOT ILIKE '%dibatalkan%'
        AND created_at < (NOW() - INTERVAL '48 hours')
    `,

    // MTD order stats
    prisma.$queryRaw<{ grp: string; cnt: bigint; omzet: bigint; hpp: bigint }[]>`
      SELECT
        CASE WHEN status ILIKE '%batal%' OR status ILIKE '%cancel%' OR status ILIKE '%dibatalkan%' THEN 'batal' ELSE 'valid' END AS grp,
        COUNT(*)::bigint AS cnt,
        COALESCE(SUM(real_omzet), 0)::bigint AS omzet,
        COALESCE(SUM(hpp * qty), 0)::bigint AS hpp
      FROM orders
      WHERE trx_date >= ${monthStart} AND trx_date <= ${lteToday}
      GROUP BY grp
    `,

    // Cancel rate avg 30 hari
    prisma.$queryRaw<{ valid: bigint; batal: bigint }[]>`
      SELECT
        COALESCE(SUM(CASE WHEN status NOT ILIKE '%batal%' AND status NOT ILIKE '%cancel%' AND status NOT ILIKE '%dibatalkan%' THEN 1 ELSE 0 END), 0)::bigint AS valid,
        COALESCE(SUM(CASE WHEN status ILIKE '%batal%' OR status ILIKE '%cancel%' OR status ILIKE '%dibatalkan%' THEN 1 ELSE 0 END), 0)::bigint AS batal
      FROM orders
      WHERE trx_date >= ${last30}
    `,

    // MTD ads spend
    prisma.$queryRaw<{ total: bigint }[]>`
      SELECT COALESCE(SUM(ABS(l.amount)), 0)::bigint AS total
      FROM wallet_ledger l
      JOIN wallets w ON w.id = l.wallet_id
      WHERE w.is_ads_budget = true
        AND l.trx_type = 'EXPENSE'
        AND l.trx_date >= ${monthStart} AND l.trx_date <= ${lteToday}
    `,

    // Bulan lalu order stats
    prisma.$queryRaw<{ omzet: bigint; hpp: bigint }[]>`
      SELECT
        COALESCE(SUM(real_omzet), 0)::bigint AS omzet,
        COALESCE(SUM(hpp * qty), 0)::bigint AS hpp
      FROM orders
      WHERE trx_date >= ${prevStart} AND trx_date <= ${prevEnd}
        AND status NOT ILIKE '%batal%'
        AND status NOT ILIKE '%cancel%'
        AND status NOT ILIKE '%dibatalkan%'
    `,

    // Bulan lalu ads spend
    prisma.$queryRaw<{ total: bigint }[]>`
      SELECT COALESCE(SUM(ABS(l.amount)), 0)::bigint AS total
      FROM wallet_ledger l
      JOIN wallets w ON w.id = l.wallet_id
      WHERE w.is_ads_budget = true
        AND l.trx_type = 'EXPENSE'
        AND l.trx_date >= ${prevStart} AND l.trx_date <= ${prevEnd}
    `,

    getMonthlyTarget(ym),
  ])

  // ── Helper push ──
  const push = (a: AlertItem) => items.push(a)

  // 1. Stok minus
  const minusCount = Number((stockMinus as any[])[0]?.cnt ?? 0)
  if (minusCount > 0) {
    push({
      id: 'stock-minus',
      severity: 'critical',
      category: 'inventory',
      title: `${minusCount} produk stok minus`,
      detail: 'Selisih opname / pencatatan keluar lebih dari masuk. Perlu opname ulang.',
      count: minusCount,
      href: '/inventory',
    })
  }

  // 2. Stok habis
  const emptyCount = Number((stockEmpty as any[])[0]?.cnt ?? 0)
  if (emptyCount > 0) {
    push({
      id: 'stock-empty',
      severity: emptyCount > 10 ? 'high' : 'medium',
      category: 'inventory',
      title: `${emptyCount} SKU stok habis`,
      detail: 'Produk aktif dengan SOH = 0. Risiko hilang penjualan.',
      count: emptyCount,
      href: '/inventory',
    })
  }

  // 3. Piutang overdue >30 hari
  const piutangCnt = Number((piutangOverdue as any[])[0]?.cnt ?? 0)
  const piutangAmt = Number((piutangOverdue as any[])[0]?.total ?? 0)
  if (piutangCnt > 0) {
    push({
      id: 'piutang-overdue-30',
      severity: 'high',
      category: 'finance',
      title: `${piutangCnt} piutang overdue >30 hari`,
      detail: 'Tagihan tertahan, modal kerja tidak mengalir.',
      count: piutangCnt,
      amount: piutangAmt,
      href: '/utang-piutang',
    })
  }

  // 4. Utang jatuh tempo 7 hari
  const utangCnt = Number((utangDueSoon as any[])[0]?.cnt ?? 0)
  const utangAmt = Number((utangDueSoon as any[])[0]?.total ?? 0)
  if (utangCnt > 0) {
    push({
      id: 'utang-due-7',
      severity: utangCnt > 3 ? 'high' : 'medium',
      category: 'finance',
      title: `${utangCnt} utang jatuh tempo ≤7 hari`,
      detail: 'Siapkan kas untuk pelunasan agar tidak telat.',
      count: utangCnt,
      amount: utangAmt,
      href: '/utang-piutang',
    })
  }

  // 5. PO/vendor jatuh tempo 7 hari
  const poCnt = Number((poDueSoon as any[])[0]?.cnt ?? 0)
  const poAmt = Number((poDueSoon as any[])[0]?.total ?? 0)
  if (poCnt > 0) {
    push({
      id: 'po-due-7',
      severity: poCnt > 5 ? 'high' : 'medium',
      category: 'finance',
      title: `${poCnt} PO vendor butuh dibayar`,
      detail: 'Expected date dalam 7 hari, payment_status masih unpaid/partial.',
      count: poCnt,
      amount: poAmt,
      href: '/procurement',
    })
  }

  // 6. Order pending >48 jam
  const orderOverdueCnt = Number((orderOverdue48 as any[])[0]?.cnt ?? 0)
  if (orderOverdueCnt > 0) {
    push({
      id: 'order-overdue-48',
      severity: orderOverdueCnt > 20 ? 'high' : 'medium',
      category: 'orders',
      title: `${orderOverdueCnt} order pending >48 jam`,
      detail: 'Belum dikirim, risiko cancel & komplain pembeli.',
      count: orderOverdueCnt,
      href: '/orders',
    })
  }

  // 7. Cancel rate spike vs avg 30 hari
  const mtdMap = Object.fromEntries(
    (mtdOrderStats as any[]).map((r: any) => [r.grp, { cnt: Number(r.cnt), omzet: Number(r.omzet), hpp: Number(r.hpp) }])
  )
  const mtdValid = mtdMap['valid']?.cnt ?? 0
  const mtdBatal = mtdMap['batal']?.cnt ?? 0
  const mtdTotal = mtdValid + mtdBatal
  const mtdCancelRate = mtdTotal > 0 ? (mtdBatal / mtdTotal) * 100 : 0
  const last30Valid = Number((last30CancelStats as any[])[0]?.valid ?? 0)
  const last30Batal = Number((last30CancelStats as any[])[0]?.batal ?? 0)
  const last30Total = last30Valid + last30Batal
  const last30CancelRate = last30Total > 0 ? (last30Batal / last30Total) * 100 : 0
  if (mtdTotal >= 20 && mtdCancelRate > Math.max(last30CancelRate * 1.3, last30CancelRate + 3)) {
    push({
      id: 'cancel-rate-spike',
      severity: 'medium',
      category: 'orders',
      title: `Cancel rate naik ke ${mtdCancelRate.toFixed(1)}%`,
      detail: `Avg 30 hari ${last30CancelRate.toFixed(1)}%. Audit batch terbaru.`,
      href: '/orders',
    })
  }

  // 8. ROAS drop vs bulan lalu (jika ada ads di kedua periode)
  const mtdOmzet = mtdMap['valid']?.omzet ?? 0
  const mtdAdsSpend = Number((mtdAds as any[])[0]?.total ?? 0)
  const prevOmzet = Number((prevMonthStats as any[])[0]?.omzet ?? 0)
  const prevAdsSpend = Number((prevMonthAds as any[])[0]?.total ?? 0)
  if (mtdAdsSpend > 0 && prevAdsSpend > 0 && prevOmzet > 0) {
    const mtdRoas = mtdOmzet / mtdAdsSpend
    const prevRoas = prevOmzet / prevAdsSpend
    const drop = prevRoas > 0 ? ((prevRoas - mtdRoas) / prevRoas) * 100 : 0
    if (drop >= 25 && mtdAdsSpend > 1_000_000) {
      push({
        id: 'roas-drop',
        severity: drop >= 40 ? 'high' : 'medium',
        category: 'ads',
        title: `MER turun ${drop.toFixed(0)}% (${mtdRoas.toFixed(1)}x)`,
        detail: `Bulan lalu ${prevRoas.toFixed(1)}x. Review iklan & creative.`,
        href: '/finance',
      })
    }
  }

  // 9. Pacing target omzet & net profit (jika target ada)
  const mtdHpp = mtdMap['valid']?.hpp ?? 0
  // Hitung net MTD (perkiraan: omzet - hpp - ads - opex)
  const mtdOpExRows = await prisma.$queryRaw<{ total: bigint }[]>`
    SELECT COALESCE(SUM(ABS(l.amount)), 0)::bigint AS total
    FROM wallet_ledger l
    JOIN wallets w ON w.id = l.wallet_id
    WHERE l.trx_type = 'EXPENSE'
      AND COALESCE(w.is_ads_budget, false) = false
      AND l.trx_date >= ${monthStart} AND l.trx_date <= ${lteToday}
  `
  const mtdOpEx = Number((mtdOpExRows as any[])[0]?.total ?? 0)
  const mtdNet = mtdOmzet - mtdHpp - mtdAdsSpend - mtdOpEx

  if (targetRow.omzet && targetRow.omzet > 0) {
    const expected = (targetRow.omzet * pacingPct) / 100
    const ach = (mtdOmzet / targetRow.omzet) * 100
    if (mtdOmzet < expected * 0.85) {
      const lag = expected - mtdOmzet
      push({
        id: 'target-omzet-lag',
        severity: ach < 50 ? 'high' : 'medium',
        category: 'target',
        title: `Omzet MTD baru ${ach.toFixed(0)}% target`,
        detail: `Pacing hari ke-${dayIndex}/${daysInMonth}. Tertinggal ~Rp ${formatShort(lag)}.`,
      })
    } else if (ach >= 100) {
      push({
        id: 'target-omzet-hit',
        severity: 'info',
        category: 'target',
        title: `🎯 Target omzet bulan ini tercapai (${ach.toFixed(0)}%)`,
        detail: 'Lanjut overshoot, pertahankan momentum.',
      })
    }
  } else {
    push({
      id: 'target-not-set',
      severity: 'low',
      category: 'target',
      title: 'Target bulan ini belum di-set',
      detail: 'Set target omzet & net profit untuk monitor pacing.',
      href: '/dashboard',
    })
  }

  if (targetRow.netProfit && targetRow.netProfit > 0) {
    const ach = (mtdNet / targetRow.netProfit) * 100
    if (mtdNet < 0) {
      push({
        id: 'net-profit-negative',
        severity: 'critical',
        category: 'target',
        title: `Net profit MTD negatif: Rp ${formatShort(mtdNet)}`,
        detail: 'Biaya melebihi GP. Cek ads spend & OpEx.',
      })
    } else {
      const expected = (targetRow.netProfit * pacingPct) / 100
      if (mtdNet < expected * 0.7) {
        push({
          id: 'target-net-lag',
          severity: 'medium',
          category: 'target',
          title: `Net profit baru ${ach.toFixed(0)}% target`,
          detail: `Tertinggal dari pacing. Optimasi margin & biaya.`,
        })
      }
    }
  }

  // ── Sort by severity, lalu by amount/count desc ──
  items.sort((a, b) => {
    const r = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    if (r !== 0) return r
    return (b.amount ?? b.count ?? 0) - (a.amount ?? a.count ?? 0)
  })

  // Limit ke 10 alert top supaya panel tidak overload
  const top = items.slice(0, 10)

  return apiSuccess({
    items: top,
    summary: {
      total: items.length,
      critical: items.filter((i) => i.severity === 'critical').length,
      high: items.filter((i) => i.severity === 'high').length,
      medium: items.filter((i) => i.severity === 'medium').length,
      low: items.filter((i) => i.severity === 'low').length,
      info: items.filter((i) => i.severity === 'info').length,
    },
  })
}

function formatShort(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + ' M'
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' jt'
  if (abs >= 1000) return (n / 1000).toFixed(0) + ' rb'
  return Math.round(n).toString()
}
