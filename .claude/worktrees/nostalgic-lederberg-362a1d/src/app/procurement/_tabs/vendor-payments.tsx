'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { formatDate, formatRupiah } from '@/lib/utils'
import { Plus, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { PayVendorModal } from '@/components/ui/pay-vendor-modal'

const PAYMENT_TYPE_LABEL: Record<string, string> = { DP:'DP', PARTIAL:'Partial', PELUNASAN:'Pelunasan' }
const PAYMENT_TYPE_COLOR: Record<string, string> = {
  DP: 'bg-blue-900/40 text-blue-400', PARTIAL: 'bg-yellow-900/40 text-yellow-400', PELUNASAN: 'bg-emerald-900/40 text-emerald-400',
}

export function VendorPaymentsTab() {
  const [page, setPage]           = useState(1)
  const [search, setSearch]       = useState('')
  const [showModal, setShowModal] = useState(false)
  const limit = 30

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['vendor-payments', page, search],
    queryFn: async () => {
      const p = new URLSearchParams({ page: String(page), limit: String(limit) })
      return fetch(`/api/vendor-payments?${p}`).then(r => r.json()).then(d => d.data)
    }
  })

  const payments   = data?.payments ?? []
  const total      = data?.total ?? 0
  const totalPages = Math.ceil(total / limit)

  return (
    <>
      {showModal && <PayVendorModal onClose={() => setShowModal(false)} onSuccess={() => refetch()} />}

      <div className="flex items-center justify-between mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Cari vendor atau no. PO..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg px-3 py-2 text-sm font-medium ml-3">
          <Plus size={14}/>Bayar Vendor
        </button>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table w-full">
            <thead><tr>
              <th className="w-28">Tanggal</th><th>Vendor</th><th className="w-36">No. PO</th>
              <th className="w-28">Wallet</th><th className="w-32 text-right">Jumlah</th>
              <th className="w-24 text-center">Tipe</th><th className="w-24 text-center">Status</th><th>Catatan</th>
            </tr></thead>
            <tbody>
              {isLoading ? Array.from({length:6}).map((_,i) => (
                <tr key={i}>{Array.from({length:8}).map((_,j) => <td key={j}><div className="h-4 bg-zinc-800 rounded animate-pulse"/></td>)}</tr>
              )) : payments.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-zinc-600">
                  <p>Belum ada riwayat pembayaran vendor</p>
                  <button onClick={() => setShowModal(true)} className="mt-3 text-emerald-400 hover:text-emerald-300 text-sm underline">+ Bayar Vendor sekarang</button>
                </td></tr>
              ) : payments.map((p:any) => (
                <tr key={p.id}>
                  <td className="text-xs text-zinc-400">{formatDate(p.paymentDate, 'short')}</td>
                  <td><p className="text-sm text-zinc-200 font-medium">{p.vendorName}</p></td>
                  <td><span className="font-mono text-xs text-zinc-400">{p.poNumber||'—'}</span></td>
                  <td className="text-xs text-zinc-400">{p.walletName}</td>
                  <td className="text-right text-sm font-bold text-emerald-400">{formatRupiah(p.amount, true)}</td>
                  <td className="text-center">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${PAYMENT_TYPE_COLOR[p.paymentType]??'bg-zinc-800 text-zinc-400'}`}>
                      {PAYMENT_TYPE_LABEL[p.paymentType]??p.paymentType}
                    </span>
                  </td>
                  <td className="text-center">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${p.status==='COMPLETED'?'bg-emerald-900/40 text-emerald-400':p.status==='CANCELLED'?'bg-red-900/40 text-red-400':'bg-yellow-900/40 text-yellow-500'}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="text-xs text-zinc-500 truncate max-w-[150px]">{p.note||'—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800">
            <p className="text-xs text-zinc-500">{total} pembayaran</p>
            <div className="flex gap-1 items-center">
              <button onClick={() => setPage(p=>Math.max(1,p-1))} disabled={page===1} className="p-1.5 rounded bg-zinc-800 text-zinc-400 disabled:opacity-30"><ChevronLeft size={14}/></button>
              <span className="text-xs text-zinc-400 px-2">{page}/{totalPages}</span>
              <button onClick={() => setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages} className="p-1.5 rounded bg-zinc-800 text-zinc-400 disabled:opacity-30"><ChevronRight size={14}/></button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
