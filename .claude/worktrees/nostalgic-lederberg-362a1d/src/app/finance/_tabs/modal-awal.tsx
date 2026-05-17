'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { formatRupiah, formatDate } from '@/lib/utils'
import { useToast } from '@/components/ui/toaster'
import { useAuth } from '@/components/providers'
import { Plus } from 'lucide-react'

export function ModalAwalTab() {
  const { user } = useAuth(); const { toast } = useToast(); const qc = useQueryClient()
  const [form, setForm] = useState({ walletId:'', jumlah:'', tanggalSetup:new Date().toISOString().slice(0,10), note:'' })
  const [loading, setLoading] = useState(false)

  const { data, isLoading } = useQuery({ queryKey:['modal-awal'], queryFn: async () => fetch('/api/modal-awal').then(r=>r.json()).then(d=>d.data) })
  const walletsWithoutModal = data?.walletsWithoutModal ?? []
  const modals = data?.modals ?? []

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.walletId || !form.jumlah) return toast({ title:'Data belum lengkap', type:'error' })
    setLoading(true)
    try {
      const res = await fetch('/api/modal-awal', { method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify([{walletId:form.walletId, jumlah:parseInt(form.jumlah), tanggalSetup:form.tanggalSetup, note:form.note}]) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ title:'Modal awal berhasil disetup', type:'success' })
      qc.invalidateQueries({ queryKey:['modal-awal'] })
      setForm({...form, walletId:'', jumlah:'', note:''})
    } catch (err:any) { toast({ title:err.message||'Gagal', type:'error' })
    } finally { setLoading(false) }
  }

  if (user?.userRole !== 'OWNER') {
    return <div className="flex items-center justify-center h-48"><p className="text-zinc-500">Akses ditolak. Fitur ini hanya untuk Owner.</p></div>
  }

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1 border border-zinc-800 bg-zinc-900 rounded-xl p-5 h-fit">
        <h2 className="text-sm font-semibold text-white mb-4">Set Modal Baru</h2>
        {walletsWithoutModal.length === 0 ? (
          <p className="text-sm text-zinc-500 text-center py-4">Semua dompet aktif sudah memiliki modal awal.</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Dompet (Wallet) *</label>
              <select value={form.walletId} onChange={e => setForm(p=>({...p,walletId:e.target.value}))} required
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none">
                <option value="">-- Pilih Wallet --</option>
                {walletsWithoutModal.map((w:any) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Jumlah Modal (Rp) *</label>
              <input required type="number" min="0" value={form.jumlah} onChange={e => setForm(p=>({...p,jumlah:e.target.value}))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Tanggal Setup *</label>
              <input required type="date" value={form.tanggalSetup} onChange={e => setForm(p=>({...p,tanggalSetup:e.target.value}))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none [&::-webkit-calendar-picker-indicator]:invert-[0.6]" />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Catatan</label>
              <input type="text" value={form.note} onChange={e => setForm(p=>({...p,note:e.target.value}))} placeholder="Opsional"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg py-2.5 text-sm font-medium">
              <Plus size={16}/>Simpan Modal Awal
            </button>
          </form>
        )}
      </div>
      <div className="lg:col-span-2 border border-zinc-800 bg-zinc-900 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-zinc-800"><h2 className="text-sm font-semibold text-white">History Setup Modal Awal</h2></div>
        <table className="data-table">
          <thead><tr><th>Wallet</th><th>Tanggal Setup</th><th className="text-right">Jumlah</th><th>Catatan</th></tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={4} className="text-center py-6 text-zinc-500">Memuat...</td></tr>
            : modals.length === 0 ? <tr><td colSpan={4} className="text-center py-6 text-zinc-500">Belum ada modal awal yang dikonfigurasi.</td></tr>
            : modals.map((m:any) => (
              <tr key={m.id}>
                <td className="font-medium text-white">{m.wallet?.name}</td>
                <td className="text-zinc-400">{formatDate(m.tanggalSetup)}</td>
                <td className="text-right text-emerald-400 font-medium">{formatRupiah(m.jumlah, true)}</td>
                <td className="text-sm text-zinc-500">{m.note||'-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
