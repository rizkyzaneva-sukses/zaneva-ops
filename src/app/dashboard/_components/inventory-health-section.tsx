'use client'

import { useQuery } from '@tanstack/react-query'
import {
  Boxes,
  Skull,
  Snail,
  AlertTriangle,
  Package,
} from 'lucide-react'
import Link from 'next/link'
import { formatRupiah, formatDate } from '@/lib/utils'
import { SectionHeader } from './section-header'

interface InventoryHealth {
  summary: {
    totalValue: number
    activeSku: number
    skuWithStock: number
    skuZero: number
    skuMinus: number
    turnover: number
    dsi: number | null
    cogs90: number
  }
  deadStock: { sku: string; nama: string; soh: number; hpp: number; tiedUp: number; lastSale: string | null }[]
  slowMover: { sku: string; nama: string; soh: number; hpp: number; sales30d: number; tiedUp: number }[]
  lowStock: { sku: string; nama: string; soh: number; rop: number; hpp: number }[]
}

function InvStat({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string
  value: string
  hint?: string
  tone?: 'default' | 'good' | 'warn' | 'bad'
}) {
  const toneMap = {
    default: 'text-zinc-100',
    good: 'text-emerald-300',
    warn: 'text-orange-300',
    bad: 'text-red-300',
  }
  return (
    <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 p-2">
      <p className="text-[10px] text-zinc-500 uppercase tracking-wide">{label}</p>
      <p className={`text-base font-bold ${toneMap[tone]} font-mono leading-tight`}>{value}</p>
      {hint && <p className="text-[10px] text-zinc-600 mt-0.5">{hint}</p>}
    </div>
  )
}

function ProductRow({
  nama,
  sku,
  soh,
  detail,
  amount,
  amountLabel,
  tone = 'default',
}: {
  nama: string
  sku: string
  soh: number
  detail?: string
  amount: number
  amountLabel?: string
  tone?: 'default' | 'red' | 'orange'
}) {
  const toneMap = {
    default: 'text-zinc-200',
    red: 'text-red-300',
    orange: 'text-orange-300',
  }
  return (
    <li className="flex items-center justify-between gap-2 py-1.5 border-b border-zinc-900 last:border-0 min-w-0">
      <div className="min-w-0 flex-1">
        <p className="text-[12px] text-zinc-200 truncate">{nama}</p>
        <p className="text-[10px] text-zinc-500 truncate">
          <span className="font-mono">{sku}</span> · SOH {soh}
          {detail && ` · ${detail}`}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className={`text-[12px] font-mono ${toneMap[tone]}`}>{formatRupiah(amount, true)}</p>
        {amountLabel && <p className="text-[9px] text-zinc-600">{amountLabel}</p>}
      </div>
    </li>
  )
}

export function InventoryHealthSection({ enabled = true }: { enabled?: boolean }) {
  const { data, isLoading } = useQuery<InventoryHealth>({
    queryKey: ['dashboard', 'inventory-health'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard/inventory-health', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed')
      return json.data
    },
    enabled,
    staleTime: 5 * 60_000, // inv health bisa di-cache lebih lama
    refetchOnWindowFocus: false,
  })

  return (
    <SectionHeader
      icon={Boxes}
      title="Kesehatan Inventory"
      description="Nilai stok, turnover, dead stock & slow mover"
      collapsible
      storageKey="dash.section.inventory"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Kiri: Summary card */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 space-y-3">
          <div className="flex items-center gap-2">
            <Package size={13} className="text-cyan-400" />
            <h3 className="text-xs font-semibold text-zinc-300">Ringkasan</h3>
          </div>
          {isLoading || !data ? (
            <div className="h-40 bg-zinc-800/30 rounded-lg animate-pulse" />
          ) : (
            <>
              <div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wide">Nilai Inventory</p>
                <p className="text-2xl font-bold text-zinc-100 font-mono leading-tight">
                  {formatRupiah(data.summary.totalValue)}
                </p>
                <p className="text-[10px] text-zinc-500 mt-0.5">
                  {data.summary.skuWithStock}/{data.summary.activeSku} SKU ada stok
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <InvStat
                  label="Turnover"
                  value={`${data.summary.turnover}×`}
                  hint="per tahun (annualized)"
                  tone={
                    data.summary.turnover >= 4
                      ? 'good'
                      : data.summary.turnover >= 2
                      ? 'default'
                      : 'warn'
                  }
                />
                <InvStat
                  label="DSI"
                  value={data.summary.dsi === null ? '—' : `${data.summary.dsi}h`}
                  hint="Days sales of inventory"
                  tone={
                    data.summary.dsi === null
                      ? 'default'
                      : data.summary.dsi <= 60
                      ? 'good'
                      : data.summary.dsi <= 120
                      ? 'default'
                      : 'warn'
                  }
                />
                <InvStat
                  label="Stok Habis"
                  value={String(data.summary.skuZero)}
                  hint="SKU dengan SOH 0"
                  tone={data.summary.skuZero > 5 ? 'warn' : 'default'}
                />
                <InvStat
                  label="Stok Minus"
                  value={String(data.summary.skuMinus)}
                  hint="butuh opname"
                  tone={data.summary.skuMinus > 0 ? 'bad' : 'default'}
                />
              </div>
              <Link
                href="/inventory"
                className="block text-center text-[11px] text-zinc-400 hover:text-zinc-200 pt-1 border-t border-zinc-800"
              >
                Buka inventory →
              </Link>
            </>
          )}
        </div>

        {/* Tengah: Dead stock */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Skull size={13} className="text-red-400" />
            <h3 className="text-xs font-semibold text-zinc-300">Dead Stock</h3>
            <span className="text-[10px] text-zinc-600">≥ 60 hari tanpa sale</span>
          </div>
          {isLoading || !data ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-8 bg-zinc-800/30 rounded animate-pulse" />
              ))}
            </div>
          ) : data.deadStock.length === 0 ? (
            <p className="text-[11px] text-emerald-400/70 py-4 text-center">
              ✨ Tidak ada dead stock
            </p>
          ) : (
            <ul>
              {data.deadStock.map((p) => (
                <ProductRow
                  key={p.sku}
                  nama={p.nama}
                  sku={p.sku}
                  soh={p.soh}
                  detail={
                    p.lastSale
                      ? `terakhir ${formatDate(p.lastSale)}`
                      : 'belum pernah terjual'
                  }
                  amount={p.tiedUp}
                  amountLabel="modal terikat"
                  tone="red"
                />
              ))}
            </ul>
          )}
        </div>

        {/* Kanan: Slow mover + Low stock */}
        <div className="space-y-3">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
            <div className="flex items-center gap-2 mb-2">
              <Snail size={13} className="text-orange-400" />
              <h3 className="text-xs font-semibold text-zinc-300">Slow Mover</h3>
              <span className="text-[10px] text-zinc-600">{'<5 sales/30h, SOH>30'}</span>
            </div>
            {isLoading || !data ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-8 bg-zinc-800/30 rounded animate-pulse" />
                ))}
              </div>
            ) : data.slowMover.length === 0 ? (
              <p className="text-[11px] text-emerald-400/70 py-3 text-center">
                Tidak ada slow mover
              </p>
            ) : (
              <ul>
                {data.slowMover.slice(0, 5).map((p) => (
                  <ProductRow
                    key={p.sku}
                    nama={p.nama}
                    sku={p.sku}
                    soh={p.soh}
                    detail={`${p.sales30d} sale/30h`}
                    amount={p.tiedUp}
                    tone="orange"
                  />
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={13} className="text-yellow-400" />
              <h3 className="text-xs font-semibold text-zinc-300">Stok di Bawah ROP</h3>
            </div>
            {isLoading || !data ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <div key={i} className="h-8 bg-zinc-800/30 rounded animate-pulse" />
                ))}
              </div>
            ) : data.lowStock.length === 0 ? (
              <p className="text-[11px] text-emerald-400/70 py-3 text-center">
                ROP terjaga
              </p>
            ) : (
              <ul>
                {data.lowStock.slice(0, 5).map((p) => (
                  <ProductRow
                    key={p.sku}
                    nama={p.nama}
                    sku={p.sku}
                    soh={p.soh}
                    detail={`ROP ${p.rop}`}
                    amount={p.soh - p.rop}
                    amountLabel="selisih"
                    tone="orange"
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </SectionHeader>
  )
}
