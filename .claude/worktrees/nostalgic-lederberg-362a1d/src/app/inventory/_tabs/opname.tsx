'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useRef } from 'react'
import { formatDate, downloadCSV } from '@/lib/utils'
import { useToast } from '@/components/ui/toaster'
import Papa from 'papaparse'
import { Upload, Download, CheckCircle, Loader2 } from 'lucide-react'

export function OpnameTab() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview]     = useState<any>(null)
  const [uploading, setUploading] = useState(false)
  const [committing, setCommitting] = useState(false)

  const { data: batches, isLoading } = useQuery({
    queryKey: ['opname-batches'],
    queryFn: () => fetch('/api/opname').then(r => r.json()).then(d => d.data ?? []),
  })

  const handleCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true)
    Papa.parse(file, { header: true, skipEmptyLines: true, complete: async (results) => {
      try {
        const rows = (results.data as any[]).map(r => ({
          sku: String(r['SKU'] || r['sku'] || '').trim(),
          actualQty: parseInt(String(r['New_SOH'] || r['new_soh'] || r['Qty'] || '0'), 10),
        })).filter(r => r.sku && !isNaN(r.actualQty))
        if (!rows.length) { toast({ title: 'File kosong atau format salah', type: 'error' }); return }
        const res  = await fetch('/api/opname', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: rows, opnameDate: new Date().toISOString() }) })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error)
        setPreview(json.data)
        toast({ title: `Preview siap: ${json.data.items?.length ?? 0} SKU`, type: 'success' })
      } catch (err: any) { toast({ title: err.message || 'Gagal', type: 'error' })
      } finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
    }})
  }

  const handleCommit = async () => {
    if (!preview?.id) return
    setCommitting(true)
    try {
      const res  = await fetch(`/api/opname/${preview.id}/commit`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ title: 'Opname berhasil dicommit!', type: 'success' })
      setPreview(null)
      qc.invalidateQueries({ queryKey: ['opname-batches'] })
      qc.invalidateQueries({ queryKey: ['inventory'] })
    } catch (err: any) { toast({ title: err.message || 'Commit gagal', type: 'error' })
    } finally { setCommitting(false) }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs text-zinc-500 bg-zinc-900/50 border border-zinc-800 border-dashed rounded-lg px-3 py-2">
          Format CSV: <span className="text-zinc-400 font-mono">SKU, New_SOH</span> · Upload → Preview → Commit
        </div>
        <div className="flex gap-2">
          <button onClick={() => downloadCSV('template-opname.csv', [{ SKU: 'CONTOH-SKU-001', New_SOH: 100 }])}
            className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg px-3 py-2 text-sm border border-zinc-700 transition-colors">
            <Download size={14} />Template CSV
          </button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCSV} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors">
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}Upload CSV
          </button>
        </div>
      </div>

      {preview && (
        <div className="bg-zinc-900 border border-emerald-800/50 rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-medium text-white">Preview Opname</p>
              <p className="text-xs text-zinc-500">{preview.items?.length} SKU · Belum dicommit</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPreview(null)} className="px-3 py-1.5 rounded-lg text-xs bg-zinc-800 text-zinc-400 hover:bg-zinc-700">Batal</button>
              <button onClick={handleCommit} disabled={committing}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium">
                {committing ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                {committing ? 'Menyimpan...' : 'Commit Opname'}
              </button>
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto">
            <table className="data-table w-full">
              <thead><tr><th>SKU</th><th className="w-24 text-center">SOH Sistem</th><th className="w-24 text-center">SOH Aktual</th><th className="w-24 text-center">Selisih</th></tr></thead>
              <tbody>
                {(preview.items ?? []).map((item: any) => (
                  <tr key={item.sku}>
                    <td><span className="font-mono text-xs text-zinc-400">{item.sku}</span></td>
                    <td className="text-center text-xs text-zinc-400">{item.systemQty}</td>
                    <td className="text-center text-xs text-white font-medium">{item.actualQty}</td>
                    <td className={`text-center text-xs font-bold ${item.diffQty > 0 ? 'text-emerald-400' : item.diffQty < 0 ? 'text-red-400' : 'text-zinc-600'}`}>
                      {item.diffQty > 0 ? '+' : ''}{item.diffQty}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800">
          <p className="text-sm font-medium text-zinc-400">Riwayat Opname</p>
        </div>
        <table className="data-table w-full">
          <thead><tr>
            <th className="w-28">Tanggal</th><th className="w-24 text-center">Total SKU</th>
            <th className="w-28 text-center">Total Adj.</th><th className="w-24">Status</th><th className="w-28">Dicommit oleh</th>
          </tr></thead>
          <tbody>
            {isLoading ? Array.from({length:3}).map((_,i) => (
              <tr key={i}>{Array.from({length:5}).map((_,j) => <td key={j}><div className="h-4 bg-zinc-800 rounded animate-pulse"/></td>)}</tr>
            )) : (batches ?? []).length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-zinc-600">Belum ada opname</td></tr>
            ) : (batches ?? []).map((b: any) => (
              <tr key={b.id}>
                <td className="text-xs text-zinc-400">{formatDate(b.opnameDate)}</td>
                <td className="text-center text-xs text-zinc-300">{b.totalSku}</td>
                <td className="text-center text-xs text-zinc-300">{b.totalAdjustmentQty}</td>
                <td>{b.status === 'COMMITTED' ? <span className="badge-success">Committed</span> : b.status === 'CANCELED' ? <span className="badge-danger">Canceled</span> : <span className="badge-warning">Draft</span>}</td>
                <td className="text-xs text-zinc-500">{b.committedBy || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
