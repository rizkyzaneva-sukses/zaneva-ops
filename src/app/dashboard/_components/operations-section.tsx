'use client'

import { Activity, MapPin, Banknote } from 'lucide-react'
import { formatRupiah } from '@/lib/utils'
import { SectionHeader } from './section-header'
import { AgingBars } from './aging-bars'

interface Geo {
  topProvinces: { province: string; count: number }[]
  topCities: { city: string; count: number }[]
}

interface OperationsData {
  aging?: { label: string; count: number }[]
  geo?: Geo
  payout?: { count: number; totalIncome: number }
}

export function OperationsSection({
  data,
  isLoading,
  rangeLabel,
  canEdit = false,
}: {
  data: OperationsData | null | undefined
  isLoading: boolean
  rangeLabel: string
  canEdit?: boolean
}) {
  const totalAgingBacklog = (data?.aging ?? []).reduce(
    (s, a) => s + a.count,
    0,
  )

  return (
    <SectionHeader
      icon={Activity}
      title="Operasional & Geografi"
      description="Backlog pengiriman, payout, & sebaran pembeli"
      rangeLabel={rangeLabel}
      collapsible
      storageKey="dash.section.operations"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Aging Backlog */}
        <div className="lg:col-span-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs font-semibold text-zinc-300">Aging Backlog</p>
              <p className="text-[10px] text-zinc-600 mt-0.5">
                {totalAgingBacklog} order belum dikirim
              </p>
            </div>
            <span
              className={`text-[10px] font-bold px-2 py-1 rounded-lg ${
                totalAgingBacklog > 50
                  ? 'bg-red-900/30 text-red-400'
                  : totalAgingBacklog > 20
                  ? 'bg-yellow-900/30 text-yellow-400'
                  : 'bg-emerald-900/30 text-emerald-400'
              }`}
            >
              {totalAgingBacklog} order
            </span>
          </div>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-6 bg-zinc-800 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <AgingBars aging={data?.aging ?? []} />
          )}
        </div>

        {/* Right side: payout + geo */}
        <div className="space-y-3">
          {canEdit && data?.payout && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Banknote size={13} className="text-emerald-400" />
                <p className="text-xs font-semibold text-zinc-300">Payout (range)</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] text-zinc-500">Order</p>
                  <p className="text-base font-bold text-white">{data.payout.count}</p>
                </div>
                <div>
                  <p className="text-[10px] text-zinc-500">Total Cair</p>
                  <p className="text-base font-bold text-emerald-400 font-mono">
                    {formatRupiah(data.payout.totalIncome, true)}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
            <div className="flex items-center gap-2 mb-2">
              <MapPin size={13} className="text-blue-400" />
              <p className="text-xs font-semibold text-zinc-300">Top Provinsi</p>
            </div>
            {isLoading ? (
              <div className="space-y-1.5">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-3 bg-zinc-800/40 rounded animate-pulse" />
                ))}
              </div>
            ) : (data?.geo?.topProvinces ?? []).length === 0 ? (
              <p className="text-[11px] text-zinc-600">Belum ada data</p>
            ) : (
              <ul className="space-y-1 max-h-[140px] overflow-y-auto">
                {data!.geo!.topProvinces.map((p, i) => (
                  <li
                    key={p.province}
                    className="flex items-center justify-between text-[11px]"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="text-zinc-700 w-3">{i + 1}</span>
                      <span className="text-zinc-400 truncate">{p.province}</span>
                    </span>
                    <span className="text-zinc-300 font-medium shrink-0">{p.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
            <div className="flex items-center gap-2 mb-2">
              <MapPin size={13} className="text-purple-400" />
              <p className="text-xs font-semibold text-zinc-300">Top Kota</p>
            </div>
            {isLoading ? (
              <div className="space-y-1.5">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-3 bg-zinc-800/40 rounded animate-pulse" />
                ))}
              </div>
            ) : (data?.geo?.topCities ?? []).length === 0 ? (
              <p className="text-[11px] text-zinc-600">Belum ada data</p>
            ) : (
              <ul className="space-y-1 max-h-[140px] overflow-y-auto">
                {data!.geo!.topCities.map((c, i) => (
                  <li
                    key={c.city}
                    className="flex items-center justify-between text-[11px]"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="text-zinc-700 w-3">{i + 1}</span>
                      <span className="text-zinc-400 truncate">{c.city}</span>
                    </span>
                    <span className="text-zinc-300 font-medium shrink-0">{c.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </SectionHeader>
  )
}
