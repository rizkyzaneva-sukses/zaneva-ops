'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { formatRupiah } from '@/lib/utils'
import { Users, Search, ChevronLeft, ChevronRight, Star } from 'lucide-react'

export default function CRMPage() {
  const [search, setSearch] = useState('')
  const [platform, setPlatform] = useState('')
  const [page, setPage] = useState(1)
  const limit = 30

  const { data, isLoading } = useQuery({
    queryKey: ['crm', search, platform, page],
    queryFn: () => {
      const p = new URLSearchParams({ search, platform, page: String(page), limit: String(limit) })
      return fetch(`/api/crm?${p}`).then(r => r.json()).then(d => d.data)
    },
  })

  const buyers = data?.buyers ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / limit)

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2"><Users size={22} className="text-emerald-400"/>CRM</h1>
          <p className="text-zinc-500 text-sm mt-0.5">{total.toLocaleString('id')} pelanggan unik</p>
        </div>
      </div>

      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"/>
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Cari nama penerima atau username..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"/>
        </div>
        <select value={platform} onChange={e => { setPlatform(e.target.value); setPage(1) }}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-400 focus:outline-none">
          <option value="">Semua Platform</option>
          <option>TikTok</option><option>Shopee</option>
        </select>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-8">#</th>
                <th>Nama Penerima</th>
                <th className="w-36">Username</th>
                <th className="w-24">Platform</th>
                <th className="w-28">Kota</th>
                <th className="w-20 text-center">Orders</th>
                <th className="w-28 text-right">Total Omzet</th>
                <th className="w-28">Order Terakhir</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? Array.from({length:8}).map((_,i)=>(
                <tr key={i}>{Array.from({length:8}).map((_,j)=><td key={j}><div className="h-4 bg-zinc-800 rounded animate-pulse"/></td>)}</tr>
              )) : buyers.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-zinc-600">
                  <Users size={32} className="mx-auto mb-2 opacity-30"/>
                  <p>Tidak ada data pelanggan</p>
                </td></tr>
              ) : buyers.map((b: any, i: number) => (
                <tr key={`${b.receiver_name}-${b.buyer_username}-${i}`}>
                  <td className="text-zinc-600 text-xs">{(page-1)*limit + i + 1}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-zinc-200 font-medium">{b.receiver_name || b.buyer_username || '—'}</p>
                      {b.totalOrders >= 3 && (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-900/40 text-emerald-400 border border-emerald-800/50 px-1.5 py-0.5 rounded-full font-medium">
                          <Star size={8} className="fill-current" />
                          Repeat Buyer
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className="text-xs text-zinc-500 font-mono">{b.buyer_username || '—'}</span>
                  </td>
                  <td>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      b.platform === 'TikTok' ? 'bg-pink-900/30 text-pink-400' :
                      b.platform === 'Shopee' ? 'bg-orange-900/30 text-orange-400' : 'bg-zinc-800 text-zinc-400'
                    }`}>{b.platform}</span>
                  </td>
                  <td className="text-xs text-zinc-400">{b.city || '—'}</td>
                  <td className="text-center">
                    <span className={`text-sm font-bold ${b.totalOrders >= 3 ? 'text-emerald-400' : 'text-zinc-300'}`}>{b.totalOrders}</span>
                  </td>
                  <td className="text-right text-xs font-medium text-emerald-400">{formatRupiah(b.totalOmzet, true)}</td>
                  <td className="text-[10px] text-zinc-500">{b.last_order_date?.slice(0,10) || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800">
            <p className="text-xs text-zinc-500">{total} pelanggan</p>
            <div className="flex gap-1 items-center">
              <button onClick={() => setPage(p=>Math.max(1,p-1))} disabled={page===1} className="p-1.5 rounded bg-zinc-800 text-zinc-400 disabled:opacity-30"><ChevronLeft size={14}/></button>
              <span className="text-xs text-zinc-400 px-2">{page}/{totalPages}</span>
              <button onClick={() => setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages} className="p-1.5 rounded bg-zinc-800 text-zinc-400 disabled:opacity-30"><ChevronRight size={14}/></button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
