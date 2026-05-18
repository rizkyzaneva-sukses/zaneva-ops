'use client'

import { useQuery } from '@tanstack/react-query'
import { TrendingUp, AlertTriangle, BarChart3, Sparkles } from 'lucide-react'
import { formatRupiah } from '@/lib/utils'
import { SectionHeader } from './section-header'
import { MarginTrendChart } from './charts'
import { PlatformBreakdown } from './platform-breakdown'

interface Product {
  sku: string
  nama: string
  qty: number
  omzet: number
  hpp: number
  gp: number
  marginPct: number
}
interface ProfitDetail {
  topProducts: Product[]
  lowMarginProducts: Product[]
  marginTrend: { day: string; omzet: number; hpp: number; marginPct: number }[]
}

const MEDALS = ['🥇', '🥈', '🥉']

function ProductRow({
  rank,
  p,
  highlightLow = false,
}: {
  rank?: number
  p: Product
  highlightLow?: boolean
}) {
  const marginColor =
    p.marginPct < 0
      ? 'text-red-400'
      : p.marginPct < 10
      ? 'text-orange-400'
      : p.marginPct < 25
      ? 'text-yellow-400'
      : 'text-emerald-400'
  return (
    <li className="flex items-center justify-between gap-2 py-1.5 border-b border-zinc-900 last:border-0 min-w-0">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {rank !== undefined && (
          <span className="text-sm shrink-0 w-5 text-center">
            {rank <= 2 ? MEDALS[rank] : <span className="text-zinc-600">{rank + 1}</span>}
          </span>
        )}
        <div className="min-w-0">
          <p className="text-[12px] text-zinc-200 truncate font-medium">{p.nama}</p>
          <p className="text-[10px] text-zinc-600 truncate font-mono">
            {p.sku} • {p.qty} pcs
          </p>
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="text-[12px] text-zinc-200 font-mono">
          {highlightLow ? formatRupiah(p.omzet, true) : formatRupiah(p.gp, true)}
        </p>
        <p className={`text-[10px] font-medium ${marginColor}`}>{p.marginPct.toFixed(1)}%</p>
      </div>
    </li>
  )
}

export function ProfitabilitySection({
  dateFrom,
  dateTo,
  rangeLabel,
  platformBreakdown,
  enabled = true,
}: {
  dateFrom: string
  dateTo: string
  rangeLabel: string
  // platform data tetap dari /api/dashboard/stats untuk hindari double-fetch
  platformBreakdown: any[]
  enabled?: boolean
}) {
  const { data, isLoading } = useQuery<ProfitDetail>({
    queryKey: ['dashboard', 'profit-detail', dateFrom, dateTo],
    queryFn: async () => {
      const res = await fetch(
        `/api/dashboard/profit-detail?dateFrom=${dateFrom}&dateTo=${dateTo}`,
        { cache: 'no-store' },
      )
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed')
      return json.data
    },
    enabled: enabled && !!dateFrom && !!dateTo,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
    refetchOnWindowFocus: false,
  })

  return (
    <SectionHeader
      icon={Sparkles}
      title="Profitabilitas"
      description="Margin per platform & produk paling kontributif"
      rangeLabel={rangeLabel}
      collapsible
      storageKey="dash.section.profitability"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Kiri: margin trend + platform breakdown */}
        <div className="lg:col-span-2 space-y-3">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 size={13} className="text-purple-400" />
              <h3 className="text-xs font-semibold text-zinc-300">Margin Harian (%)</h3>
            </div>
            {isLoading ? (
              <div className="h-44 bg-zinc-800/30 rounded-lg animate-pulse" />
            ) : (
              <MarginTrendChart
                trend={(data?.marginTrend ?? []).map((d) => ({
                  day: d.day,
                  omzet: d.omzet,
                  grossProfit: d.omzet - d.hpp,
                }))}
              />
            )}
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-zinc-300">Performance per Platform</h3>
            </div>
            <PlatformBreakdown data={platformBreakdown ?? []} showGp />
          </div>
        </div>

        {/* Kanan: top produk + low margin */}
        <div className="space-y-3">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={13} className="text-emerald-400" />
              <h3 className="text-xs font-semibold text-zinc-300">Top Produk by Gross Profit</h3>
            </div>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-8 bg-zinc-800/30 rounded animate-pulse" />
                ))}
              </div>
            ) : (data?.topProducts?.length ?? 0) === 0 ? (
              <p className="text-[11px] text-zinc-600 py-4 text-center">Belum ada data produk</p>
            ) : (
              <ul className="space-y-0">
                {data!.topProducts.map((p, i) => (
                  <ProductRow key={p.sku} rank={i} p={p} />
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={13} className="text-orange-400" />
              <h3 className="text-xs font-semibold text-zinc-300">Margin Terendah</h3>
              <span className="text-[10px] text-zinc-600">qty ≥ 3</span>
            </div>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-8 bg-zinc-800/30 rounded animate-pulse" />
                ))}
              </div>
            ) : (data?.lowMarginProducts?.length ?? 0) === 0 ? (
              <p className="text-[11px] text-zinc-600 py-4 text-center">Tidak ada produk margin rendah</p>
            ) : (
              <ul className="space-y-0">
                {data!.lowMarginProducts.map((p) => (
                  <ProductRow key={p.sku} p={p} highlightLow />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </SectionHeader>
  )
}
