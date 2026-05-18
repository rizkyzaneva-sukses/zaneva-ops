'use client'

import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  AlertOctagon,
  Bell,
  CheckCircle2,
  ChevronRight,
  Info,
} from 'lucide-react'
import Link from 'next/link'
import { formatRupiah } from '@/lib/utils'

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'

interface AlertItem {
  id: string
  severity: Severity
  category: string
  title: string
  detail: string
  href?: string
  count?: number
  amount?: number
}

interface ActionCenterResponse {
  items: AlertItem[]
  summary: {
    total: number
    critical: number
    high: number
    medium: number
    low: number
    info: number
  }
}

const SEVERITY_STYLES: Record<
  Severity,
  { bar: string; chip: string; icon: React.ElementType; iconColor: string; label: string }
> = {
  critical: {
    bar: 'border-l-red-500 bg-red-950/30',
    chip: 'bg-red-500/15 text-red-300 border border-red-500/30',
    icon: AlertOctagon,
    iconColor: 'text-red-400',
    label: 'Kritis',
  },
  high: {
    bar: 'border-l-orange-500 bg-orange-950/20',
    chip: 'bg-orange-500/15 text-orange-300 border border-orange-500/30',
    icon: AlertTriangle,
    iconColor: 'text-orange-400',
    label: 'Tinggi',
  },
  medium: {
    bar: 'border-l-yellow-500 bg-yellow-950/15',
    chip: 'bg-yellow-500/15 text-yellow-300 border border-yellow-500/30',
    icon: Bell,
    iconColor: 'text-yellow-400',
    label: 'Sedang',
  },
  low: {
    bar: 'border-l-zinc-500 bg-zinc-900/40',
    chip: 'bg-zinc-700/30 text-zinc-300 border border-zinc-600/40',
    icon: Info,
    iconColor: 'text-zinc-400',
    label: 'Rendah',
  },
  info: {
    bar: 'border-l-emerald-500 bg-emerald-950/20',
    chip: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
    icon: CheckCircle2,
    iconColor: 'text-emerald-400',
    label: 'Info',
  },
}

export function ActionCenter({ enabled = true }: { enabled?: boolean }) {
  const { data, isLoading } = useQuery<ActionCenterResponse>({
    queryKey: ['dashboard', 'action-center'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard/action-center', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed')
      return json.data
    },
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  if (isLoading) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 mb-3">
        <div className="flex items-center gap-2 mb-2">
          <Bell size={14} className="text-zinc-500" />
          <span className="text-sm font-semibold text-zinc-300">Action Center</span>
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-zinc-800/40 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  const items = data?.items ?? []
  const summary = data?.summary

  // Empty state — semua aman
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/20 p-3 mb-3 flex items-center gap-3">
        <div className="p-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30">
          <CheckCircle2 size={16} className="text-emerald-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-emerald-200">Semua aman</p>
          <p className="text-[11px] text-emerald-400/70">
            Tidak ada alert kritis. Stok, piutang, utang, dan target dalam kondisi baik.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 mb-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <Bell size={14} className="text-zinc-400" />
          <span className="text-sm font-semibold text-zinc-200">Action Center</span>
          <span className="text-[10px] text-zinc-500">
            {items.length} alert
            {summary && summary.total > items.length ? ` dari ${summary.total}` : ''}
          </span>
        </div>
        {summary && (
          <div className="flex items-center gap-1">
            {summary.critical > 0 && (
              <Pill cls={SEVERITY_STYLES.critical.chip} text={`${summary.critical} kritis`} />
            )}
            {summary.high > 0 && (
              <Pill cls={SEVERITY_STYLES.high.chip} text={`${summary.high} tinggi`} />
            )}
            {summary.medium > 0 && (
              <Pill cls={SEVERITY_STYLES.medium.chip} text={`${summary.medium} sedang`} />
            )}
          </div>
        )}
      </div>

      <ul className="space-y-1.5">
        {items.map((item) => {
          const cfg = SEVERITY_STYLES[item.severity]
          const Icon = cfg.icon
          const Wrapper = (item.href ? Link : 'div') as React.ElementType
          return (
            <li key={item.id}>
              <Wrapper
                {...(item.href ? { href: item.href } : {})}
                className={`flex items-start gap-2.5 px-2.5 py-2 rounded-lg border-l-2 ${cfg.bar} hover:bg-zinc-800/40 transition-colors group`}
              >
                <Icon size={14} className={`${cfg.iconColor} mt-0.5 shrink-0`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[13px] font-medium text-zinc-200 leading-tight">
                      {item.title}
                    </p>
                    {item.amount && item.amount > 0 ? (
                      <span className="text-[11px] text-zinc-400 font-mono">
                        {formatRupiah(item.amount, true)}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-0.5 line-clamp-2">{item.detail}</p>
                </div>
                {item.href && (
                  <ChevronRight
                    size={14}
                    className="text-zinc-600 group-hover:text-zinc-300 shrink-0 mt-1"
                  />
                )}
              </Wrapper>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Pill({ cls, text }: { cls: string; text: string }) {
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${cls}`}>{text}</span>
  )
}
