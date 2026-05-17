'use client'

import { useQuery } from '@tanstack/react-query'
import { formatRupiah, formatDate } from '@/lib/utils'
import {
  BarChart3, Package, Building2, TrendingUp, TrendingDown,
  Clock, CheckCircle2, AlertTriangle, Loader2, ShoppingCart
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────
interface POSummary {
  total: number
  open: number
  partial: number
  completed: number
  cancelled: number
  totalAmount: number
  totalPaid: number
  totalOutstanding: number
}

interface VendorSpend {
  vendorId: string
  vendorName: string
  totalOrders: number
  totalAmount: number
  totalPaid: number
}

interface POItem {
  id: string
  poNumber: string
  vendorName: string
  poDate: string
  expectedDate?: string
  status: string
  paymentStatus: string
  totalAmount: number
  totalPaid: number
  totalQtyOrder: number
  totalQtyReceived: number
}

// ─── Stat Card ─────────────────────────────────────────
function StatCard({
  label, value, sub, color = 'text-white', icon: Icon,
}: {
  label: string; value: string | number; sub?: string
  color?: string; icon?: React.ElementType
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-zinc-500 text-xs mb-1">{label}</p>
          <p className={`text-xl font-bold ${color}`}>{value}</p>
          {sub && <p className="text-zinc-600 text-[11px] mt-0.5">{sub}</p>}
        </div>
        {Icon && (
          <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
            <Icon size={16} className="text-zinc-500" />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Progress Bar ──────────────────────────────────────
function ProgressBar({ value, max, color = 'bg-emerald-500' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-zinc-500 w-8 text-right">{pct}%</span>
    </div>
  )
}

const STATUS_COLOR: Record<string, string> = {
  OPEN: 'badge-warning',
  PARTIAL: 'badge-info',
  COMPLETED: 'badge-success',
  CANCELLED: 'badge-danger',
}

const PAY_COLOR: Record<string, string> = {
  UNPAID: 'badge-danger',
  PARTIAL_PAID: 'badge-warning',
  PAID: 'badge-success',
}

// ─── Main Tab ─────────────────────────────────────────
export function MonitoringTab() {
  // Fetch all POs (up to 200 for aggregate)
  const { data: poData, isLoading: poLoading } = useQuery({
    queryKey: ['po-monitoring'],
    queryFn: () =>
      fetch('/api/purchase-orders?limit=200&page=1')
        .then(r => r.json())
        .then(d => d.data),
  })

  const { data: vendorData } = useQuery({
    queryKey: ['vendors-all'],
    queryFn: () =>
      fetch('/api/vendors?all=true')
        .then(r => r.json())
        .then(d => d.data ?? []),
  })

  const allPOs: POItem[] = poData?.purchaseOrders ?? []
  const totalPOs = poData?.total ?? 0

  // ── Aggregate stats ───────────────────────────────────
  const summary: POSummary = allPOs.reduce(
    (acc, po) => {
      acc.total++
      if (po.status === 'OPEN')      acc.open++
      if (po.status === 'PARTIAL')   acc.partial++
      if (po.status === 'COMPLETED') acc.completed++
      if (po.status === 'CANCELLED') acc.cancelled++
      acc.totalAmount      += po.totalAmount ?? 0
      acc.totalPaid        += po.totalPaid   ?? 0
      acc.totalOutstanding += (po.totalAmount ?? 0) - (po.totalPaid ?? 0)
      return acc
    },
    { total: 0, open: 0, partial: 0, completed: 0, cancelled: 0, totalAmount: 0, totalPaid: 0, totalOutstanding: 0 }
  )

  // ── Vendor spend breakdown ─────────────────────────────
  const vendorSpendMap: Record<string, VendorSpend> = {}
  for (const po of allPOs) {
    if (!po.vendorName) continue
    if (!vendorSpendMap[po.vendorName]) {
      vendorSpendMap[po.vendorName] = {
        vendorId: '',
        vendorName: po.vendorName,
        totalOrders: 0,
        totalAmount: 0,
        totalPaid: 0,
      }
    }
    vendorSpendMap[po.vendorName].totalOrders++
    vendorSpendMap[po.vendorName].totalAmount += po.totalAmount ?? 0
    vendorSpendMap[po.vendorName].totalPaid   += po.totalPaid   ?? 0
  }
  const vendorSpendList = Object.values(vendorSpendMap)
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, 8)

  // ── Overdue POs (past expectedDate, not completed) ────
  const today = new Date()
  const overduePOs = allPOs.filter(po =>
    po.expectedDate &&
    new Date(po.expectedDate) < today &&
    po.status !== 'COMPLETED' &&
    po.status !== 'CANCELLED'
  )

  // ── Recent open/partial POs ───────────────────────────
  const activePOs = allPOs
    .filter(po => po.status === 'OPEN' || po.status === 'PARTIAL')
    .slice(0, 10)

  if (poLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-emerald-500" />
        <span className="ml-3 text-zinc-500 text-sm">Memuat data monitoring...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* ── Summary Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total PO"
          value={totalPOs.toLocaleString('id')}
          sub={`${allPOs.length} dimuat`}
          color="text-white"
          icon={ShoppingCart}
        />
        <StatCard
          label="Total Nilai PO"
          value={formatRupiah(summary.totalAmount, true)}
          sub={`Terbayar ${formatRupiah(summary.totalPaid, true)}`}
          color="text-emerald-400"
          icon={TrendingUp}
        />
        <StatCard
          label="Outstanding (Belum Bayar)"
          value={formatRupiah(summary.totalOutstanding, true)}
          color="text-amber-400"
          icon={TrendingDown}
        />
        <StatCard
          label="PO Terlambat"
          value={overduePOs.length}
          sub="Melewati estimasi tiba"
          color={overduePOs.length > 0 ? 'text-red-400' : 'text-zinc-400'}
          icon={AlertTriangle}
        />
      </div>

      {/* ── Status Breakdown ── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <BarChart3 size={15} className="text-emerald-400" />
          Distribusi Status PO
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Open',      count: summary.open,      color: 'bg-amber-500',  badge: 'badge-warning' },
            { label: 'Partial',   count: summary.partial,   color: 'bg-blue-500',   badge: 'badge-info'    },
            { label: 'Completed', count: summary.completed, color: 'bg-emerald-500',badge: 'badge-success' },
            { label: 'Cancelled', count: summary.cancelled, color: 'bg-red-500',    badge: 'badge-danger'  },
          ].map(s => (
            <div key={s.label} className="bg-zinc-800/50 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <span className={s.badge}>{s.label}</span>
                <span className="text-lg font-bold text-white">{s.count}</span>
              </div>
              <ProgressBar value={s.count} max={summary.total} color={s.color} />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── Vendor Spend Breakdown ── */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Building2 size={15} className="text-emerald-400" />
            Spend per Vendor (Top 8)
          </h3>
          {vendorSpendList.length === 0 ? (
            <p className="text-zinc-600 text-sm text-center py-6">Belum ada data vendor</p>
          ) : (
            <div className="space-y-3">
              {vendorSpendList.map((v, i) => {
                const paidPct = v.totalAmount > 0 ? Math.round((v.totalPaid / v.totalAmount) * 100) : 0
                return (
                  <div key={v.vendorName}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] text-zinc-600 font-mono w-4 shrink-0">#{i+1}</span>
                        <span className="text-xs text-zinc-300 truncate">{v.vendorName}</span>
                        <span className="text-[10px] text-zinc-600 shrink-0">{v.totalOrders} PO</span>
                      </div>
                      <span className="text-xs font-medium text-white shrink-0 ml-2">
                        {formatRupiah(v.totalAmount, true)}
                      </span>
                    </div>
                    <ProgressBar value={v.totalPaid} max={v.totalAmount} color="bg-emerald-500" />
                    <p className="text-[10px] text-zinc-600 mt-0.5">
                      Terbayar {formatRupiah(v.totalPaid, true)} ({paidPct}%)
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Overdue POs ── */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Clock size={15} className="text-red-400" />
            PO Terlambat / Overdue
            {overduePOs.length > 0 && (
              <span className="ml-auto text-[10px] bg-red-900/40 text-red-400 border border-red-900/50 px-2 py-0.5 rounded-full">
                {overduePOs.length} PO
              </span>
            )}
          </h3>
          {overduePOs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 size={32} className="text-emerald-700 mb-2" />
              <p className="text-sm text-zinc-500">Tidak ada PO yang terlambat</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {overduePOs.map(po => {
                const daysLate = po.expectedDate
                  ? Math.floor((today.getTime() - new Date(po.expectedDate).getTime()) / (1000 * 60 * 60 * 24))
                  : 0
                return (
                  <div key={po.id} className="flex items-start justify-between bg-red-950/20 border border-red-900/30 rounded-lg px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs font-mono text-zinc-300">{po.poNumber}</p>
                      <p className="text-[11px] text-zinc-500 truncate">{po.vendorName}</p>
                      <p className="text-[10px] text-red-400 mt-0.5">
                        Estimasi: {formatDate(po.expectedDate!)} · {daysLate} hari terlambat
                      </p>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className="text-xs font-medium text-white">{formatRupiah(po.totalAmount, true)}</p>
                      <span className={`${STATUS_COLOR[po.status]} text-[10px]`}>{po.status}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Active POs Table ── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
          <Package size={14} className="text-emerald-400" />
          <h3 className="text-sm font-semibold text-white">PO Aktif (Open / Partial)</h3>
          <span className="ml-auto text-xs text-zinc-500">{activePOs.length} ditampilkan</span>
        </div>
        {activePOs.length === 0 ? (
          <div className="py-12 text-center text-zinc-600 text-sm">
            Tidak ada PO aktif
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>No. PO</th>
                  <th>Vendor</th>
                  <th className="w-24">Tgl PO</th>
                  <th className="w-24">Est. Tiba</th>
                  <th className="w-28 text-right">Total</th>
                  <th className="w-24">Progress Terima</th>
                  <th className="w-24">Status</th>
                  <th className="w-24">Pembayaran</th>
                </tr>
              </thead>
              <tbody>
                {activePOs.map(po => {
                  const receivePct = po.totalQtyOrder > 0
                    ? Math.round((po.totalQtyReceived / po.totalQtyOrder) * 100)
                    : 0
                  const isOverdue = po.expectedDate && new Date(po.expectedDate) < today
                  return (
                    <tr key={po.id}>
                      <td>
                        <span className="font-mono text-xs text-zinc-300">{po.poNumber}</span>
                      </td>
                      <td className="text-xs text-zinc-300">{po.vendorName}</td>
                      <td className="text-xs text-zinc-400">{formatDate(po.poDate)}</td>
                      <td>
                        {po.expectedDate ? (
                          <span className={`text-xs ${isOverdue ? 'text-red-400 font-medium' : 'text-zinc-400'}`}>
                            {formatDate(po.expectedDate)}
                            {isOverdue && ' ⚠'}
                          </span>
                        ) : (
                          <span className="text-zinc-600 text-xs">—</span>
                        )}
                      </td>
                      <td className="text-right text-xs text-zinc-300">{formatRupiah(po.totalAmount, true)}</td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden min-w-[40px]">
                            <div
                              className="h-full bg-emerald-500 transition-all"
                              style={{ width: `${receivePct}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-zinc-500 shrink-0">
                            {po.totalQtyReceived}/{po.totalQtyOrder}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={`${STATUS_COLOR[po.status] || 'badge-muted'}`}>
                          {po.status}
                        </span>
                      </td>
                      <td>
                        <span className={`${PAY_COLOR[po.paymentStatus] || 'badge-muted'} text-[10px]`}>
                          {po.paymentStatus}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
