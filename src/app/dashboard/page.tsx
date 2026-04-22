'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useAuth, usePermission } from '@/components/providers'
import { useQuery } from '@tanstack/react-query'
import { formatRupiah, formatDate } from '@/lib/utils'
import { useState } from 'react'
import {
  TrendingUp, Package, ShoppingCart, AlertTriangle,
  Wallet, Clock, ArrowUpRight, RefreshCw, Calendar
} from 'lucide-react'

// ── Date helpers ───────────────────────────────────────
function getDefaultRange() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
  return {
    from: firstDay.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
  }
}

// ── Stat card ──────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, color = 'emerald' }: {
  label: string; value: string; sub?: string
  icon: React.ElementType; color?: string
}) {
  const colors: Record<string, string> = {
    emerald: 'text-emerald-400 bg-emerald-900/20 border-emerald-800/40',
    yellow:  'text-yellow-400 bg-yellow-900/20 border-yellow-800/40',
    red:     'text-red-400 bg-red-900/20 border-red-800/40',
    blue:    'text-blue-400 bg-blue-900/20 border-blue-800/40',
    purple:  'text-purple-400 bg-purple-900/20 border-purple-800/40',
  }
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-zinc-500 text-xs mb-1">{label}</p>
          <p className="text-xl font-bold text-white truncate">{value}</p>
          {sub && <p className="text-zinc-600 text-[10px] mt-0.5">{sub}</p>}
        </div>
        <div className={`p-2 rounded-lg border shrink-0 ${colors[color]}`}>
          <Icon size={16} />
        </div>
      </div>
    </div>
  )
}

// ── Aging backlog visual ───────────────────────────────
function AgingBars({ aging }: { aging: { label: string; count: number }[] }) {
  const max = Math.max(...aging.map(a => a.count), 1)
  const colors = ['bg-emerald-500', 'bg-yellow-500', 'bg-orange-500', 'bg-red-500']
  return (
    <div className="space-y-2">
      {aging.map((a, i) => (
        <div key={a.label} className="flex items-center gap-3">
          <span className="text-xs text-zinc-500 w-16 shrink-0">{a.label}</span>
          <div className="flex-1 bg-zinc-800 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${colors[i]}`}
              style={{ width: `${(a.count / max) * 100}%` }}
            />
          </div>
          <span className={`text-sm font-bold w-8 text-right ${
            i === 3 ? 'text-red-400' : i === 2 ? 'text-orange-400' : 'text-zinc-300'
          }`}>{a.count}</span>
        </div>
      ))}
    </div>
  )
}

// ── Platform omzet breakdown ───────────────────────────
function PlatformBreakdown({ data, showGp = true }: { data: any[]; showGp?: boolean }) {
  if (!data?.length) return <p className="text-zinc-600 text-sm">Belum ada data</p>
  const total = data.reduce((s, p) => s + p.realOmzet, 0)
  return (
    <div className="space-y-2.5">
      {data.map((p: any) => (
        <div key={p.platform}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                p.platform === 'TikTok' ? 'bg-pink-900/40 text-pink-400' :
                p.platform === 'Shopee' ? 'bg-orange-900/40 text-orange-400' :
                'bg-zinc-800 text-zinc-400'
              }`}>{p.platform}</span>
              <span className="text-xs text-zinc-500">{p.count} order</span>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium text-white">{formatRupiah(p.realOmzet, true)}</p>
              {showGp && (
                <p className="text-[10px] text-emerald-600">
                  GP: {formatRupiah(p.grossProfit, true)}
                </p>
              )}
            </div>
          </div>
          <div className="bg-zinc-800 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full ${
                p.platform === 'TikTok' ? 'bg-pink-500' :
                p.platform === 'Shopee' ? 'bg-orange-500' : 'bg-emerald-500'
              }`}
              style={{ width: total > 0 ? `${(p.realOmzet / total) * 100}%` : '0%' }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main Dashboard ─────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuth()
  const { canEdit } = usePermission()
  const isStaffOnly = user?.userRole === 'STAFF'
  const defaultRange = getDefaultRange()
  const [dateFrom, setDateFrom] = useState(defaultRange.from)
  const [dateTo, setDateTo] = useState(defaultRange.to)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['dashboard-stats', dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams({ dateFrom, dateTo })
      const res = await fetch(`/api/dashboard/stats?${params}`)
      return res.json().then(d => d.data)
    },
    staleTime: 60_000, // 1 menit cache
  })

  const totalAgingBacklog = data?.aging?.reduce((s: number, a: any) => s + a.count, 0) ?? 0

  // Quick range presets
  const setRange = (preset: string) => {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))
    const today = now.toISOString().slice(0, 10)
    if (preset === 'today') {
      setDateFrom(today); setDateTo(today)
    } else if (preset === 'week') {
      const mon = new Date(now); mon.setDate(now.getDate() - now.getDay() + 1)
      setDateFrom(mon.toISOString().slice(0, 10)); setDateTo(today)
    } else if (preset === 'month') {
      setDateFrom(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10))
      setDateTo(today)
    } else if (preset === 'lastmonth') {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const last  = new Date(now.getFullYear(), now.getMonth(), 0)
      setDateFrom(first.toISOString().slice(0, 10)); setDateTo(last.toISOString().slice(0, 10))
    }
  }

  return (
    <AppLayout>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="text-zinc-500 text-sm mt-0.5">
            Selamat datang, {user?.fullName || user?.username}
          </p>
        </div>
        <button onClick={() => refetch()} className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors">
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Date range filter */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 mb-6 flex flex-wrap items-center gap-3">
        <Calendar size={14} className="text-zinc-500 shrink-0" />
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
          />
          <span className="text-zinc-600 text-xs">s/d</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
          />
        </div>
        <div className="flex gap-1">
          {[
            { key: 'today', label: 'Hari ini' },
            { key: 'week', label: 'Minggu ini' },
            { key: 'month', label: 'Bulan ini' },
            { key: 'lastmonth', label: 'Bulan lalu' },
          ].map(p => (
            <button
              key={p.key}
              onClick={() => setRange(p.key)}
              className="px-2.5 py-1 rounded-lg text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors border border-zinc-700"
            >
              {p.label}
            </button>
          ))}
        </div>
        {isLoading && <span className="text-[10px] text-zinc-600 animate-pulse">Memuat...</span>}
      </div>

      {/* KPI cards row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Real Omzet"
          value={formatRupiah(data?.omzet?.total ?? 0, true)}
          sub={`${data?.orders?.terkirim ?? 0} order terkirim`}
          icon={TrendingUp}
          color="emerald"
        />
        <StatCard
          label="Perlu Dikirim"
          value={String(totalAgingBacklog)}
          sub="order pending kirim"
          icon={Clock}
          color="yellow"
        />
        {!isStaffOnly ? (
          <StatCard
            label="Gross Profit"
            value={formatRupiah((data?.omzet?.total ?? 0) - (data?.omzet?.totalHpp ?? 0), true)}
            sub="omzet - HPP"
            icon={ArrowUpRight}
            color="blue"
          />
        ) : (
          <StatCard
            label="Total Order"
            value={String((data?.orders?.terkirim ?? 0) + totalAgingBacklog)}
            sub="terkirim + pending"
            icon={ShoppingCart}
            color="blue"
          />
        )}
        <StatCard
          label="Stok Kritis"
          value={String(data?.stock?.lowStockCount ?? 0)}
          sub="produk perlu restock"
          icon={AlertTriangle}
          color="red"
        />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">

        {/* Aging backlog */}
        <div className="stat-card lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-medium text-zinc-300">Aging Backlog</p>
              <p className="text-xs text-zinc-600 mt-0.5">{totalAgingBacklog} order belum dikirim</p>
            </div>
            <span className={`text-xs font-bold px-2 py-1 rounded-lg ${
              totalAgingBacklog > 50 ? 'bg-red-900/30 text-red-400' :
              totalAgingBacklog > 20 ? 'bg-yellow-900/30 text-yellow-400' :
              'bg-emerald-900/30 text-emerald-400'
            }`}>{totalAgingBacklog} order</span>
          </div>
          {isLoading ? (
            <div className="space-y-2">
              {[1,2,3,4].map(i => <div key={i} className="h-6 bg-zinc-800 rounded animate-pulse" />)}
            </div>
          ) : (
            <AgingBars aging={data?.aging ?? []} />
          )}
        </div>

        {/* Wallet */}
        {canEdit && (
          <div className="stat-card">
            <p className="text-sm font-medium text-zinc-300 mb-1 flex items-center gap-1.5">
              <Wallet size={13} /> Saldo Wallet
            </p>
            <p className="text-xl font-bold text-emerald-400 mb-3">
              {formatRupiah(data?.wallet?.totalSaldo ?? 0, true)}
            </p>
            <div className="space-y-1.5">
              {isLoading ? (
                [1,2,3].map(i => <div key={i} className="h-4 bg-zinc-800 rounded animate-pulse" />)
              ) : (
                (data?.wallet?.wallets ?? []).map((w: any) => (
                  <div key={w.id} className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500 truncate flex-1 mr-2">{w.name}</span>
                    <span className={`text-xs font-medium ${w.balance >= 0 ? 'text-white' : 'text-red-400'}`}>
                      {formatRupiah(w.balance, true)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Second row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">

        {/* Omzet per platform */}
        <div className="stat-card">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-medium text-zinc-300">Omzet per Platform</p>
            <p className="text-xs text-zinc-600">{dateFrom} – {dateTo}</p>
          </div>
          {isLoading ? (
            <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-8 bg-zinc-800 rounded animate-pulse" />)}</div>
          ) : (
            <PlatformBreakdown data={data?.omzet?.byPlatform ?? []} showGp={!isStaffOnly} />
          )}
          {!isStaffOnly && (
            <div className="mt-3 pt-3 border-t border-zinc-800 flex justify-between">
              <span className="text-xs text-zinc-500">Total GP</span>
              <span className="text-xs font-bold text-emerald-400">
                {formatRupiah((data?.omzet?.total ?? 0) - (data?.omzet?.totalHpp ?? 0), true)}
              </span>
            </div>
          )}
        </div>

        {/* Top provinsi + Payout summary */}
        <div className="space-y-4">
          {canEdit && (
            <div className="stat-card">
              <p className="text-sm font-medium text-zinc-300 mb-3">Payout (dalam range)</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-zinc-500">Jumlah Order</p>
                  <p className="text-lg font-bold text-white">{data?.payout?.count ?? 0}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Total Cair</p>
                  <p className="text-lg font-bold text-emerald-400">
                    {formatRupiah(data?.payout?.totalIncome ?? 0, true)}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="stat-card">
            <p className="text-sm font-medium text-zinc-300 mb-3">Top Provinsi</p>
            {isLoading ? (
              <div className="space-y-1">{[1,2,3,4,5].map(i => <div key={i} className="h-4 bg-zinc-800 rounded animate-pulse" />)}</div>
            ) : (data?.geo?.topProvinces ?? []).length === 0 ? (
              <p className="text-xs text-zinc-600">Belum ada data</p>
            ) : (
              <div className="space-y-1.5">
                {(data?.geo?.topProvinces ?? []).map((p: any, i: number) => (
                  <div key={p.province} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-zinc-700 w-4">{i + 1}</span>
                      <span className="text-xs text-zinc-400 truncate">{p.province}</span>
                    </div>
                    <span className="text-xs font-medium text-zinc-300">{p.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
