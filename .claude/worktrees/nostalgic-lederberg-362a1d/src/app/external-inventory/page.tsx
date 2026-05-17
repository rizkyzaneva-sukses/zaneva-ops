'use client'

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Package, Search } from 'lucide-react'

export default function ExternalInventoryPage() {
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['inventory-external', search],
    queryFn: () => {
      const p = new URLSearchParams({ search })
      return fetch(`/api/inventory?${p}`).then(r => r.json()).then(d => d.data)
    },
  })

  const products = (data?.products ?? []).filter((p: any) => p.soh > 0)

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <span className="text-sm font-bold text-emerald-400">Z</span>
          </div>
          <h1 className="text-xl font-bold text-white">Daftar Stok</h1>
        </div>
        <p className="text-zinc-500 text-sm">{products.length} produk tersedia</p>
      </div>

      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"/>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari SKU atau nama produk..."
          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-8 pr-3 py-2.5 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"/>
      </div>

      <div className="space-y-2">
        {isLoading ? Array.from({length:6}).map((_,i) => (
          <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 animate-pulse h-16"/>
        )) : products.length === 0 ? (
          <div className="text-center py-12 text-zinc-600">
            <Package size={32} className="mx-auto mb-2 opacity-30"/>
            <p>Tidak ada stok tersedia</p>
          </div>
        ) : products.map((p: any) => (
          <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-200 font-medium">{p.productName}</p>
              <p className="text-[10px] font-mono text-zinc-500">{p.sku}</p>
            </div>
            <div className="text-right">
              <p className={`text-lg font-bold ${p.isBelowRop ? 'text-yellow-400' : 'text-emerald-400'}`}>{p.soh}</p>
              <p className="text-[10px] text-zinc-600">{p.unit}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
