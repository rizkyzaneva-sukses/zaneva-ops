'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useQuery } from '@tanstack/react-query'
import { CreditCard, Download, Search } from 'lucide-react'
import { formatDate, formatRupiah } from '@/lib/utils'
import { useState } from 'react'

export default function VendorPaymentsPage() {
  const [page, setPage] = useState(1)
  const { data, isLoading } = useQuery({
    queryKey: ['vendor-payments', page],
    queryFn: async () => {
      const res = await fetch(`/api/vendor-payments?page=${page}&limit=50`)
      return res.json().then(d => d.data)
    }
  })

  const payments = data?.payments ?? []

  return (
    <AppLayout>
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2">
          <CreditCard size={22} className="text-emerald-400" />
          Pembayaran Vendor
        </h1>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg px-3 py-2 text-sm transition-colors border border-zinc-700">
            <Download size={14} /> Export
          </button>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th className="w-32">Tanggal Bayar</th>
                <th className="w-40">Vendor</th>
                <th className="w-32">No. PO</th>
                <th className="w-32">Wallet</th>
                <th className="w-32 text-right">Jumlah</th>
                <th className="w-24 text-center">Tipe</th>
                <th className="w-24 text-center">Status</th>
                <th>Catatan</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="text-center py-10 text-zinc-600">Loading...</td></tr>
              ) : payments.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-10 text-zinc-600">Belum ada riwayat pembayaran vendor</td></tr>
              ) : (
                payments.map((p: any) => (
                  <tr key={p.id}>
                    <td className="text-xs text-zinc-400">{formatDate(p.paymentDate, 'datetime')}</td>
                    <td className="text-sm text-zinc-200">{p.vendorName}</td>
                    <td><span className="font-mono text-xs text-zinc-400">{p.poNumber || '—'}</span></td>
                    <td className="text-xs text-zinc-400">{p.walletName}</td>
                    <td className="text-right text-sm font-bold text-emerald-400">{formatRupiah(p.amount, true)}</td>
                    <td className="text-center"><span className="text-[10px] bg-zinc-800 text-zinc-300 px-2 py-1 rounded">{p.paymentType}</span></td>
                    <td className="text-center">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${p.status === 'COMPLETED' ? 'bg-emerald-900/40 text-emerald-400' : 'bg-yellow-900/40 text-yellow-500'}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="text-xs text-zinc-500 truncate max-w-[150px]">{p.note || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  )
}
