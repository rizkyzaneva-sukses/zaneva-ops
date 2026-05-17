'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useRef } from 'react'
import { formatRupiah, formatDate } from '@/lib/utils'
import { useToast } from '@/components/ui/toaster'
import { Plus, X, Upload, FileDown } from 'lucide-react'
import { useAuth } from '@/components/providers'
import Papa from 'papaparse'

function AddAsetModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient(); const { toast } = useToast()
  const [form, setForm] = useState({ namaAset:'', nilaiPerolehan:'', tanggalBeli:new Date().toISOString().slice(0,10), umurEkonomisThn:'4', walletId:'', note:'' })
  const [loading, setLoading] = useState(false)
  const { data: wallets } = useQuery({ queryKey:['wallets'], queryFn: async () => fetch('/api/wallet').then(r=>r.json()).then(d=>d.data??[]) })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true)
    try {
      const res = await fetch('/api/aset-tetap', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(form) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ title:'Aset Tetap berhasil ditambahkan', type:'success' })
      qc.invalidateQueries({ queryKey:['aset-tetap'] }); qc.invalidateQueries({ queryKey:['wallets'] }); onClose()
    } catch (err:any) { toast({ title:err.message||'Gagal', type:'error' })
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-white">Tambah Aset Tetap</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={18}/></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          {[
            { label:'Nama Aset *', key:'namaAset', type:'text', placeholder:'cth: Laptop Office' },
            { label:'Nilai Perolehan (Rp) *', key:'nilaiPerolehan', type:'number', placeholder:'0' },
            { label:'Tanggal Beli *', key:'tanggalBeli', type:'date', placeholder:'' },
            { label:'Umur Ekonomis (Tahun) *', key:'umurEkonomisThn', type:'number', placeholder:'4' },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-xs text-zinc-500 mb-1">{f.label}</label>
              <input required={f.key !== 'note'} type={f.type} placeholder={f.placeholder} value={(form as any)[f.key]}
                onChange={e => setForm(p => ({...p, [f.key]: e.target.value}))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none [&::-webkit-calendar-picker-indicator]:invert-[0.6]" />
            </div>
          ))}
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Bayar Menggunakan (Opsional)</label>
            <select value={form.walletId} onChange={e => setForm(p => ({...p, walletId: e.target.value}))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none">
              <option value="">Pilih Wallet (Abaikan jika sudah tercatat)</option>
              {(wallets ?? []).map((w:any) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Catatan</label>
            <input value={form.note} onChange={e => setForm(p => ({...p, note: e.target.value}))} placeholder="Opsional"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none" />
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

function CsvUploadModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient(); const { toast } = useToast()
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (result) => {
        setRows(result.data as any[])
        setErrors([])
      },
    })
  }

  const downloadTemplate = () => {
    const csv = 'namaAset,nilaiPerolehan,tanggalBeli,umurEkonomisThn,note\nLaptop Office,12000000,2024-01-15,4,Untuk kerja\nMeja Kantor,3500000,2024-03-01,8,'
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = 'template-aset-tetap.csv'; a.click()
  }

  const handleImport = async () => {
    if (!rows.length) return
    setLoading(true)
    try {
      const res = await fetch('/api/aset-tetap/batch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      if (json.data.errors?.length) setErrors(json.data.errors)
      toast({ title: json.data.message, type: 'success' })
      qc.invalidateQueries({ queryKey: ['aset-tetap'] })
      if (!json.data.errors?.length) onClose()
    } catch (err: any) {
      toast({ title: err.message || 'Gagal import', type: 'error' })
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-white">Import Aset Tetap dari CSV</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={18}/></button>
        </div>

        {/* Template download */}
        <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-3 mb-4">
          <p className="text-xs text-zinc-400 mb-2">Kolom wajib: <span className="font-mono text-emerald-400">namaAset, nilaiPerolehan, tanggalBeli, umurEkonomisThn</span></p>
          <p className="text-xs text-zinc-500 mb-2">Kolom opsional: <span className="font-mono text-zinc-400">note</span></p>
          <p className="text-xs text-zinc-500 mb-3">Format tanggal: <span className="font-mono text-zinc-400">YYYY-MM-DD</span> (cth: 2024-01-15)</p>
          <button onClick={downloadTemplate} className="flex items-center gap-1.5 text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-300 px-3 py-1.5 rounded-lg">
            <FileDown size={12}/> Download Template CSV
          </button>
        </div>

        {/* File upload */}
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
        <button onClick={() => fileRef.current?.click()}
          className="w-full border-2 border-dashed border-zinc-700 hover:border-emerald-600 rounded-xl py-6 text-center transition-colors mb-4">
          <Upload size={20} className="mx-auto mb-2 text-zinc-500"/>
          <p className="text-sm text-zinc-400">{rows.length > 0 ? `${rows.length} baris siap diimport` : 'Klik untuk pilih file CSV'}</p>
        </button>

        {/* Preview rows */}
        {rows.length > 0 && (
          <div className="max-h-40 overflow-y-auto border border-zinc-800 rounded-lg mb-4">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-zinc-800">
                <th className="text-left px-3 py-2 text-zinc-500">Nama Aset</th>
                <th className="text-right px-3 py-2 text-zinc-500">Nilai</th>
                <th className="px-3 py-2 text-zinc-500">Tgl Beli</th>
                <th className="text-center px-3 py-2 text-zinc-500">Umur</th>
              </tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-zinc-800/50">
                    <td className="px-3 py-1.5 text-zinc-300">{r.namaAset}</td>
                    <td className="px-3 py-1.5 text-right text-zinc-400">{Number(String(r.nilaiPerolehan).replace(/[^0-9]/g,'')).toLocaleString('id')}</td>
                    <td className="px-3 py-1.5 text-zinc-400">{r.tanggalBeli}</td>
                    <td className="px-3 py-1.5 text-center text-zinc-400">{r.umurEkonomisThn} thn</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Errors */}
        {errors.length > 0 && (
          <div className="bg-red-950/30 border border-red-900/40 rounded-lg p-3 mb-4 max-h-28 overflow-y-auto">
            {errors.map((e, i) => <p key={i} className="text-xs text-red-400">{e}</p>)}
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg py-2 text-sm">Batal</button>
          <button onClick={handleImport} disabled={!rows.length || loading}
            className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-medium">
            {loading ? 'Mengimport...' : `Import ${rows.length} Data`}
          </button>
        </div>
      </div>
    </div>
  )
}

export function AsetTetapTab() {
  const { user } = useAuth(); const { toast } = useToast(); const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [showCsv, setShowCsv] = useState(false)
  const { data, isLoading } = useQuery({ queryKey:['aset-tetap'], queryFn: async () => fetch('/api/aset-tetap').then(r=>r.json()).then(d=>d.data?.asets??[]) })
  const asets = data ?? []

  const toggleStatus = async (id: string, current: boolean) => {
    if (!confirm(`Yakin ingin ${current?'menonaktifkan':'mengaktifkan'} aset ini?`)) return
    try {
      const res = await fetch('/api/aset-tetap', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id,isActive:!current}) })
      if (!res.ok) throw new Error()
      toast({ title:'Status diperbarui', type:'success' }); qc.invalidateQueries({ queryKey:['aset-tetap'] })
    } catch { toast({ title:'Gagal memperbarui', type:'error' }) }
  }

  return (
    <>
      {showModal && <AddAsetModal onClose={() => setShowModal(false)} />}
      {showCsv && <CsvUploadModal onClose={() => setShowCsv(false)} />}
      <div className="flex justify-end gap-2 mb-4">
        {user?.userRole === 'OWNER' && (
          <>
            <button onClick={() => setShowCsv(true)} className="flex items-center gap-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 border border-zinc-600 rounded-lg px-3 py-2 text-sm font-medium">
              <Upload size={14}/>Import CSV
            </button>
            <button onClick={() => setShowModal(true)} className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg px-3 py-2 text-sm font-medium">
              <Plus size={14}/>Tambah Aset
            </button>
          </>
        )}
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead><tr>
              <th>Nama Aset</th><th>Tanggal Beli</th><th className="text-right">Nilai Perolehan</th>
              <th className="text-center">Umur (Bln)</th><th className="text-right">Akum. Penyusutan</th>
              <th className="text-right">Nilai Buku</th><th>Status</th><th>Aksi</th>
            </tr></thead>
            <tbody>
              {isLoading ? <tr><td colSpan={8} className="text-center py-10 text-zinc-500">Memuat data...</td></tr>
              : asets.length === 0 ? <tr><td colSpan={8} className="text-center py-10 text-zinc-500">Belum ada aset tetap tercatat</td></tr>
              : asets.map((a:any) => (
                <tr key={a.id} className={!a.isActive?'opacity-50':''}>
                  <td className="font-medium text-white">{a.namaAset}</td>
                  <td className="text-zinc-400">{formatDate(a.tanggalBeli)}</td>
                  <td className="text-right text-emerald-400">{formatRupiah(a.nilaiPerolehan, true)}</td>
                  <td className="text-center text-zinc-400">{a.bulanBerjalan} / {a.umurEkonomisThn * 12}</td>
                  <td className="text-right text-red-400">{formatRupiah(a.akumulasiPenyusutan, true)}</td>
                  <td className="text-right text-blue-400 font-medium">{formatRupiah(a.nilaiBuku, true)}</td>
                  <td><span className={a.isActive?'badge-success':'badge-danger'}>{a.isActive?'Aktif':'Nonaktif'}</span></td>
                  <td>
                    {user?.userRole === 'OWNER' && (
                      <button onClick={() => toggleStatus(a.id, a.isActive)} className="text-xs px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded">
                        {a.isActive?'Nonaktifkan':'Aktifkan'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
