'use client'

import { useQuery } from '@tanstack/react-query'
import { ArrowDownLeft, ArrowUpRight, Scale, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { formatRupiah } from '@/lib/utils'
import { SectionHeader } from './section-header'

interface Bucket {
  key: string
  label: string
  count: number
  total: number
}
interface TopItem {
  id: string
  name: string
  outstanding: number
  dueDate: string | Date | null
  trxDate: string | Date
  daysOutstanding?: number | null
  daysToDue?: number | null
}
interface ArApData {
  piutang: { buckets: Bucket[]; top: TopItem[] }
  utang: { buckets: Bucket[]; top: TopItem[] }
}

const BUCKET_COLORS = [
  'bg-emerald-500', // 0-7
  'bg-yellow-500',  // 8-30
  'bg-orange-500',  // 31-60
  'bg-red-500',     // 60+
  'bg-zinc-500',    // no due
]

function AgingBuckets({
  buckets,
  variant,
}: {
  buckets: Bucket[]
  variant: 'piutang' | 'utang'
}) {
  const max = Math.max(...buckets.map((b) => b.total), 1)
  const totalCount = buckets.reduce((acc, b) => acc + b.count, 0)
  const totalAmount = buckets.reduce((acc, b) => acc + b.total, 0)

  if (totalCount === 0) {
    return <p className="text-[11px] text-zinc-600 py-3 text-center">Tidak ada outstanding</p>
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-lg font-bold text-zinc-100 font-mono">
          {formatRupiah(totalAmount)}
        </p>
        <p className="text-[11px] text-zinc-500">{totalCount} item</p>
      </div>
      {buckets.map((b, i) => {
        if (b.count === 0) return null
        const isWarn = variant === 'piutang' ? i >= 2 : i >= 0 && i < 4
        return (
          <div key={b.key} className="flex items-center gap-2">
            <span
              className={`text-[10px] w-20 shrink-0 ${
                i >= 3
                  ? 'text-red-400'
                  : i >= 2
                  ? 'text-orange-400'
                  : i >= 1
                  ? 'text-yellow-400'
                  : 'text-zinc-400'
              }`}
            >
              {b.label}
            </span>
            <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${BUCKET_COLORS[i] ?? 'bg-zinc-500'}`}
                style={{ width: `${(b.total / max) * 100}%` }}
              />
            </div>
            <span className="text-[10px] text-zinc-300 font-mono w-20 text-right shrink-0">
              {formatRupiah(b.total, true)}
            </span>
            <span className="text-[10px] text-zinc-500 w-8 text-right shrink-0">{b.count}</span>
          </div>
        )
      })}
    </div>
  )
}

function TopList({
  items,
  variant,
}: {
  items: TopItem[]
  variant: 'piutang' | 'utang'
}) {
  if (items.length === 0) {
    return <p className="text-[11px] text-zinc-600 py-3 text-center">Tidak ada</p>
  }
  return (
    <ul className="space-y-1">
      {items.map((it) => {
        const days =
          variant === 'piutang' ? it.daysOutstanding ?? null : it.daysToDue ?? null
        let tone = 'text-zinc-500'
        let dayText = '—'
        if (days !== null) {
          if (variant === 'piutang') {
            // overdue ke kanan = besar
            if (days > 60) tone = 'text-red-400'
            else if (days > 30) tone = 'text-orange-400'
            else if (days > 7) tone = 'text-yellow-400'
            else tone = 'text-emerald-400'
            dayText = days <= 0 ? 'belum jatuh tempo' : `${days}h overdue`
          } else {
            // utang: days_to_due. Negatif = sudah lewat
            if (days < 0) {
              tone = 'text-red-400'
              dayText = `${Math.abs(days)}h lewat`
            } else if (days <= 7) {
              tone = 'text-orange-400'
              dayText = `${days}h lagi`
            } else {
              tone = 'text-zinc-400'
              dayText = `${days}h lagi`
            }
          }
        } else if (!it.dueDate) {
          dayText = 'tanpa due'
          tone = 'text-zinc-500'
        }
        return (
          <li
            key={it.id}
            className="flex items-center justify-between gap-2 py-1 border-b border-zinc-900 last:border-0 min-w-0"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-zinc-200 truncate">{it.name}</p>
              <p className={`text-[10px] ${tone}`}>{dayText}</p>
            </div>
            <span className="text-[12px] text-zinc-200 font-mono shrink-0">
              {formatRupiah(it.outstanding, true)}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

export function ArApSection({ enabled = true }: { enabled?: boolean }) {
  const { data, isLoading } = useQuery<ArApData>({
    queryKey: ['dashboard', 'ar-ap'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard/ar-ap', { cache: 'no-store' })
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
      icon={Scale}
      title="Piutang & Utang"
      description="Aging analysis & top outstanding"
      collapsible
      storageKey="dash.section.arap"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Piutang */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowDownLeft size={14} className="text-emerald-400" />
              <h3 className="text-xs font-semibold text-zinc-200">Piutang (yang harus diterima)</h3>
            </div>
            <Link
              href="/utang-piutang"
              className="text-[10px] text-zinc-500 hover:text-zinc-300"
            >
              Lihat semua →
            </Link>
          </div>
          {isLoading || !data ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-4 bg-zinc-800/30 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              <AgingBuckets buckets={data.piutang.buckets} variant="piutang" />
              <div className="border-t border-zinc-800 pt-2">
                <p className="text-[11px] font-medium text-zinc-400 mb-1">
                  Top 5 Outstanding
                </p>
                <TopList items={data.piutang.top} variant="piutang" />
              </div>
            </>
          )}
        </div>

        {/* Utang */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowUpRight size={14} className="text-red-400" />
              <h3 className="text-xs font-semibold text-zinc-200">Utang (yang harus dibayar)</h3>
            </div>
            <Link
              href="/utang-piutang"
              className="text-[10px] text-zinc-500 hover:text-zinc-300"
            >
              Lihat semua →
            </Link>
          </div>
          {isLoading || !data ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-4 bg-zinc-800/30 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              <AgingBuckets buckets={data.utang.buckets} variant="utang" />
              <div className="border-t border-zinc-800 pt-2">
                <p className="text-[11px] font-medium text-zinc-400 mb-1 flex items-center gap-1">
                  <AlertTriangle size={11} className="text-orange-400" />
                  Top 5 yang Perlu Diperhatikan
                </p>
                <TopList items={data.utang.top} variant="utang" />
              </div>
            </>
          )}
        </div>
      </div>
    </SectionHeader>
  )
}
