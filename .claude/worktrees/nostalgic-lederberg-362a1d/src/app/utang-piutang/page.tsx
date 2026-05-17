'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { formatRupiah, formatDate } from '@/lib/utils'
import { useToast } from '@/components/ui/toaster'
import { CreditCard, Plus } from 'lucide-react'

const STATUS_COLOR: Record<string, string> = {
  OUTSTANDING: 'badge-danger', PARTIAL: 'badge-warning', PAID: 'badge-success', COLLECTED: 'badge-success',
}

function AddModal({ type, wallets, onClose }: { type: 'utang' | 'piutang'; wallets: any[]; onClose: () => void }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [form, setForm] = useState({
    type: type === 'utang' ? 'SUNTIKAN_MODAL' : 'PINJAMAN_KARYAWAN',
    name: '', sourceWalletId: '', amount: '', trxDate: new Date().toISOString().slice(0, 10), dueDate: '', note: '',
  })
  const [loading, setLoading] = useState(false)
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  const typeOptions = type === 'utang'
    ? ['SUNTIKAN_MODAL', 'PINJAMAN_BANK', 'PINJAMAN_PRIBADI', 'LAINNYA']
    : ['PINJAMAN_KARYAWAN', 'PO_VENDOR_BELUM_DIKIRIM', 'LAINNYA']

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/utang-piutang', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityType: type,
          type: form.type,
          [type === 'utang' ? 'creditorName' : 'debtorName']: form.name,
          sourceWalletId: form.sourceWalletId,
          amount: Number(form.amount),
          trxDate: form.trxDate,
          dueDate: form.dueDate || null,
          note: form.note,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ title: `${type === 'utang' ? 'Utang' : 'Piutang'} ditambahkan`, type: 'success' })
      qc.invalidateQueries({ queryKey: ['utang-piutang'] })
      onClose()
    } catch (err: any) {
      toast({ title: err.message || 'Gagal', type: 'error' })
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6">
        <h2 className="text-base font-semibold text-white mb-4">
          Tambah {type === 'utang' ? 'Utang' : 'Piutang'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Tipe</label>
            <select value={form.type} onChange={e => set('type', e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none">
              {typeOptions.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">{type === 'utang' ? 'Nama Kreditur' : 'Nama Debitur'} *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} required
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none"/>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Wallet *</label>
            <select value={form.sourceWalletId} onChange={e => set('sourceWalletId', e.target.value)} required
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none">
              <option value="">Pilih wallet</option>
              {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          {[
            { label: 'Jumlah (Rp) *', key: 'amount', type: 'number' },
            { label: 'Tanggal Transaksi', key: 'trxDate', type: 'date' },
            { label: 'Jatuh Tempo', key: 'dueDate', type: 'date' },
            { label: 'Catatan', key: 'note', type: 'text' },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-xs text-zinc-500 mb-1">{f.label}</label>
              <input type={f.type} value={(form as any)[f.key]} onChange={e => set(f.key, e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none"/>
            </div>
          ))}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg py-2 text-sm">Batal</button>
            <button type="submit" disabled={loading} className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-medium">
              {loading ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function UtangPiutangPage() {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [tab, setTab] = useState<'utang' | 'piutang'>('utang')
  const [modal, setModal] = useState<'utang' | 'piutang' | null>(null)

  const { data: wallets } = useQuery({
    queryKey: ['wallets'],
    queryFn: () => fetch('/api/wallet').then(r => r.json()).then(d => d.data ?? []),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['utang-piutang', tab],
    queryFn: () => fetch(`/api/utang-piutang?type=${tab}`).then(r => r.json()).then(d => d.data),
  })

  const items = tab === 'utang' ? (data?.utangs ?? []) : (data?.piutangs ?? [])
  const totalOutstanding = data?.totalOutstanding ?? 0

  return (
    <AppLayout>
      {modal && wallets && <AddModal type={modal} wallets={wallets} onClose={() => setModal(null)} />}
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2"><CreditCard size={22} className="text-emerald-400"/>Utang & Piutang</h1>
        <div className="flex gap-2">
          <button onClick={() => setModal('utang')} className="flex items-center gap-2 bg-red-800 hover:bg-red-700 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors">
            <Plus size={14}/> Utang
          </button>
          <button onClick={() => setModal('piutang')} className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors">
            <Plus size={14}/> Piutang
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-zinc-900 border border-zinc-800 rounded-xl p-1 w-fit">
        {(['utang', 'piutang'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${tab === t ? 'bg-emerald-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Summary */}
      <div className="stat-card mb-6 flex items-center justify-between">
        <div>
          <p className="text-zinc-500 text-xs mb-1">Total {tab} Outstanding</p>
          <p className={`text-2xl font-bold ${tab === 'utang' ? 'text-red-400' : 'text-emerald-400'}`}>
            {formatRupiah(totalOutstanding, true)}
          </p>
        </div>
        <CreditCard size={32} className={tab === 'utang' ? 'text-red-900' : 'text-emerald-900'} />
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="data-table w-full">
          <thead>
            <tr>
              <th>Nama</th><th className="w-28">Tipe</th><th className="w-28 text-right">Jumlah</th>
              <th className="w-28 text-right">Terbayar</th><th className="w-28 text-right">Sisa</th>
              <th className="w-24">Jatuh Tempo</th><th className="w-24">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? Array.from({length:4}).map((_,i)=>(
              <tr key={i}>{Array.from({length:7}).map((_,j)=><td key={j}><div className="h-4 bg-zinc-800 rounded animate-pulse"/></td>)}</tr>
            )) : items.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-10 text-zinc-600">Tidak ada data {tab}</td></tr>
            ) : items.map((item: any) => {
              const paid = tab === 'utang' ? item.amountPaid : item.amountCollected
              const sisa = item.amount - paid
              return (
                <tr key={item.id}>
                  <td>
                    <p className="text-sm text-zinc-200">{item.creditorName || item.debtorName}</p>
                    <p className="text-[10px] text-zinc-600">{item.sourceWalletName}</p>
                  </td>
                  <td><span className="text-xs text-zinc-400">{item.type?.replace(/_/g,' ')}</span></td>
                  <td className="text-right text-xs text-zinc-300">{formatRupiah(item.amount, true)}</td>
                  <td className="text-right text-xs text-emerald-400">{formatRupiah(paid, true)}</td>
                  <td className={`text-right text-xs font-medium ${sisa > 0 ? (tab==='utang' ? 'text-red-400' : 'text-yellow-400') : 'text-zinc-600'}`}>
                    {sisa > 0 ? formatRupiah(sisa, true) : '—'}
                  </td>
                  <td className="text-xs text-zinc-400">{item.dueDate ? formatDate(item.dueDate) : '—'}</td>
                  <td><span className={STATUS_COLOR[item.status] || 'badge-muted'}>{item.status}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </AppLayout>
  )
}
