'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useAuth, usePermission } from '@/components/providers'
import { useQuery } from '@tanstack/react-query'
import { formatRupiah } from '@/lib/utils'
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  TrendingUp, ShoppingCart, AlertTriangle,
  Wallet, Clock, ArrowUpRight, RefreshCw, Calendar, DollarSign,
  ArrowDownRight, Banknote, FileWarning, Target,
  Maximize2, Minimize2,
} from 'lucide-react'

// ── Section components ──────────────────────────────────
import { ActionCenter } from './_components/action-center'
import { HeroScoreboard } from './_components/hero-scoreboard'
import { KpiCard } from './_components/kpi-card'
import { TrendChart, OrderTrendChart } from './_components/charts'
import { ProfitabilitySection } from './_components/profitability-section'
import { CashflowSection } from './_components/cashflow-section'
import { ArApSection } from './_components/ar-ap-section'
import { InventoryHealthSection } from './_components/inventory-health-section'
import { OperationsSection } from './_components/operations-section'
import { SectionHeader } from './_components/section-header'

// ── Date helpers ───────────────────────────────────────
function getDefaultRange() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
  return {
    from: firstDay.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
  }
}

// ── View mode toggle ────────────────────────────────────
type ViewMode = 'full' | 'compact'
const VIEW_STORAGE_KEY = 'dash.viewMode'

function useViewMode(): [ViewMode, () => void] {
  const [mode, setMode] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'full'
    return (localStorage.getItem(VIEW_STORAGE_KEY) as ViewMode) || 'full'
  })
  const toggle = useCallback(() => {
    setMode((prev) => {
      const next = prev === 'full' ? 'compact' : 'full'
      localStorage.setItem(VIEW_STORAGE_KEY, next)
      return next
    })
  }, [])
  return [mode, toggle]
}

// ── Main Dashboard ─────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuth()
  const { canEdit } = usePermission()
  const isStaffOnly = user?.userRole === 'STAFF'
  const isOwnerOrFinance = canEdit // OWNER or FINANCE
  const defaultRange = getDefaultRange()
  const [dateFrom, setDateFrom] = useState(defaultRange.from)
  const [dateTo, setDateTo] = useState(defaultRange.to)
  const [viewMode, toggleViewMode] = useViewMode()
  const isCompact = viewMode === 'compact'

  // ── Main stats query (KPI + trend + operational) ──────
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard-stats', dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams({ dateFrom, dateTo })
      const res = await fetch(`/api/dashboard/stats?${params}`)
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Gagal memuat data dashboard')
      }
      return json.data
    },
    staleTime: 60_000,
    placeholderData: (prev: any) => prev,
    refetchOnWindowFocus: false,
    retry: 2,
  })

  // ── Sparklines query (14-day mini series for KPI cards) ──
  const { data: sparkData } = useQuery({
    queryKey: ['dashboard', 'sparklines'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard/sparklines', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok || !json.success) return null
      return json.data
    },
    staleTime: 120_000,
    refetchOnWindowFocus: false,
  })

  // ── Auto backfill HPP (once per session) ──────────────
  useEffect(() => {
    const SESS_KEY = 'hpp_backfill_done'
    if (sessionStorage.getItem(SESS_KEY)) return
    fetch('/api/orders/backfill-hpp', { method: 'POST' })
      .then(r => r.json())
      .then(json => {
        if (json?.data?.updated > 0) {
          sessionStorage.setItem(SESS_KEY, '1')
          refetch()
        } else {
          sessionStorage.setItem(SESS_KEY, '1')
        }
      })
      .catch(() => {})
  }, [refetch])

  // ── Quick range presets ────────────────────────────────
  const setRange = useCallback((preset: string) => {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))
    const today = now.toISOString().slice(0, 10)
    if (preset === 'today') {
      setDateFrom(today); setDateTo(today)
    } else if (preset === 'yesterday') {
      const yday = new Date(now); yday.setDate(yday.getDate() - 1)
      const y = yday.toISOString().slice(0, 10)
      setDateFrom(y); setDateTo(y)
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
  }, [])

  // ── Derived values ────────────────────────────────────
  const cancelRateDelta = data?.orders?.cancelRate !== undefined && data?.prev?.cancelRate !== undefined
    ? data.orders.cancelRate - data.prev.cancelRate
    : null

  const rangeLabel = `${dateFrom} – ${dateTo}`

  // Sparkline series helpers
  const spark = useMemo(() => {
    if (!sparkData?.series) return {}
    const s = sparkData.series as {
      omzet?: number[]
      gp?: number[]
      net?: number[]
      aov?: number[]
      orders?: number[]
      marginPct?: number[]
    }
    // API returns series as object of arrays, not array of objects
    return {
      omzet: Array.isArray(s.omzet) ? s.omzet : [],
      gp: Array.isArray(s.gp) ? s.gp : [],
      net: Array.isArray(s.net) ? s.net : [],
      aov: Array.isArray(s.aov) ? s.aov : [],
      orders: Array.isArray(s.orders) ? s.orders : [],
      margin: Array.isArray(s.marginPct) ? s.marginPct : [],
    }
  }, [sparkData])

  return (
    <AppLayout>
      {/* ─── Header ─── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="text-zinc-500 text-sm mt-0.5">
            Selamat datang, {user?.fullName || user?.username}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleViewMode}
            className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors"
            title={isCompact ? 'Tampilan penuh' : 'Tampilan ringkas'}
            aria-label={isCompact ? 'Switch to full view' : 'Switch to compact view'}
          >
            {isCompact ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
          </button>
          <button
            onClick={() => refetch()}
            className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors"
            aria-label="Refresh dashboard"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ─── Date range filter ─── */}
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
        <div className="flex gap-1 flex-wrap">
          {[
            { key: 'today',     label: 'Hari ini' },
            { key: 'yesterday', label: 'Kemarin' },
            { key: 'week',      label: 'Minggu ini' },
            { key: 'month',     label: 'Bulan ini' },
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
        <span className="text-[10px] text-zinc-600 ml-auto">vs periode sebelumnya</span>
      </div>

      {/* ─── Error state ─── */}
      {error && (
        <div className="bg-red-950/30 border border-red-500/30 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-400 shrink-0" />
            <div>
              <p className="text-sm text-red-300 font-medium">Gagal memuat data dashboard</p>
              <p className="text-xs text-red-400/70 mt-0.5">{error.message}</p>
            </div>
            <button
              onClick={() => refetch()}
              className="ml-auto px-3 py-1.5 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg transition-colors"
            >
              Coba Lagi
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════
          SECTION 1: ACTION CENTER (owner/finance only)
          ═══════════════════════════════════════════════════ */}
      {isOwnerOrFinance && <ActionCenter />}

      {/* ═══════════════════════════════════════════════════
          SECTION 2: HERO SCOREBOARD (owner/finance only)
          ═══════════════════════════════════════════════════ */}
      {isOwnerOrFinance && <HeroScoreboard canEditTarget={isOwnerOrFinance} />}

      {/* ═══════════════════════════════════════════════════
          SECTION 3: KPI ROWS
          ═══════════════════════════════════════════════════ */}
      {/* Row 1 — Performance */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <KpiCard
          label="Real Omzet"
          value={formatRupiah(data?.omzet?.total ?? 0, true)}
          sub={`${data?.orders?.valid ?? 0} order valid`}
          icon={TrendingUp}
          color="emerald"
          delta={data?.delta?.omzet}
          spark={spark.omzet}
        />
        {!isStaffOnly && (
          <KpiCard
            label="Gross Profit"
            value={formatRupiah(data?.omzet?.grossProfit ?? 0, true)}
            sub={data?.omzet?.total > 0 ? `${(((data?.omzet?.grossProfit ?? 0) / data.omzet.total) * 100).toFixed(1)}% margin` : 'omzet - HPP'}
            icon={ArrowUpRight}
            color="blue"
            delta={data?.delta?.grossProfit}
            spark={spark.gp}
          />
        )}
        {!isStaffOnly && (
          <KpiCard
            label="Net Profit"
            value={formatRupiah(data?.omzet?.netProfit ?? 0, true)}
            sub={`Margin: ${(data?.omzet?.netMargin ?? 0).toFixed(1)}%`}
            icon={DollarSign}
            color={data?.omzet?.netProfit >= 0 ? 'emerald' : 'red'}
            delta={data?.delta?.netProfit}
            spark={spark.net}
          />
        )}
        <KpiCard
          label="AOV"
          value={formatRupiah(data?.orders?.aov ?? 0, true)}
          sub="rata-rata per order"
          icon={Target}
          color="purple"
          delta={data?.delta?.aov}
          spark={spark.aov}
        />
      </div>

      {/* Row 2 — Operations */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <KpiCard
          label="Perlu Dikirim"
          value={String(data?.orders?.perluDikirim ?? 0)}
          sub="order pending kirim"
          icon={Clock}
          color="yellow"
        />
        <KpiCard
          label="Cancel Rate"
          value={`${(data?.orders?.cancelRate ?? 0).toFixed(1)}%`}
          sub={`${data?.orders?.batal ?? 0} dari ${data?.orders?.total ?? 0} order`}
          icon={ArrowDownRight}
          color="red"
          delta={cancelRateDelta}
          deltaInvert
        />
        <KpiCard
          label="Stok Kritis"
          value={String(data?.stock?.lowStockCount ?? 0)}
          sub="produk perlu restock"
          icon={AlertTriangle}
          color="orange"
        />
        {isOwnerOrFinance ? (
          <KpiCard
            label="Total Saldo Kas"
            value={formatRupiah(data?.wallet?.totalSaldo ?? 0, true)}
            sub={`${data?.wallet?.wallets?.length ?? 0} wallet aktif`}
            icon={Wallet}
            color="cyan"
          />
        ) : (
          <KpiCard
            label="Total Order"
            value={String(data?.orders?.valid ?? 0)}
            sub="terkirim + pending"
            icon={ShoppingCart}
            color="blue"
          />
        )}
      </div>

      {/* Row 3 — Owner-only Cashflow KPIs */}
      {isOwnerOrFinance && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <KpiCard
            label="Ads Spend"
            value={formatRupiah(data?.omzet?.totalAdSpend ?? 0, true)}
            sub={data?.omzet?.total > 0 ? `${(((data?.omzet?.totalAdSpend ?? 0) / data.omzet.total) * 100).toFixed(1)}% of omzet` : '-'}
            icon={Banknote}
            color="orange"
            delta={data?.delta?.adSpend}
            deltaInvert
          />
          <KpiCard
            label="Operating Expense"
            value={formatRupiah(data?.omzet?.totalOpEx ?? 0, true)}
            sub="biaya non-iklan"
            icon={Banknote}
            color="pink"
            delta={data?.delta?.opEx}
            deltaInvert
          />
          <KpiCard
            label="Piutang Outstanding"
            value={formatRupiah(data?.receivable?.piutang?.total ?? 0, true)}
            sub={`${data?.receivable?.piutang?.count ?? 0} item${(data?.receivable?.piutang?.overdue ?? 0) > 0 ? ` • ${formatRupiah(data?.receivable?.piutang?.overdue ?? 0, true)} overdue` : ''}`}
            icon={FileWarning}
            color={(data?.receivable?.piutang?.overdue ?? 0) > 0 ? 'orange' : 'cyan'}
          />
          <KpiCard
            label="Utang Outstanding"
            value={formatRupiah(data?.receivable?.utang?.total ?? 0, true)}
            sub={`${data?.receivable?.utang?.count ?? 0} item${(data?.receivable?.utang?.overdue ?? 0) > 0 ? ` • ${formatRupiah(data?.receivable?.utang?.overdue ?? 0, true)} overdue` : ''}`}
            icon={FileWarning}
            color={(data?.receivable?.utang?.overdue ?? 0) > 0 ? 'red' : 'purple'}
          />
        </div>
      )}

      {/* ═══════════════════════════════════════════════════
          SECTION 4: TREND CHARTS
          ═══════════════════════════════════════════════════ */}
      <SectionHeader
        icon={TrendingUp}
        title="Trend Harian"
        description={rangeLabel}
        collapsible
        storageKey="dash.section.trends"
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Omzet & GP trend */}
          <div className="stat-card lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-medium text-zinc-300">Trend Omzet & Profit Harian</p>
                <p className="text-xs text-zinc-600 mt-0.5">{rangeLabel}</p>
              </div>
            </div>
            {isLoading ? (
              <div className="h-[240px] bg-zinc-800/40 rounded animate-pulse" />
            ) : (
              <TrendChart trend={data?.trend ?? []} />
            )}
          </div>

          {/* Order trend stacked */}
          <div className="stat-card">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-zinc-300">Order Harian</p>
              <span className="text-[10px] text-zinc-600">valid vs batal</span>
            </div>
            {isLoading ? (
              <div className="h-[180px] bg-zinc-800/40 rounded animate-pulse" />
            ) : (
              <OrderTrendChart trend={data?.trend ?? []} />
            )}
            {/* P&L mini summary owner */}
            {isOwnerOrFinance && !isLoading && (
              <div className="mt-3 pt-3 border-t border-zinc-800 space-y-1 text-[11px]">
                <div className="flex justify-between text-zinc-500">
                  <span>Omzet</span>
                  <span className="text-zinc-300">{formatRupiah(data?.omzet?.total ?? 0, true)}</span>
                </div>
                <div className="flex justify-between text-zinc-500">
                  <span>HPP</span>
                  <span className="text-red-400">({formatRupiah(data?.omzet?.totalHpp ?? 0, true)})</span>
                </div>
                <div className="flex justify-between text-zinc-500">
                  <span>Ads</span>
                  <span className="text-red-400">({formatRupiah(data?.omzet?.totalAdSpend ?? 0, true)})</span>
                </div>
                <div className="flex justify-between text-zinc-500">
                  <span>OpEx</span>
                  <span className="text-red-400">({formatRupiah(data?.omzet?.totalOpEx ?? 0, true)})</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-zinc-800 font-bold">
                  <span className="text-zinc-300">Net Profit</span>
                  <span className={data?.omzet?.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                    {formatRupiah(data?.omzet?.netProfit ?? 0, true)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </SectionHeader>

      {/* ═══════════════════════════════════════════════════
          SECTION 5: PROFITABILITY (owner/finance only)
          ═══════════════════════════════════════════════════ */}
      {isOwnerOrFinance && (
        <ProfitabilitySection
          dateFrom={dateFrom}
          dateTo={dateTo}
          rangeLabel={rangeLabel}
          platformBreakdown={data?.omzet?.byPlatform ?? []}
          enabled={!isCompact}
        />
      )}

      {/* ═══════════════════════════════════════════════════
          SECTION 6: CASHFLOW (owner/finance only)
          ═══════════════════════════════════════════════════ */}
      {isOwnerOrFinance && (
        <CashflowSection
          walletData={
            data?.wallet
              ? {
                  wallets: data.wallet.wallets ?? [],
                  totalBalance: data.wallet.totalSaldo ?? 0,
                }
              : null
          }
          enabled={!isCompact}
        />
      )}

      {/* ═══════════════════════════════════════════════════
          SECTION 7: AR/AP (owner/finance only)
          ═══════════════════════════════════════════════════ */}
      {isOwnerOrFinance && (
        <ArApSection enabled={!isCompact} />
      )}

      {/* ═══════════════════════════════════════════════════
          SECTION 8: INVENTORY HEALTH
          ═══════════════════════════════════════════════════ */}
      <InventoryHealthSection enabled={!isCompact} />

      {/* ═══════════════════════════════════════════════════
          SECTION 9: OPERATIONS & GEOGRAPHY
          ═══════════════════════════════════════════════════ */}
      <OperationsSection
        data={data ? { aging: data.aging, geo: data.geo, payout: data.payout } : null}
        isLoading={isLoading}
        rangeLabel={rangeLabel}
        canEdit={isOwnerOrFinance}
      />
    </AppLayout>
  )
}
