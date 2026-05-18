'use client'

import { useQuery } from '@tanstack/react-query'
import {
  Target,
  Wallet as WalletIcon,
  Hourglass,
  TrendingUp,
  Pencil,
  AlertCircle,
} from 'lucide-react'
import { useState } from 'react'
import { formatRupiah } from '@/lib/utils'
import { DeltaBadge } from './delta-badge'
import { TargetEditorModal } from './target-editor-modal'

interface ScoreboardData {
  ym: string
  pacing: { dayIndex: number; daysInMonth: number; pacingPct: number }
  netProfit: {
    mtdOmzet: number
    mtdGP: number
    mtdNet: number
    projectedEOM: number
    targetOmzet: number
    targetNet: number
    omzetAchPct: number | null
    netAchPct: number | null
    mtdAdsSpend: number
    mtdOpEx: number
  }
  equity: {
    cash: number
    inventoryValue: number
    piutang: number
    utang: number
    vendorOutstanding: number
    total: number
  }
  runway: {
    cash: number
    avgMonthlyBurn: number
    avgDailyBurn: number
    months: number | null
    basisDays: number
  }
  growth: {
    mtdOmzet: number
    prevSameDayOmzet: number
    omzetMoMPct: number | null
    mtdMargin: number
    prevMargin: number
    marginMoMDiff: number
    prevMonthOmzet: number
    prevMonthNet: number
  }
}

function ProgressBar({
  pct,
  pacing,
  achColor = 'emerald',
}: {
  pct: number | null
  pacing: number
  achColor?: 'emerald' | 'yellow' | 'red'
}) {
  const safe = Math.max(0, Math.min(150, pct ?? 0))
  const colorMap = {
    emerald: 'bg-emerald-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
  }
  const overflow = safe > 100
  return (
    <div className="relative h-1.5 bg-zinc-800 rounded-full overflow-hidden">
      <div
        className={`absolute top-0 left-0 h-full ${colorMap[achColor]} transition-all`}
        style={{ width: `${Math.min(100, safe)}%` }}
      />
      {/* Pacing marker */}
      <div
        className="absolute top-0 h-full w-0.5 bg-zinc-300/60"
        style={{ left: `${Math.min(100, pacing)}%` }}
        title={`Pacing ${pacing.toFixed(0)}%`}
      />
      {overflow && (
        <div className="absolute top-0 right-0 h-full w-1 bg-emerald-300" />
      )}
    </div>
  )
}

function ScoreCard({
  icon: Icon,
  label,
  primary,
  secondary,
  hint,
  accent = 'emerald',
  children,
  action,
}: {
  icon: React.ElementType
  label: string
  primary: string
  secondary?: string
  hint?: string
  accent?: 'emerald' | 'blue' | 'purple' | 'orange' | 'red'
  children?: React.ReactNode
  action?: React.ReactNode
}) {
  const accentMap = {
    emerald: 'from-emerald-500/15 to-emerald-500/5 border-emerald-500/20 text-emerald-300',
    blue: 'from-blue-500/15 to-blue-500/5 border-blue-500/20 text-blue-300',
    purple: 'from-purple-500/15 to-purple-500/5 border-purple-500/20 text-purple-300',
    orange: 'from-orange-500/15 to-orange-500/5 border-orange-500/20 text-orange-300',
    red: 'from-red-500/15 to-red-500/5 border-red-500/20 text-red-300',
  }
  return (
    <div
      className={`rounded-xl border bg-gradient-to-br ${accentMap[accent]} p-3 flex flex-col gap-2`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide opacity-90">
          <Icon size={12} />
          <span className="font-semibold">{label}</span>
        </div>
        {action}
      </div>
      <div>
        <p className="text-xl font-bold text-white leading-tight">{primary}</p>
        {secondary && <p className="text-[11px] text-zinc-400 mt-0.5">{secondary}</p>}
      </div>
      {children}
      {hint && <p className="text-[10px] text-zinc-500 mt-auto pt-1">{hint}</p>}
    </div>
  )
}

export function HeroScoreboard({ canEditTarget = false }: { canEditTarget?: boolean }) {
  const [editorOpen, setEditorOpen] = useState(false)

  const { data, isLoading } = useQuery<ScoreboardData>({
    queryKey: ['dashboard', 'scoreboard'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard/scoreboard', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed')
      return json.data
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-32 rounded-xl bg-zinc-900/40 border border-zinc-800 animate-pulse" />
        ))}
      </div>
    )
  }

  const { netProfit, equity, runway, growth, pacing, ym } = data

  // Net profit card
  const netAch = netProfit.netAchPct
  const omzetAch = netProfit.omzetAchPct
  const targetSet = netProfit.targetOmzet > 0 || netProfit.targetNet > 0
  const netAchColor: 'emerald' | 'yellow' | 'red' =
    netAch === null ? 'emerald'
      : netAch >= pacing.pacingPct ? 'emerald'
      : netAch >= pacing.pacingPct * 0.7 ? 'yellow'
      : 'red'
  const omzetAchColor: 'emerald' | 'yellow' | 'red' =
    omzetAch === null ? 'emerald'
      : omzetAch >= pacing.pacingPct ? 'emerald'
      : omzetAch >= pacing.pacingPct * 0.7 ? 'yellow'
      : 'red'

  // Runway color
  const runwayColor: 'emerald' | 'orange' | 'red' =
    runway.months === null ? 'emerald'
      : runway.months >= 6 ? 'emerald'
      : runway.months >= 3 ? 'orange'
      : 'red'

  // Growth color
  const growthAccent: 'emerald' | 'orange' | 'red' =
    (growth.omzetMoMPct ?? 0) >= 0 ? 'emerald' : (growth.omzetMoMPct ?? 0) >= -10 ? 'orange' : 'red'

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        {/* 1. Target Achievement */}
        <ScoreCard
          icon={Target}
          label="Target Bulan Ini"
          primary={
            targetSet
              ? `${(netAch ?? omzetAch ?? 0).toFixed(0)}%`
              : 'Set target'
          }
          secondary={
            targetSet
              ? `Net ${formatRupiah(netProfit.mtdNet, true)}${netProfit.targetNet > 0 ? ` / ${formatRupiah(netProfit.targetNet, true)}` : ''}`
              : 'Klik ikon edit untuk set target'
          }
          hint={
            targetSet
              ? `Proyeksi EOM: ${formatRupiah(netProfit.projectedEOM, true)} • Pacing hari ${pacing.dayIndex}/${pacing.daysInMonth}`
              : undefined
          }
          accent={
            !targetSet ? 'orange'
              : netAchColor === 'red' ? 'red'
              : netAchColor === 'yellow' ? 'orange'
              : 'emerald'
          }
          action={
            canEditTarget && (
              <button
                onClick={() => setEditorOpen(true)}
                className="text-zinc-400 hover:text-white p-1 -m-1"
                aria-label="Edit target"
              >
                <Pencil size={11} />
              </button>
            )
          }
        >
          {targetSet && (
            <div className="space-y-1.5">
              {netProfit.targetOmzet > 0 && (
                <div>
                  <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-0.5">
                    <span>Omzet</span>
                    <span>{omzetAch?.toFixed(0)}%</span>
                  </div>
                  <ProgressBar pct={omzetAch} pacing={pacing.pacingPct} achColor={omzetAchColor} />
                </div>
              )}
              {netProfit.targetNet > 0 && (
                <div>
                  <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-0.5">
                    <span>Net Profit</span>
                    <span>{netAch?.toFixed(0)}%</span>
                  </div>
                  <ProgressBar pct={netAch} pacing={pacing.pacingPct} achColor={netAchColor} />
                </div>
              )}
            </div>
          )}
        </ScoreCard>

        {/* 2. Total Equity */}
        <ScoreCard
          icon={WalletIcon}
          label="Net Worth Bisnis"
          primary={formatRupiah(equity.total, true)}
          secondary="Kas + Inv + Piutang − Utang"
          accent="blue"
        >
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px]">
            <Row label="Kas" value={formatRupiah(equity.cash, true)} positive />
            <Row label="Inventory" value={formatRupiah(equity.inventoryValue, true)} positive />
            <Row label="Piutang" value={formatRupiah(equity.piutang, true)} positive />
            <Row
              label="Utang+Vendor"
              value={`-${formatRupiah(equity.utang + equity.vendorOutstanding, true)}`}
              negative
            />
          </div>
        </ScoreCard>

        {/* 3. Cash Runway */}
        <ScoreCard
          icon={Hourglass}
          label="Cash Runway"
          primary={
            runway.months === null
              ? '∞'
              : runway.months >= 99 ? '99+ bulan'
              : `${runway.months.toFixed(1)} bulan`
          }
          secondary={`Burn ~${formatRupiah(runway.avgMonthlyBurn, true)}/bln`}
          hint={`Berdasarkan ${runway.basisDays} hari terakhir • Kas ${formatRupiah(runway.cash, true)}`}
          accent={runwayColor === 'red' ? 'red' : runwayColor === 'orange' ? 'orange' : 'emerald'}
        >
          {runway.months !== null && runway.months < 3 && (
            <div className="flex items-center gap-1 text-[10px] text-red-300 bg-red-500/10 border border-red-500/20 rounded-md px-1.5 py-1">
              <AlertCircle size={10} />
              Runway kritis, perlu top-up kas atau pangkas burn
            </div>
          )}
        </ScoreCard>

        {/* 4. Growth Quality */}
        <ScoreCard
          icon={TrendingUp}
          label="Kualitas Pertumbuhan"
          primary={
            growth.omzetMoMPct === null
              ? '—'
              : `${growth.omzetMoMPct >= 0 ? '+' : ''}${growth.omzetMoMPct.toFixed(0)}%`
          }
          secondary={`Omzet vs hari yg sama bulan lalu`}
          hint={`Margin ${growth.mtdMargin.toFixed(1)}% (${growth.marginMoMDiff >= 0 ? '+' : ''}${growth.marginMoMDiff.toFixed(1)}pp MoM)`}
          accent={growthAccent}
        >
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div>
              <p className="text-zinc-500">Omzet MTD</p>
              <p className="text-zinc-200 font-medium">{formatRupiah(growth.mtdOmzet, true)}</p>
            </div>
            <div>
              <p className="text-zinc-500">Margin MTD</p>
              <p className="text-zinc-200 font-medium">{growth.mtdMargin.toFixed(1)}%</p>
            </div>
          </div>
          {growth.omzetMoMPct !== null && (
            <DeltaBadge value={Number(growth.omzetMoMPct.toFixed(1))} />
          )}
        </ScoreCard>
      </div>

      <TargetEditorModal
        ym={ym}
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        canEdit={canEditTarget}
      />
    </>
  )
}

function Row({
  label,
  value,
  positive,
  negative,
}: {
  label: string
  value: string
  positive?: boolean
  negative?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-2 min-w-0">
      <span className="text-zinc-500 truncate">{label}</span>
      <span
        className={`font-mono ${
          negative ? 'text-red-300' : positive ? 'text-zinc-200' : 'text-zinc-300'
        }`}
      >
        {value}
      </span>
    </div>
  )
}
