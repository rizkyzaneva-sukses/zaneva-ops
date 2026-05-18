'use client'

import { useQuery } from '@tanstack/react-query'
import {
  TrendingDown,
  Banknote,
  Wallet as WalletIcon,
  Hourglass,
  AlertCircle,
} from 'lucide-react'
import { formatRupiah } from '@/lib/utils'
import { SectionHeader } from './section-header'
import { DailyCashFlowChart } from './charts'

interface CashflowResp {
  days: number
  daily: { day: string; cashIn: number; cashOut: number; net: number }[]
  summary: { totalIn: number; totalOut: number; net: number; days: number }
  burn: { avgMonthlyBurn: number; avgDailyBurn: number; totalSpend90d: number }
  runway: { cash: number; months: number | null }
  byCategory: { category: string; total: number; count: number }[]
}

const CATEGORY_COLORS = ['#a855f7', '#3b82f6', '#10b981', '#f59e0b', '#ef4444']

function BurnRateCard({ data }: { data: CashflowResp }) {
  const m = data.runway.months
  const tone =
    m === null
      ? 'border-emerald-500/20 bg-emerald-500/5'
      : m >= 6
      ? 'border-emerald-500/20 bg-emerald-500/5'
      : m >= 3
      ? 'border-orange-500/20 bg-orange-500/5'
      : 'border-red-500/30 bg-red-500/10'
  return (
    <div className={`rounded-xl border ${tone} p-3`}>
      <div className="flex items-center gap-2 mb-2">
        <Hourglass size={13} className="text-zinc-300" />
        <h3 className="text-xs font-semibold text-zinc-200">Burn Rate & Runway</h3>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <Stat label="Burn / bulan" value={formatRupiah(data.burn.avgMonthlyBurn, true)} />
        <Stat label="Burn / hari" value={formatRupiah(data.burn.avgDailyBurn, true)} />
        <Stat label="Kas saat ini" value={formatRupiah(data.runway.cash, true)} />
        <Stat
          label="Runway"
          value={
            m === null
              ? '∞'
              : m >= 99
              ? '99+ bln'
              : `${m.toFixed(1)} bln`
          }
          tone={m !== null && m < 3 ? 'red' : m !== null && m < 6 ? 'orange' : 'emerald'}
        />
      </div>
      {m !== null && m < 3 && (
        <div className="mt-2 flex items-center gap-1 text-[10px] text-red-300 bg-red-500/10 border border-red-500/20 rounded-md px-1.5 py-1">
          <AlertCircle size={10} />
          Runway kritis. Audit ads spend & pengeluaran rutin.
        </div>
      )}
      <p className="text-[9px] text-zinc-600 mt-1.5">Avg 90 hari terakhir</p>
    </div>
  )
}

function Stat({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'red' | 'orange' | 'emerald'
}) {
  const toneMap = {
    default: 'text-zinc-200',
    red: 'text-red-300',
    orange: 'text-orange-300',
    emerald: 'text-emerald-300',
  }
  return (
    <div>
      <p className="text-zinc-500 text-[10px]">{label}</p>
      <p className={`font-mono font-medium ${toneMap[tone]}`}>{value}</p>
    </div>
  )
}

function CategoryList({ data }: { data: CashflowResp }) {
  if (data.byCategory.length === 0) {
    return <p className="text-[11px] text-zinc-600 py-3 text-center">Belum ada expense</p>
  }
  const max = data.byCategory[0].total
  return (
    <ul className="space-y-2">
      {data.byCategory.map((c, i) => {
        const pct = max > 0 ? (c.total / max) * 100 : 0
        return (
          <li key={c.category}>
            <div className="flex items-center justify-between text-[11px] mb-0.5">
              <span className="text-zinc-300 truncate">{c.category}</span>
              <span className="text-zinc-400 font-mono">{formatRupiah(c.total, true)}</span>
            </div>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full transition-all"
                style={{
                  width: `${pct}%`,
                  backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
                }}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export function CashflowSection({
  rangeLabel,
  walletData,
  enabled = true,
  days = 30,
}: {
  rangeLabel?: string
  walletData?: { wallets: { name: string; balance: number; type?: string }[]; totalBalance: number } | null
  enabled?: boolean
  days?: number
}) {
  const { data, isLoading } = useQuery<CashflowResp>({
    queryKey: ['dashboard', 'cashflow', days],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard/cashflow?days=${days}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed')
      return json.data
    },
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  return (
    <SectionHeader
      icon={Banknote}
      title="Arus Kas & Runway"
      description="Pemasukan vs pengeluaran harian, burn rate, & saldo wallet"
      rangeLabel={rangeLabel ?? `${days} hari terakhir`}
      collapsible
      storageKey="dash.section.cashflow"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Kiri: chart cashflow + summary */}
        <div className="lg:col-span-2 space-y-3">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-zinc-300">Cashflow Harian</h3>
              {data && (
                <div className="flex items-center gap-3 text-[10px]">
                  <span className="text-emerald-400">
                    Masuk {formatRupiah(data.summary.totalIn, true)}
                  </span>
                  <span className="text-red-400">
                    Keluar {formatRupiah(data.summary.totalOut, true)}
                  </span>
                  <span className={data.summary.net >= 0 ? 'text-emerald-300' : 'text-red-300'}>
                    Net {formatRupiah(data.summary.net, true)}
                  </span>
                </div>
              )}
            </div>
            {isLoading || !data ? (
              <div className="h-52 bg-zinc-800/30 rounded-lg animate-pulse" />
            ) : (
              <DailyCashFlowChart trend={data.daily} />
            )}
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown size={13} className="text-red-400" />
              <h3 className="text-xs font-semibold text-zinc-300">Top Kategori Expense</h3>
              <span className="text-[10px] text-zinc-600">{days} hari terakhir</span>
            </div>
            {isLoading || !data ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-8 bg-zinc-800/30 rounded animate-pulse" />
                ))}
              </div>
            ) : (
              <CategoryList data={data} />
            )}
          </div>
        </div>

        {/* Kanan: wallet list + burn rate */}
        <div className="space-y-3">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
            <div className="flex items-center gap-2 mb-2">
              <WalletIcon size={13} className="text-blue-400" />
              <h3 className="text-xs font-semibold text-zinc-300">Saldo Wallet</h3>
            </div>
            {!walletData ? (
              <p className="text-[11px] text-zinc-600 py-3 text-center">Belum ada wallet</p>
            ) : (
              <>
                <p className="text-lg font-bold text-zinc-100 font-mono">
                  {formatRupiah(walletData.totalBalance)}
                </p>
                <p className="text-[10px] text-zinc-500 mb-2">Total semua wallet aktif</p>
                <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                  {walletData.wallets.slice(0, 8).map((w) => (
                    <li
                      key={w.name}
                      className="flex items-center justify-between text-[11px] py-0.5"
                    >
                      <span className="text-zinc-400 truncate">{w.name}</span>
                      <span
                        className={`font-mono ${
                          w.balance < 0 ? 'text-red-300' : 'text-zinc-200'
                        }`}
                      >
                        {formatRupiah(w.balance, true)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {isLoading || !data ? (
            <div className="h-32 rounded-xl bg-zinc-900/40 border border-zinc-800 animate-pulse" />
          ) : (
            <BurnRateCard data={data} />
          )}
        </div>
      </div>
    </SectionHeader>
  )
}
