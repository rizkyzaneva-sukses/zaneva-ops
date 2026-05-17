'use client'

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { formatDate } from '@/lib/utils'
import { ArrowRightLeft, ChevronLeft, ChevronRight } from 'lucide-react'

export function LedgerTab() {
  const [page, setPage] = useState(1)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')
  const limit = 50

  const { data, isLoading } = useQuery({
    queryKey: ['inventory-ledger-global', page, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (dateFrom) params.append('dateFrom', dateFrom)
      if (dateTo)   params.append('dateTo', dateTo)
      const res = await fetch(`/api/inventory/ledger?${params}`)
      return res.json().then(d => d.data)
    },
  })

  const entries    = data?.ledger ?? []
  const total      = data?.total ?? 0
  const totalPages = Math.ceil(total / limit)

  return (
    <>
      <div className="mb-1">
        <p className="text-zinc-500 text-sm">Laporan mutasi semua stok secara kronologis</p>
      </div>

      <div className="flex gap-3 mb-4 mt-3">
        <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none [&::-webkit-calendar-picker-indicator]:invert-[0.6]" />
        <span className="text-zinc-600 flex items-center">-</span>
        <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none [&::-webkit-calendar-picker-indicator]:invert-[0.6]" />
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(''); setDateTo(''); setPage(1) }} className="text-xs text-zinc-500 hover:text-zinc-300">✕ Reset</button>
        )}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table w-full">
            <thead><tr>
              <th className="w-32">Waktu</th>
              <th className="w-40">SKU</th>
              <th>Nama Produk</th>
              <th className="w-24 text-center">Tipe</th>
              <th className="w-28 text-center">Mutasi</th>
              <th className="w-32">Kategori Transaksi</th>
              <th>Catatan</th>
              <th className="w-24">PIC</th>
            </tr></thead>
            <tbody>
              {isLoading ? Array.from({ length: 15 }).map((_, i) => (
                <tr key={i}>{Array.from({ length: 8 }).map((_, j) => <td key={j}><div className="h-4 bg-zinc-800 rounded animate-pulse" /></td>)}</tr>
              )) : entries.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-16 text-zinc-600">
                  <ArrowRightLeft size={32} className="mx-auto mb-2 opacity-30" />
                  Belum ada riwayat mutasi stok.
                </td></tr>
              ) : entries.map((l: any) => (
                <tr key={l.id}>
                  <td className="text-[10px] text-zinc-400">{formatDate(l.trxDate, 'datetime')}</td>
                  <td><span className="font-mono text-xs text-zinc-400">{l.sku}</span></td>
                  <td className="text-sm text-zinc-200">{l.product?.productName || '—'}</td>
                  <td className="text-center">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${l.direction === 'IN' ? 'bg-emerald-900/40 text-emerald-400' : 'bg-red-900/40 text-red-400'}`}>{l.direction}</span>
                  </td>
                  <td className="text-center font-bold text-sm text-zinc-200">{l.qty}</td>
                  <td><span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-1 rounded">{l.reason}</span></td>
                  <td className="text-xs text-zinc-500 truncate max-w-[200px]" title={l.note}>{l.note || '-'}</td>
                  <td className="text-xs text-zinc-500">{l.createdBy || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800">
            <p className="text-xs text-zinc-500">{total} record</p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1.5 rounded bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30"><ChevronLeft size={14} /></button>
              <span className="text-xs text-zinc-400 px-2">{page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="p-1.5 rounded bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30"><ChevronRight size={14} /></button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
