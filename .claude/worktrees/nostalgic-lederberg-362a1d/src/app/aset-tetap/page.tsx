'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { formatRupiah, formatDate } from '@/lib/utils'
import { useToast } from '@/components/ui/toaster'
import { Package, Plus, X } from 'lucide-react'
import { useAuth } from '@/components/providers'

function AddAsetModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [form, setForm] = useState({
    namaAset: '',
    nilaiPerolehan: '',
    tanggalBeli: new Date().toISOString().slice(0, 10),
    umurEkonomisThn: '4',
    walletId: '',
    note: '',
  })
  const [loading, setLoading] = useState(false)

  const { data: wallets } = useQuery({
    queryKey: ['wallets'],
    queryFn: async () => fetch('/api/wallet').then((res) => res.json()).then((d) => d.data ?? [])
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/aset-tetap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ title: 'Aset Tetap berhasil ditambahkan', type: 'success' })
      qc.invalidateQueries({ queryKey: ['aset-tetap'] })
      qc.invalidateQueries({ queryKey: ['wallets'] })
      onClose()
    } catch (err: any) {
      toast({ title: err.message || 'Gagal', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-white">Tambah Aset Tetap</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Nama Aset *</label>
            <input required value={form.namaAset} onChange={(e) => setForm(p => ({ ...p, namaAset: e.target.value }))}
              placeholder="cth: Laptop Office"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none"/>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Nilai Perolehan (Rp) *</label>
            <input required type="number" min="0" value={form.nilaiPerolehan} onChange={(e) => setForm(p => ({ ...p, nilaiPerolehan: e.target.value }))}
              placeholder="0"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none"/>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Tanggal Beli *</label>
            <input required type="date" value={form.tanggalBeli} onChange={(e) => setForm(p => ({ ...p, tanggalBeli: e.target.value }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none [&::-webkit-calendar-picker-indicator]:invert-[0.6]"/>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Umur Ekonomis (Tahun) *</label>
            <input required type="number" min="1" value={form.umurEkonomisThn} onChange={(e) => setForm(p => ({ ...p, umurEkonomisThn: e.target.value }))}
              placeholder="4"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none"/>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Bayar Menggunakan (Opsional)</label>
            <select value={form.walletId} onChange={(e) => setForm(p => ({ ...p, walletId: e.target.value }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none">
              <option value="">Pilih Wallet (Abaikan jika sudah tercatat)</option>
              {(wallets ?? []).map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Catatan</label>
            <input value={form.note} onChange={(e) => setForm(p => ({ ...p, note: e.target.value }))}
              placeholder="Opsional"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none"/>
          </div>
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

export default function AsetTetapPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['aset-tetap'],
    queryFn: async () => fetch('/api/aset-tetap').then(r => r.json()).then(d => d.data?.asets ?? [])
  })

  const toggleStatus = async (id: string, current: boolean) => {
    if (!confirm(`Yakin ingin ${current ? 'menonaktifkan' : 'mengaktifkan'} aset ini?`)) return
    try {
      const res = await fetch('/api/aset-tetap', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, isActive: !current })
      })
      if (!res.ok) throw new Error()
      toast({ title: 'Status diperbarui', type: 'success' })
      qc.invalidateQueries({ queryKey: ['aset-tetap'] })
    } catch {
      toast({ title: 'Gagal memperbarui', type: 'error' })
    }
  }

  const asets = data ?? []

  return (
    <AppLayout>
      {showModal && <AddAsetModal onClose={() => setShowModal(false)} />}
      
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2">
          <Package size={22} className="text-emerald-400" />
          Aset Tetap
        </h1>
        {user?.userRole === 'OWNER' && (
          <button onClick={() => setShowModal(true)} className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors">
            <Plus size={14} /> Tambah Aset
          </button>
        )}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nama Aset</th>
                <th>Tanggal Beli</th>
                <th className="text-right">Nilai Perolehan</th>
                <th className="text-center">Umur (Bln)</th>
                <th className="text-right">Akum. Penyusutan</th>
                <th className="text-right">Nilai Buku</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="text-center py-10 text-zinc-500">Memuat data...</td></tr>
              ) : asets.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-10 text-zinc-500">Belum ada aset tetap tercatat</td></tr>
              ) : (
                asets.map((a: any) => (
                  <tr key={a.id} className={!a.isActive ? 'opacity-50' : ''}>
                    <td className="font-medium text-white">{a.namaAset}</td>
                    <td className="text-zinc-400">{formatDate(a.tanggalBeli)}</td>
                    <td className="text-right text-emerald-400">{formatRupiah(a.nilaiPerolehan, true)}</td>
                    <td className="text-center text-zinc-400">{a.bulanBerjalan} / {a.umurEkonomisThn * 12}</td>
                    <td className="text-right text-red-400">{formatRupiah(a.akumulasiPenyusutan, true)}</td>
                    <td className="text-right text-blue-400 font-medium">{formatRupiah(a.nilaiBuku, true)}</td>
                    <td>
                      <span className={a.isActive ? 'badge-success' : 'badge-danger'}>
                        {a.isActive ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td>
                      {user?.userRole === 'OWNER' && (
                        <button onClick={() => toggleStatus(a.id, a.isActive)} className="text-xs px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded">
                          {a.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
                      )}
                    </td>
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
