'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle, Package, Clock, RefreshCw,
  ShoppingCart, ChevronRight, TrendingDown,
} from 'lucide-react'
import { formatRupiah } from '@/lib/utils'

function formatHoursPending(hours: number): string {
  if (hours < 24) return `${hours} jam`
  const days = Math.floor(hours / 24)
  const rem = hours % 24
  return rem > 0 ? `${days} hari ${rem} jam` : `${days} hari`
}

function SummaryCard({
  label, count, color, icon: Icon,
}: {
  label: string
  count: number
  color: 'red' | 'orange' | 'yellow' | 'emerald'
  icon: React.ElementType
}) {
  const colorMap = {
    red:     { bg: 'bg-red-900/30 border-red-800/50',     text: 'text-red-400',     icon: 'text-red-500' },
    orange:  { bg: 'bg-orange-900/30 border-orange-800/50', text: 'text-orange-400', icon: 'text-orange-500' },
    yellow:  { bg: 'bg-yellow-900/30 border-yellow-800/50', text: 'text-yellow-400', icon: 'text-yellow-500' },
    emerald: { bg: 'bg-emerald-900/30 border-emerald-800/50', text: 'text-emerald-400', icon: 'text-emerald-500' },
  }
  const c = colorMap[color]

  return (
    <div className={`${c.bg} border rounded-xl p-4 flex items-center gap-4`}>
      <div className={`${c.icon} opacity-80`}>
        <Icon size={22} />
      </div>
      <div>
        <p className={`text-2xl font-bold ${c.text}`}>{count.toLocaleString('id')}</p>
        <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
      </div>
    </div>
  )
}

export default function AlertsPage() {
  const router = useRouter()
  const [stockTab, setStockTab] = useState<'empty' | 'low'>('empty')

  const { data, isLoading, refetch, isRefetching, dataUpdatedAt } = useQuery({
    queryKey: ['alerts'],
    queryFn: () => fetch('/api/alerts').then(r => r.json()).then(d => d.data),
    refetchInterval: 300_000, // 5 menit
  })

  const summary = data?.summary ?? { emptyCount: 0, lowCount: 0, overdue24h: 0, overdue48h: 0 }
  const stockEmpty: any[] = data?.stockEmpty ?? []
  const stockLow: any[]   = data?.stockLow ?? []
  const orderOverdue: any[] = data?.orderOverdue ?? []

  const activeStock = stockTab === 'empty' ? stockEmpty : stockLow

  const lastRefreshStr = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    : '—'

  return (
    <AppLayout>
      {/* Header */}
      <div className="page-header mb-6">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <AlertTriangle size={22} className="text-amber-400" />
            Sistem Alerts
          </h1>
          <p className="text-zinc-500 text-sm mt-0.5">Auto-refresh setiap 5 menit • Terakhir: {lastRefreshStr}</p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isRefetching}
          className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg px-3 py-2 text-sm transition-colors border border-zinc-700"
        >
          <RefreshCw size={14} className={isRefetching ? 'animate-spin' : ''} />
          {isRefetching ? 'Memuat...' : 'Refresh'}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <SummaryCard label="Stok Habis" count={summary.emptyCount} color="red" icon={Package} />
        <SummaryCard label="Stok Kritis" count={summary.lowCount} color="orange" icon={TrendingDown} />
        <SummaryCard label="Order > 48 Jam" count={summary.overdue48h} color="red" icon={Clock} />
        <SummaryCard label="Order > 24 Jam" count={summary.overdue24h} color="yellow" icon={ShoppingCart} />
      </div>

      {/* ── SECTION 1: Stok ─────────────────────────────── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl mb-6 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Package size={16} className="text-orange-400" />
            <h2 className="text-sm font-semibold text-zinc-200">Alert Stok Menipis</h2>
          </div>
          {/* Tabs */}
          <div className="flex rounded-lg overflow-hidden border border-zinc-700">
            <button
              onClick={() => setStockTab('empty')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                stockTab === 'empty'
                  ? 'bg-red-900/50 text-red-400'
                  : 'bg-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Stok Habis ({summary.emptyCount})
            </button>
            <button
              onClick={() => setStockTab('low')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-zinc-700 ${
                stockTab === 'low'
                  ? 'bg-orange-900/50 text-orange-400'
                  : 'bg-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Stok Kritis ({summary.lowCount})
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th className="w-28">SKU</th>
                <th>Nama Produk</th>
                <th className="w-28">Kategori</th>
                <th className="w-16 text-center">SOH</th>
                <th className="w-16 text-center">ROP</th>
                <th className="w-28 text-right">HPP</th>
                <th className="w-20 text-center">Lead Time</th>
                <th className="w-20 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? Array.from({length: 5}).map((_,i) => (
                <tr key={i}>{Array.from({length:8}).map((_,j) => <td key={j}><div className="h-4 bg-zinc-800 rounded animate-pulse"/></td>)}</tr>
              )) : activeStock.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-10 text-zinc-600">
                  {stockTab === 'empty' ? '🎉 Tidak ada produk dengan stok habis' : '✅ Semua stok di atas ROP'}
                </td></tr>
              ) : activeStock.map((p: any) => (
                <tr key={p.sku}>
                  <td><span className="font-mono text-xs text-emerald-400">{p.sku}</span></td>
                  <td><p className="text-xs text-zinc-200">{p.productName}</p></td>
                  <td><span className="text-xs text-zinc-500">{p.categoryName}</span></td>
                  <td className="text-center">
                    <span className={`text-sm font-bold ${p.soh <= 0 ? 'text-red-400' : 'text-orange-400'}`}>
                      {p.soh}
                    </span>
                  </td>
                  <td className="text-center text-xs text-zinc-400">{p.rop}</td>
                  <td className="text-right text-xs text-zinc-400">{formatRupiah(p.hpp, true)}</td>
                  <td className="text-center text-xs text-zinc-500">{p.leadTimeDays}h</td>
                  <td className="text-center">
                    <button
                      onClick={() => router.push('/purchase-orders')}
                      className="inline-flex items-center gap-1 text-[10px] bg-emerald-900/40 text-emerald-400 hover:bg-emerald-800/50 border border-emerald-800/50 px-2 py-1 rounded-lg transition-colors"
                    >
                      Buat PO <ChevronRight size={10} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── SECTION 2: Order Anomali ──────────────────────── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-zinc-800">
          <Clock size={16} className="text-red-400" />
          <h2 className="text-sm font-semibold text-zinc-200">Order Anomali</h2>
          <span className="text-xs text-zinc-500">— belum dikirim lebih dari 24 jam</span>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>No. Order</th>
                <th className="w-24">Platform</th>
                <th className="w-28">SKU</th>
                <th>Penerima</th>
                <th className="w-24">Kota</th>
                <th className="w-28 text-center">Jam Pending</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? Array.from({length: 5}).map((_,i) => (
                <tr key={i}>{Array.from({length:7}).map((_,j) => <td key={j}><div className="h-4 bg-zinc-800 rounded animate-pulse"/></td>)}</tr>
              )) : orderOverdue.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-zinc-600">
                  🎉 Tidak ada order yang tertunda lebih dari 24 jam
                </td></tr>
              ) : orderOverdue.map((o: any) => {
                const isOver48 = o.hoursPending > 48
                const isOver24 = o.hoursPending > 24
                const pendingColor = isOver48 ? 'text-red-400 bg-red-900/20 border-red-800/40'
                  : isOver24 ? 'text-orange-400 bg-orange-900/20 border-orange-800/40'
                  : 'text-yellow-400 bg-yellow-900/20 border-yellow-800/40'

                return (
                  <tr key={o.id} className={isOver48 ? 'bg-red-950/10' : ''}>
                    <td><span className="font-mono text-xs text-zinc-300">{o.orderNo}</span></td>
                    <td>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        o.platform === 'TikTok' ? 'bg-pink-900/30 text-pink-400' :
                        o.platform === 'Shopee' ? 'bg-orange-900/30 text-orange-400' :
                        'bg-zinc-800 text-zinc-400'
                      }`}>{o.platform || '—'}</span>
                    </td>
                    <td><span className="font-mono text-xs text-zinc-500">{o.sku || '—'}</span></td>
                    <td className="text-xs text-zinc-300">{o.receiverName || '—'}</td>
                    <td className="text-xs text-zinc-500">{o.city || '—'}</td>
                    <td className="text-center">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded border ${pendingColor}`}>
                        {formatHoursPending(o.hoursPending)}
                      </span>
                    </td>
                    <td>
                      <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded truncate max-w-[140px] inline-block">
                        {o.status}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  )
}
