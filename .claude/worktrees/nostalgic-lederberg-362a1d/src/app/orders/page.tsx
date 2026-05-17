'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useRef } from 'react'
import { formatRupiah, formatDate } from '@/lib/utils'
import { useToast } from '@/components/ui/toaster'
import { usePermission, useAuth } from '@/components/providers'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import {
  ShoppingCart, Upload, Download, Search,
  RefreshCw, ChevronLeft, ChevronRight, CheckCircle2,
  Loader2, AlertCircle, Trash, X, CalendarRange
} from 'lucide-react'

const STATUS_GROUPS = [
  { key: '', label: 'Semua' },
  { key: 'perlu_dikirim', label: 'Perlu Dikirim' },
  { key: 'terkirim', label: 'Terkirim' },
  { key: 'dicairkan', label: 'Dicairkan' },
  { key: 'retur', label: 'Retur' },
  { key: 'batal', label: 'Dibatalkan' },
]

function StatusBadge({ status }: { status: string }) {
  if (!status) return <span className="badge-muted">—</span>
  const s = status.toLowerCase()
  if (s === 'retur') return <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-orange-900/40 text-orange-400">Retur</span>
  if (s.startsWith('terkirim')) return <span className="badge-success">Terkirim</span>
  if (s.includes('batal') || s.includes('cancel')) return <span className="badge-danger">Batal</span>
  if (s.includes('selesai') || s.includes('delivered')) return <span className="badge-info">Selesai</span>
  if (s.includes('dikirim') || s.includes('transit')) return <span className="badge-warning">{status}</span>
  return <span className="badge-muted">{status}</span>
}

interface ImportResult {
  inserted: number
  skipped: number
  platform: string
  message: string
}

// ── Export Modal ─────────────────────────────────────
function ExportModal({
  defaultFrom, defaultTo, defaultPlatform,
  onClose,
}: {
  defaultFrom: string; defaultTo: string; defaultPlatform: string
  onClose: () => void
}) {
  const { toast } = useToast()
  const [mode,    setMode]    = useState<'order_date' | 'payout_date'>('order_date')
  const [from,    setFrom]    = useState(defaultFrom)
  const [to,      setTo]      = useState(defaultTo)
  const [loading, setLoading] = useState(false)

  const handleDownload = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ mode })
      if (from) params.set('dateFrom', from)
      if (to)   params.set('dateTo',   to)
      if (defaultPlatform) params.set('platform', defaultPlatform)

      const res = await fetch(`/api/orders/export?${params}`)
      if (!res.ok) throw new Error('Gagal export data')
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `orders-${mode}-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      onClose()
    } catch (err: any) {
      toast({ title: err.message || 'Gagal export', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Download size={15} className="text-emerald-400" /> Download Pesanan
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={16} /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <p className="text-xs text-zinc-500">Pilih berdasarkan:</p>

          {/* Mode selector */}
          <div className="space-y-2">
            {[
              { val: 'order_date',  label: 'Tanggal Cair', desc: 'Filter berdasarkan Waktu Dana Dilepaskan (Shopee) / Order settled time (TikTok)' },
              { val: 'payout_date', label: 'Tanggal Pencairan', desc: 'Semua order yang order_no-nya cair di range ini' },
            ].map(opt => (
              <label key={opt.val} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                mode === opt.val
                  ? 'border-emerald-600 bg-emerald-900/20'
                  : 'border-zinc-700 bg-zinc-800/40 hover:border-zinc-600'
              }`}>
                <input
                  type="radio"
                  name="mode"
                  value={opt.val}
                  checked={mode === opt.val}
                  onChange={() => setMode(opt.val as any)}
                  className="mt-0.5 accent-emerald-500"
                />
                <div>
                  <p className="text-sm font-medium text-zinc-200">{opt.label}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>

          {/* Date range */}
          <div className="space-y-2">
            <label className="block text-xs text-zinc-500">Rentang Tanggal</label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={from}
                onChange={e => setFrom(e.target.value)}
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 [&::-webkit-calendar-picker-indicator]:invert-[0.6]"
              />
              <span className="text-zinc-600 text-xs">s/d</span>
              <input
                type="date"
                value={to}
                onChange={e => setTo(e.target.value)}
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 [&::-webkit-calendar-picker-indicator]:invert-[0.6]"
              />
            </div>
          </div>

          <p className="text-xs text-zinc-600">Format: CSV · Semua data (tanpa batas baris)</p>
        </div>
        <div className="px-5 pb-5 flex gap-2">
          <button onClick={onClose} disabled={loading}
            className="flex-1 py-2.5 text-sm text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors">
            Batal
          </button>
          <button onClick={handleDownload} disabled={loading}
            className="flex-1 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {loading ? 'Mengunduh...' : 'Download'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function OrdersPage() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { canEdit } = usePermission()
  const { user } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)

  const [search, setSearch] = useState('')
  const [statusGroup, setStatusGroup] = useState('')
  const [platform, setPlatform] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  
  // Export modal
  const [showExportModal, setShowExportModal] = useState(false)

  // States untuk Preview & Bulk Delete
  const [showPreview, setShowPreview] = useState(false)
  const [previewData, setPreviewData] = useState<any>(null)
  const [uploadPayload, setUploadPayload] = useState<{ rawRows: any[], headers: string[] } | null>(null)
  
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)
  const [editingOrder, setEditingOrder] = useState<any>(null)
  
  const limit = 50

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['orders', search, statusGroup, platform, dateFrom, dateTo, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        search, statusGroup, platform, page: String(page), limit: String(limit),
      })
      if (dateFrom) params.append('dateFrom', dateFrom)
      if (dateTo) params.append('dateTo', dateTo)
      
      const res = await fetch(`/api/orders?${params}`)
      return res.json().then(d => d.data)
    },
  })

  const orders = data?.orders ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / limit)

  // ── Upload handler — auto detect TikTok/Shopee ──────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportResult(null)

    try {
      const ext = file.name.split('.').pop()?.toLowerCase()
      let rawRows: Record<string, unknown>[] = []
      let headers: string[] = []

      if (ext === 'xlsx' || ext === 'xls') {
        const buf = await file.arrayBuffer()
        const wb = XLSX.read(buf, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
        rawRows = json
        headers = Object.keys(json[0] ?? {})
      } else {
        const text = await file.text()
        const cleaned = text.replace(/\t,/g, ',').replace(/"\t\s*"/g, '""').replace(/\t"/g, '"')
        await new Promise<void>((resolve, reject) => {
          Papa.parse(cleaned, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
              rawRows = results.data as Record<string, unknown>[]
              headers = results.meta.fields ?? []
              resolve()
            },
            error: reject,
          })
        })
      }

      if (rawRows.length === 0) {
        toast({ title: 'File kosong atau tidak bisa dibaca', type: 'error' })
        return
      }

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawRows, headers, preview: true }),
      })
      const json = await res.json()

      if (res.ok) {
        setPreviewData(json.data)
        setUploadPayload({ rawRows, headers })
        setShowPreview(true)
      } else {
        toast({ title: json.error || 'Gagal membaca file', type: 'error' })
      }
    } catch (err: any) {
      toast({ title: `Error: ${err.message || 'Gagal memproses file'}`, type: 'error' })
    } finally {
      setImporting(false)
    }
  }

  const confirmUpload = async () => {
    if (!uploadPayload) return
    setImporting(true)
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...uploadPayload, preview: false }),
      })
      const json = await res.json()

      if (res.ok) {
        setImportResult(json.data)
        toast({ title: json.data.message, type: 'success' })
        qc.invalidateQueries({ queryKey: ['orders'] })
        setShowPreview(false)

        // Auto backfill HPP di background setelah import berhasil
        fetch('/api/orders/backfill-hpp', { method: 'POST' }).catch(() => {})
      } else {
        toast({ title: json.error || 'Import gagal', type: 'error' })
      }
    } catch (err: any) {
      toast({ title: `Error: ${err.message || 'Gagal import'}`, type: 'error' })
    } finally {
      setImporting(false)
      setUploadPayload(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const cancelUpload = () => {
    setShowPreview(false)
    setPreviewData(null)
    setUploadPayload(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleDeleteSelected = async () => {
    if (!confirm(`Yakin menghapus ${selectedIds.length} pesanan terpilih?`)) return
    setDeleting(true)
    try {
      const res = await fetch('/api/orders', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      })
      const json = await res.json()
      if (res.ok) {
        toast({ title: json.data.message, type: 'success' })
        setSelectedIds([])
        qc.invalidateQueries({ queryKey: ['orders'] })
      } else {
        toast({ title: json.error || 'Gagal hapus', type: 'error' })
      }
    } catch (err: any) {
      toast({ title: `Error: ${err.message}`, type: 'error' })
    } finally {
      setDeleting(false)
    }
  }

  const handleEditSubmit = async (e: React.FormEvent, form: any) => {
    e.preventDefault()
    try {
      const res = await fetch(`/api/orders/${editingOrder.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      const json = await res.json()
      if (res.ok) {
        toast({ title: json.data.message, type: 'success' })
        setEditingOrder(null)
        qc.invalidateQueries({ queryKey: ['orders'] })
      } else {
        toast({ title: json.error || 'Gagal update', type: 'error' })
      }
    } catch(err:any) {
      toast({ title: err.message || 'Gagal', type: 'error' })
    }
  }

  return (
    <AppLayout>
      {/* Export Modal */}
      {showExportModal && (
        <ExportModal
          defaultFrom={dateFrom}
          defaultTo={dateTo}
          defaultPlatform={platform}
          onClose={() => setShowExportModal(false)}
        />
      )}

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <ShoppingCart size={22} className="text-emerald-400" />
            Pesanan
          </h1>
          <p className="text-zinc-500 text-sm mt-0.5">{total.toLocaleString('id')} total pesanan</p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileUpload} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={importing}
              className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors"
            >
              {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {importing ? 'Membaca...' : 'Upload File'}
            </button>
            <button
              onClick={() => setShowExportModal(true)}
              className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg px-3 py-2 text-sm transition-colors border border-zinc-700"
            >
              <Download size={14} /> Export
            </button>
            <button onClick={() => refetch()} className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors">
              <RefreshCw size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Import result banner */}
      {importResult && (
        <div className={`mb-4 rounded-xl px-4 py-3 flex items-start gap-3 ${(importResult as any).failedCount > 0 ? 'bg-amber-900/20 border border-amber-700' : 'bg-emerald-900/20 border border-emerald-800'}`}>
          <CheckCircle2 size={16} className={`shrink-0 mt-0.5 ${(importResult as any).failedCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`} />
          <div className="flex-1">
            <p className={`text-sm font-medium ${(importResult as any).failedCount > 0 ? 'text-amber-300' : 'text-emerald-300'}`}>{importResult.message}</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              Platform: <span className="text-zinc-300">{importResult.platform}</span>
              {' · '}Diimport: <span className="text-zinc-300">{importResult.inserted}</span>
              {importResult.skipped > 0 && <> · Duplikat: <span className="text-zinc-300">{importResult.skipped}</span></>}
              {(importResult as any).failedCount > 0 && <> · <span className="text-red-400 font-medium">Gagal: {(importResult as any).failedCount} baris</span> → tambahkan ke <a href="/produk-gabungan" className="text-yellow-400 underline">Produk Gabungan</a> lalu upload ulang</>}
            </p>
          </div>
          <button onClick={() => setImportResult(null)} className="ml-auto text-zinc-600 hover:text-zinc-400 text-xs">✕</button>
        </div>
      )}

      {/* Hint upload */}
      {!importing && !importResult && canEdit && (
        <div className="mb-4 bg-zinc-900/50 border border-zinc-800 border-dashed rounded-xl px-4 py-3 flex items-center gap-2 text-xs text-zinc-600">
          <AlertCircle size={13} />
          Upload file ekspor langsung dari TikTok (.csv) atau Shopee (.xlsx) — tanpa perlu edit manual.
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Cari no. pesanan, resi, nama, SKU..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          />
        </div>

        {/* Status tabs */}
        <div className="flex gap-1 flex-wrap items-center">
          {STATUS_GROUPS.map(g => (
            <button
              key={g.key}
              onClick={() => { setStatusGroup(g.key); setPage(1) }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors h-[38px] ${
                statusGroup === g.key
                  ? 'bg-emerald-900/40 text-emerald-400 border-emerald-800'
                  : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:border-zinc-700 hover:text-zinc-300'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>

        {/* Date Filters */}
        <div className="flex gap-2 items-center bg-zinc-900 border border-zinc-800 rounded-lg px-3 h-[38px] focus-within:ring-2 focus-within:ring-emerald-500/50">
          <input
            type="date"
            value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setPage(1) }}
            className="bg-transparent text-zinc-300 text-xs focus:outline-none w-28 [&::-webkit-calendar-picker-indicator]:invert-[0.6]"
          />
          <span className="text-zinc-500 text-xs">-</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => { setDateTo(e.target.value); setPage(1) }}
            className="bg-transparent text-zinc-300 text-xs focus:outline-none w-28 [&::-webkit-calendar-picker-indicator]:invert-[0.6]"
          />
        </div>

        {/* Platform filter */}
        <select
          value={platform}
          onChange={e => { setPlatform(e.target.value); setPage(1) }}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 text-sm text-zinc-400 focus:outline-none h-[38px]"
        >
          <option value="">Semua Platform</option>
          <option value="TikTok">TikTok</option>
          <option value="Shopee">Shopee</option>
          <option value="Tokopedia">Tokopedia</option>
        </select>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.length > 0 && (
        <div className="mb-4 bg-emerald-900/30 border border-emerald-800/50 rounded-xl px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-emerald-300 font-medium">{selectedIds.length} pesanan terpilih</p>
          <div className="flex gap-2">
            <button onClick={() => setSelectedIds([])} className="text-xs text-zinc-400 hover:text-zinc-200 px-3 py-1.5">Batal</button>
            {canEdit && (
              <button 
                onClick={handleDeleteSelected} 
                disabled={deleting}
                className="flex items-center gap-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
              >
                {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash size={12} />}
                Hapus
              </button>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-10">
                  <input 
                    type="checkbox" 
                    className="rounded border-zinc-700 bg-zinc-800 accent-emerald-500 w-3.5 h-3.5"
                    checked={orders.length > 0 && selectedIds.length === orders.length}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedIds(orders.map((o: any) => o.id))
                      else setSelectedIds([])
                    }}
                  />
                 </th>
                <th className="w-36">No. Pesanan</th>
                <th className="w-36">No. Resi</th>
                <th className="w-32">SKU</th>
                <th>Produk</th>
                <th className="w-20">Platform</th>
                <th className="w-28">Penerima</th>
                <th className="w-28 text-right">Real Omzet</th>
                <th className="w-20 text-right">HPP</th>
                <th className="w-28">Status</th>
                <th className="w-24 text-right">Payout</th>
                {user?.userRole === 'OWNER' && <th className="w-16"></th>}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: user?.userRole === 'OWNER' ? 12 : 11 }).map((_, j) => (
                    <td key={j}><div className="h-4 bg-zinc-800 rounded animate-pulse" /></td>
                  ))}</tr>
                ))
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={user?.userRole === 'OWNER' ? 12 : 11} className="text-center py-12 text-zinc-600">
                    <ShoppingCart size={32} className="mx-auto mb-2 opacity-30" />
                    <p>Tidak ada pesanan</p>
                    {canEdit && <p className="text-xs mt-1">Upload file dari TikTok atau Shopee untuk mulai</p>}
                  </td>
                </tr>
              ) : (
                orders.map((o: any) => (
                  <tr key={o.id} className={selectedIds.includes(o.id) ? 'bg-zinc-800/50' : ''}>
                    <td>
                      <input 
                        type="checkbox" 
                        className="rounded border-zinc-700 bg-zinc-800 accent-emerald-500 w-3.5 h-3.5"
                        checked={selectedIds.includes(o.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedIds(p => [...p, o.id])
                          else setSelectedIds(p => p.filter(id => id !== o.id))
                        }}
                      />
                    </td>
                    <td>
                      <p className="font-mono text-xs text-zinc-300 truncate max-w-[130px]" title={o.orderNo}>{o.orderNo}</p>
                    </td>
                    <td>
                      {o.airwaybill ? <p className="font-mono text-[10px] text-zinc-400 truncate w-32">{o.airwaybill}</p> : <span className="text-zinc-600">—</span>}
                    </td>
                    <td>
                      <span className="font-mono text-xs text-zinc-400">{o.sku || '—'}</span>
                    </td>
                    <td>
                      <p className="text-xs text-zinc-300 line-clamp-2">{o.productName || '—'}</p>
                      {o.qty > 1 && <p className="text-[10px] text-zinc-600">x{o.qty}</p>}
                    </td>
                    <td>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        o.platform === 'TikTok' ? 'bg-pink-900/30 text-pink-400' :
                        o.platform === 'Shopee' ? 'bg-orange-900/30 text-orange-400' :
                        'bg-zinc-800 text-zinc-400'
                      }`}>{o.platform || '—'}</span>
                    </td>
                    <td>
                      <p className="text-xs text-zinc-300 truncate">{o.receiverName || '—'}</p>
                      <p className="text-[10px] text-zinc-600">{o.city}</p>
                    </td>
                    <td className="text-right">
                      <p className="text-xs font-medium text-emerald-400">{formatRupiah(o.realOmzet, true)}</p>
                      {o.totalProductPrice !== o.realOmzet && (
                        <p className="text-[10px] text-zinc-600">{formatRupiah(o.totalProductPrice, true)}</p>
                      )}
                    </td>
                    <td className="text-right">
                      <p className="text-xs text-zinc-500">{o.hpp ? formatRupiah(o.hpp, true) : '—'}</p>
                    </td>
                    <td>
                      <StatusBadge status={o.status} />
                      {/* Tanggal relevan di bawah status */}
                      {o.payoutReleasedDate ? (
                        <p className="text-[9px] text-emerald-600 mt-0.5">
                          Cair: {new Date(o.payoutReleasedDate).toLocaleDateString('id-ID', { day:'2-digit', month:'short' })}
                        </p>
                      ) : o.status?.toLowerCase().startsWith('terkirim') && o.orderCreatedAt ? (
                        <p className="text-[9px] text-zinc-600 mt-0.5">
                          {o.orderCreatedAt.slice(0, 10)}
                        </p>
                      ) : null}
                    </td>
                    <td className="text-right">
                      {o.payoutAllocated != null
                        ? <span className="text-xs font-semibold text-cyan-400">{formatRupiah(o.payoutAllocated, true)}</span>
                        : <span className="text-zinc-700 text-[10px]">—</span>
                      }
                    </td>
                    {user?.userRole === 'OWNER' && (
                      <td>
                        <button onClick={() => setEditingOrder(o)} className="p-1 px-2 text-[10px] bg-zinc-800 text-zinc-400 hover:text-white rounded">
                          Edit
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800">
            <p className="text-xs text-zinc-500">
              {((page - 1) * limit) + 1}–{Math.min(page * limit, total)} dari {total.toLocaleString('id')}
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1.5 rounded bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30">
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs text-zinc-400 px-2">{page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="p-1.5 rounded bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Preview Dialog */}
      {showPreview && previewData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/50">
              <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
                <CheckCircle2 className="text-emerald-400" size={18} />
                Preview Import {previewData.platform}
              </h2>
              <button onClick={cancelUpload} className="text-zinc-500 hover:text-zinc-300">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto">
              <div className={`grid gap-4 mb-6 ${previewData.failedCount > 0 ? 'grid-cols-4' : 'grid-cols-3'}`}>
                <div className="bg-zinc-950/50 border border-zinc-800 p-4 rounded-xl">
                  <p className="text-xs text-zinc-500 mb-1">Total Data Dibaca</p>
                  <p className="text-2xl font-bold text-zinc-100">{previewData.totalParsed}</p>
                </div>
                <div className="bg-emerald-950/20 border border-emerald-900 p-4 rounded-xl">
                  <p className="text-xs text-zinc-500 mb-1">Siap Diimport</p>
                  <p className="text-2xl font-bold text-emerald-400">{previewData.toInsertCount}</p>
                </div>
                <div className="bg-amber-950/20 border border-amber-900/50 p-4 rounded-xl">
                  <p className="text-xs text-zinc-500 mb-1">Dilewati (Duplikat)</p>
                  <p className="text-2xl font-bold text-amber-500">{previewData.skipped}</p>
                </div>
                {previewData.failedCount > 0 && (
                  <div className="bg-red-950/30 border border-red-800/50 p-4 rounded-xl">
                    <p className="text-xs text-zinc-500 mb-1">Gagal (SKU tidak ada)</p>
                    <p className="text-2xl font-bold text-red-400">{previewData.failedCount}</p>
                  </div>
                )}
              </div>

              {/* Failed rows section */}
              {previewData.failedCount > 0 && (
                <div className="mb-6 bg-red-950/20 border border-red-800/40 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-red-800/40 flex items-center gap-2">
                    <AlertCircle size={14} className="text-red-400" />
                    <span className="text-sm font-medium text-red-300">Baris Gagal — SKU Gabungan Tidak Ditemukan</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="text-zinc-500 border-b border-red-800/30">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">No. Baris</th>
                          <th className="px-3 py-2 text-left font-medium">No. Pesanan / Order ID</th>
                          <th className="px-3 py-2 text-left font-medium">SKU (tidak ditemukan)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-red-800/20">
                        {previewData.failed.map((f: any, i: number) => (
                          <tr key={i} className="text-zinc-300">
                            <td className="px-3 py-2 text-zinc-500">{f.rowNumber}</td>
                            <td className="px-3 py-2 font-mono">{f.orderNo}</td>
                            <td className="px-3 py-2 text-red-300 font-mono">{f.sku}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-4 py-3 border-t border-red-800/30 bg-zinc-900/30">
                    <p className="text-xs font-medium text-zinc-400 mb-2">📋 Langkah yang harus dilakukan tim:</p>
                    <ol className="text-xs text-zinc-500 space-y-1 list-decimal list-inside">
                      <li>Buka menu <span className="text-white font-medium">Produk Gabungan</span> di sidebar</li>
                      <li>Klik <span className="text-white font-medium">Tambah</span> atau <span className="text-white font-medium">Import Excel</span></li>
                      <li>Masukkan mapping: <span className="text-yellow-400">SKU di atas</span> (Kolom A) → SKU internal yang benar (Kolom B)</li>
                      <li>Setelah semua mapping ditambahkan, <span className="text-white font-medium">upload ulang file order ini</span></li>
                    </ol>
                  </div>
                </div>
              )}

              {previewData.toInsertCount === 0 ? (
                <div className="py-8 text-center bg-zinc-950/50 rounded-xl border border-dashed border-zinc-800">
                  <AlertCircle size={24} className="mx-auto mb-2 text-zinc-600" />
                  <p className="font-medium text-zinc-300">Tidak ada data baru yang bisa diimport.</p>
                  <p className="text-sm text-zinc-500 mt-1">Semua pesanan di dalam file ini sudah ada di sistem.</p>
                </div>
              ) : (
                <div>
                  <h3 className="text-sm font-medium text-zinc-400 mb-3 flex items-center gap-2">
                    <div className="h-px bg-zinc-800 flex-1"></div>
                    Menampilkan {previewData.previewItems.length} data pertama
                    <div className="h-px bg-zinc-800 flex-1"></div>
                  </h3>
                  
                  <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-zinc-900/50 text-zinc-500">
                          <tr>
                            <th className="px-3 py-2 font-medium">No. Pesanan</th>
                            <th className="px-3 py-2 font-medium">SKU</th>
                            <th className="px-3 py-2 font-medium">Produk</th>
                            <th className="px-3 py-2 font-medium">Harga / Omzet</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/50 text-zinc-300">
                          {previewData.previewItems.map((item: any, i: number) => (
                            <tr key={i} className="hover:bg-zinc-900/50">
                              <td className="px-3 py-2 font-mono">{item.orderNo}</td>
                              <td className="px-3 py-2">{item.sku || '-'}</td>
                              <td className="px-3 py-2 line-clamp-1" title={item.productName}>{item.productName}</td>
                              <td className="px-3 py-2 font-medium text-emerald-400">
                                {formatRupiah(item.realOmzet, true)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-zinc-800 bg-zinc-900/50 flex gap-3 justify-end items-center">
              <button 
                onClick={cancelUpload}
                disabled={importing}
                className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
              >
                Batal
              </button>
              <button
                onClick={confirmUpload}
                disabled={importing || previewData.toInsertCount === 0}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                {importing ? "Mengimport..." : "Konfirmasi & Import"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Dialog (Owner Only) */}
      {editingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm p-6">
            <h2 className="text-base font-semibold text-white mb-4">Edit Pesanan (Owner)</h2>
            <form onSubmit={(e) => {
              const formData = new FormData(e.currentTarget)
              handleEditSubmit(e, {
                status: formData.get('status'),
                airwaybill: formData.get('airwaybill'),
                qty: formData.get('qty'),
                realOmzet: formData.get('realOmzet'),
                totalProductPrice: formData.get('totalProductPrice')
              })
            }} className="space-y-3">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Status</label>
                <input name="status" defaultValue={editingOrder.status} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none"/>
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">No. Resi</label>
                <input name="airwaybill" defaultValue={editingOrder.airwaybill || ''} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none"/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Qty</label>
                  <input name="qty" type="number" defaultValue={editingOrder.qty} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none"/>
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Harga Produk</label>
                  <input name="totalProductPrice" type="number" defaultValue={editingOrder.totalProductPrice} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none"/>
                </div>
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Real Omzet</label>
                <input name="realOmzet" type="number" defaultValue={editingOrder.realOmzet} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm border-emerald-500/50 text-emerald-400 focus:outline-none"/>
              </div>
              <div className="flex gap-2 pt-3">
                <button type="button" onClick={() => setEditingOrder(null)} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg py-2 text-sm">Batal</button>
                <button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg py-2 text-sm font-medium">Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
