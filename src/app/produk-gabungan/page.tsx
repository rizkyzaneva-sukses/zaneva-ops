'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useRef } from 'react'
import { useToast } from '@/components/ui/toaster'
import { useAuth } from '@/components/providers'
import {
  GitMerge, Plus, Upload, Search, Edit2, Trash, Loader2, X, ChevronLeft, ChevronRight, Info, Download,
} from 'lucide-react'
import * as XLSX from 'xlsx'

// ── Modal Tambah/Edit ────────────────────────────────────
function MappingModal({ mapping, onClose }: { mapping?: any; onClose: () => void }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const isEdit = !!mapping
  const [form, setForm] = useState({ fromSku: mapping?.fromSku ?? '', toSku: mapping?.toSku ?? '' })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.fromSku.trim() || !form.toSku.trim()) {
      toast({ title: 'Kolom A dan B wajib diisi', type: 'error' })
      return
    }
    setLoading(true)
    try {
      const url = isEdit ? `/api/sku-mappings/${mapping.id}` : '/api/sku-mappings'
      const method = isEdit ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ title: isEdit ? 'Mapping diperbarui' : 'Mapping ditambahkan', type: 'success' })
      qc.invalidateQueries({ queryKey: ['sku-mappings'] })
      onClose()
    } catch (err: any) {
      toast({ title: err.message || 'Gagal', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-white">{isEdit ? 'Edit Mapping' : 'Tambah Mapping'}</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={18} /></button>
        </div>

        <div className="bg-zinc-800/60 rounded-lg p-3 mb-4 text-xs text-zinc-400 flex gap-2">
          <Info size={14} className="mt-0.5 shrink-0 text-blue-400" />
          <div>
            <span className="text-zinc-300 font-medium">Kolom A</span> = SKU dari marketplace persis seperti di file export Shopee/TikTok (bisa mengandung <code className="text-yellow-400">+</code>).<br />
            <span className="text-zinc-300 font-medium">Kolom B</span> = SKU internal database (gunakan <code className="text-yellow-400">+</code> untuk pisah beberapa produk).
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">
              Kolom A — SKU dari Marketplace (ASLI) *
            </label>
            <input
              value={form.fromSku}
              onChange={e => setForm(p => ({ ...p, fromSku: e.target.value }))}
              placeholder="cth: Chino Khaki PJ + Heritage Olive PD - XL"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">
              Kolom B — SKU Sesuai Database Produk *
            </label>
            <input
              value={form.toSku}
              onChange={e => setForm(p => ({ ...p, toSku: e.target.value }))}
              placeholder="cth: Hino Khaki Panjang - XL + Heritage Olive Pendek - XL"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />
          </div>

          {form.toSku && (
            <div className="bg-zinc-800/40 rounded-lg p-3 text-xs">
              <p className="text-zinc-500 mb-1">Preview split produk:</p>
              {form.toSku.split('+').map((s: string, i: number) => (
                <div key={i} className="flex items-center gap-2 text-zinc-300">
                  <span className="text-emerald-500">→</span>
                  <span>{s.trim() || '(kosong)'}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg py-2 text-sm">
              Batal
            </button>
            <button type="submit" disabled={loading} className="flex-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg py-2 text-sm flex items-center justify-center gap-2">
              {loading && <Loader2 size={14} className="animate-spin" />}
              {isEdit ? 'Simpan' : 'Tambah'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Modal Import Excel ───────────────────────────────────
function ImportModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<{ fromSku: string; toSku: string }[]>([])

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase()

    if (ext === 'xlsx' || ext === 'xls') {
      file.arrayBuffer().then(buf => {
        const wb = XLSX.read(buf, { type: 'array' })
        // Coba sheet "DATA BASE - PRODUK GABUNGAN" dulu, fallback ke sheet pertama
        const wsName = wb.SheetNames.find(n => n.toLowerCase().includes('gabungan')) ?? wb.SheetNames[0]
        const ws = wb.Sheets[wsName]
        const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
        // Cari baris header (ada "DARI MP" atau "SESUAI DENGAN")
        let dataStart = 0
        for (let i = 0; i < Math.min(5, rows.length); i++) {
          const r = rows[i] as string[]
          if (r.some(c => String(c).toLowerCase().includes('dari mp') || String(c).toLowerCase().includes('sesuai'))) {
            dataStart = i + 1
            break
          }
        }
        const parsed = (rows.slice(dataStart) as string[][])
          .map(r => ({ fromSku: String(r[0] ?? '').trim(), toSku: String(r[1] ?? '').trim() }))
          .filter(r => r.fromSku && r.toSku)
        setPreview(parsed)
      })
    } else {
      toast({ title: 'Hanya file .xlsx / .xls yang didukung', type: 'error' })
    }
  }

  const handleImport = async () => {
    if (!preview.length) return
    setLoading(true)
    try {
      const res = await fetch('/api/sku-mappings/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: preview }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ title: json.data.message, type: 'success' })
      qc.invalidateQueries({ queryKey: ['sku-mappings'] })
      onClose()
    } catch (err: any) {
      toast({ title: err.message || 'Import gagal', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([
      ['DARI MP (ASLI)', 'SESUAI DENGAN DATABASE PRODUK'],
      ['Chino Khaki PJ + Heritage Olive PD - XL', 'Hino Khaki Panjang - XL + Heritage Olive Pendek - XL'],
      ['Airflow Biru Muda + Jogger Black Panjang - S', 'Airflow Skyblue - S + Jimo Black Panjang - S'],
    ])
    ws['!cols'] = [{ wch: 50 }, { wch: 60 }]
    XLSX.utils.book_append_sheet(wb, ws, 'DATA BASE - PRODUK GABUNGAN')
    XLSX.writeFile(wb, 'template_produk_gabungan.xlsx')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-white">Import dari Excel</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={18} /></button>
        </div>

        <div className="space-y-4">
          <button onClick={downloadTemplate} className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300">
            <Download size={14} /> Download template Excel
          </button>

          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-zinc-700 hover:border-zinc-500 rounded-xl p-6 text-center cursor-pointer transition-colors"
          >
            <Upload size={24} className="mx-auto mb-2 text-zinc-500" />
            <p className="text-sm text-zinc-400">Klik untuk pilih file Excel (.xlsx)</p>
            <p className="text-xs text-zinc-600 mt-1">Sheet "DATA BASE - PRODUK GABUNGAN" — Kolom A: dari MP, Kolom B: ke DB</p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
          </div>

          {preview.length > 0 && (
            <div>
              <p className="text-xs text-zinc-500 mb-2">{preview.length} baris ditemukan (preview 5 pertama):</p>
              <div className="bg-zinc-800/50 rounded-lg overflow-hidden text-xs">
                <table className="w-full">
                  <thead>
                    <tr className="text-zinc-500 border-b border-zinc-700">
                      <th className="text-left px-3 py-2 w-1/2">Kolom A (dari MP)</th>
                      <th className="text-left px-3 py-2 w-1/2">Kolom B (ke DB)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 5).map((r, i) => (
                      <tr key={i} className="border-b border-zinc-700/50 text-zinc-300">
                        <td className="px-3 py-2">{r.fromSku}</td>
                        <td className="px-3 py-2">{r.toSku}</td>
                      </tr>
                    ))}
                    {preview.length > 5 && (
                      <tr><td colSpan={2} className="px-3 py-2 text-zinc-500">...dan {preview.length - 5} baris lainnya</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg py-2 text-sm">
              Batal
            </button>
            <button
              onClick={handleImport}
              disabled={!preview.length || loading}
              className="flex-1 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg py-2 text-sm flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              Import {preview.length > 0 ? `(${preview.length} baris)` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Modal Konfirmasi Hapus ───────────────────────────────
function DeleteModal({ count, onConfirm, onClose }: { count: number; onConfirm: () => void; onClose: () => void }) {
  const [loading, setLoading] = useState(false)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm p-6">
        <h2 className="text-base font-semibold text-white mb-2">Hapus Mapping</h2>
        <p className="text-sm text-zinc-400 mb-5">
          Hapus <span className="text-white font-medium">{count} mapping</span> yang dipilih? Tindakan ini tidak bisa dibatalkan.
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg py-2 text-sm">Batal</button>
          <button
            onClick={async () => { setLoading(true); await onConfirm(); setLoading(false) }}
            disabled={loading}
            className="flex-1 bg-red-700 hover:bg-red-600 text-white rounded-lg py-2 text-sm flex items-center justify-center gap-2"
          >
            {loading && <Loader2 size={14} className="animate-spin" />} Hapus
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Halaman Utama ─────────────────────────────────────────
export default function ProdukGabunganPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const { toast } = useToast()

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const limit = 50

  const [editMapping, setEditMapping] = useState<any>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [showDelete, setShowDelete] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['sku-mappings', search, page],
    queryFn: async () => {
      const params = new URLSearchParams({ search, page: String(page), limit: String(limit) })
      const res = await fetch(`/api/sku-mappings?${params}`)
      return res.json().then(d => d.data)
    },
  })

  const mappings = data?.mappings ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / limit)

  const canEdit = ['OWNER', 'FINANCE'].includes(user?.userRole ?? '')

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const toggleAll = () => {
    if (selectedIds.length === mappings.length) setSelectedIds([])
    else setSelectedIds(mappings.map((m: any) => m.id))
  }

  const handleDelete = async () => {
    const res = await fetch('/api/sku-mappings', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: selectedIds }),
    })
    const json = await res.json()
    if (!res.ok) { toast({ title: json.error || 'Gagal', type: 'error' }); return }
    toast({ title: `${selectedIds.length} mapping dihapus`, type: 'success' })
    setSelectedIds([])
    setShowDelete(false)
    qc.invalidateQueries({ queryKey: ['sku-mappings'] })
  }

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-white flex items-center gap-2">
              <GitMerge size={20} className="text-emerald-400" />
              Database Produk Gabungan
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Mapping SKU gabungan dari marketplace (+) ke produk individual di database
            </p>
          </div>
          {canEdit && (
            <div className="flex gap-2 shrink-0">
              <button onClick={() => setShowImport(true)} className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm px-3 py-2 rounded-lg">
                <Upload size={14} /> Import Excel
              </button>
              <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-sm px-3 py-2 rounded-lg">
                <Plus size={14} /> Tambah
              </button>
            </div>
          )}
        </div>

        {/* Info banner */}
        <div className="bg-blue-950/40 border border-blue-800/30 rounded-lg p-3 text-xs text-blue-300 flex gap-2">
          <Info size={14} className="mt-0.5 shrink-0" />
          <div>
            Ketika upload order Shopee/TikTok, SKU yang mengandung <code className="bg-blue-900/50 px-1 rounded">+</code> akan dicari di sini.
            Jika tidak ditemukan, baris tersebut <span className="text-red-400 font-medium">GAGAL</span> dan tidak dimasukkan ke database.
            Tambahkan mapping-nya lalu upload ulang file order.
          </div>
        </div>

        {/* Search + bulk actions */}
        <div className="flex gap-3 items-center">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Cari SKU..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-8 pr-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none"
            />
          </div>
          {selectedIds.length > 0 && canEdit && (
            <button onClick={() => setShowDelete(true)} className="flex items-center gap-1.5 bg-red-800/80 hover:bg-red-700 text-white text-sm px-3 py-2 rounded-lg">
              <Trash size={14} /> Hapus ({selectedIds.length})
            </button>
          )}
          <span className="text-xs text-zinc-500 ml-auto">{total} mapping</span>
        </div>

        {/* Table */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-zinc-500">
              <Loader2 size={24} className="animate-spin mr-2" /> Memuat...
            </div>
          ) : mappings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
              <GitMerge size={32} className="mb-3 opacity-30" />
              <p className="text-sm">{search ? 'Tidak ada hasil' : 'Belum ada mapping'}</p>
              {!search && canEdit && (
                <button onClick={() => setShowAdd(true)} className="mt-3 text-xs text-emerald-400 hover:text-emerald-300">
                  + Tambah mapping pertama
                </button>
              )}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-xs text-zinc-500">
                  {canEdit && (
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={selectedIds.length === mappings.length && mappings.length > 0}
                        onChange={toggleAll}
                        className="accent-emerald-500"
                      />
                    </th>
                  )}
                  <th className="px-4 py-3 text-left w-1/2">
                    Kolom A — SKU dari Marketplace (ASLI)
                  </th>
                  <th className="px-4 py-3 text-left w-1/2">
                    Kolom B — SKU Database Produk
                  </th>
                  {canEdit && <th className="px-4 py-3 w-20" />}
                </tr>
              </thead>
              <tbody>
                {mappings.map((m: any) => (
                  <tr key={m.id} className="border-b border-zinc-800/60 hover:bg-zinc-800/30 transition-colors">
                    {canEdit && (
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(m.id)}
                          onChange={() => toggleSelect(m.id)}
                          className="accent-emerald-500"
                        />
                      </td>
                    )}
                    <td className="px-4 py-3 text-zinc-300 font-mono text-xs">{m.fromSku}</td>
                    <td className="px-4 py-3 text-zinc-300 font-mono text-xs">
                      <div className="space-y-0.5">
                        {m.toSku.split('+').map((s: string, i: number) => (
                          <div key={i} className="flex items-center gap-1.5">
                            <span className="text-emerald-600 text-[10px]">{i === 0 ? '→' : '+'}</span>
                            <span>{s.trim()}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3">
                        <button onClick={() => setEditMapping(m)} className="text-zinc-500 hover:text-zinc-300 p-1">
                          <Edit2 size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-zinc-500">
            <span>Halaman {page} / {totalPages}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 bg-zinc-800 rounded-lg disabled:opacity-40">
                <ChevronLeft size={14} />
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 bg-zinc-800 rounded-lg disabled:opacity-40">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {(showAdd || editMapping) && (
        <MappingModal
          mapping={editMapping}
          onClose={() => { setShowAdd(false); setEditMapping(null) }}
        />
      )}
      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
      {showDelete && (
        <DeleteModal
          count={selectedIds.length}
          onConfirm={handleDelete}
          onClose={() => setShowDelete(false)}
        />
      )}
    </AppLayout>
  )
}
