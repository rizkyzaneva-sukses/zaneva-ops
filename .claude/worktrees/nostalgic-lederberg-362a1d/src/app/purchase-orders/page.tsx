'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect, useRef, useCallback } from 'react'
import { formatRupiah, formatDate, downloadCSV } from '@/lib/utils'
import { useToast } from '@/components/ui/toaster'
import { useAuth } from '@/components/providers'
import { FileText, Plus, ChevronLeft, ChevronRight, Search, Eye, FileDown, Printer, X, CreditCard, ChevronDown, Pencil, Trash2, AlertTriangle } from 'lucide-react'
import { PayVendorModal } from '@/components/ui/pay-vendor-modal'

const PO_STATUS_COLOR: Record<string, string> = {
  OPEN: 'badge-warning', PARTIAL: 'badge-info', COMPLETED: 'badge-success', CANCELLED: 'badge-danger',
}
const PAY_STATUS_COLOR: Record<string, string> = {
  UNPAID: 'badge-danger', PARTIAL_PAID: 'badge-warning', PAID: 'badge-success',
}

function POItemSelect({ item, onSelect }: { item: any; onSelect: (product: any) => void }) {
  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [loadingSuggest, setLoadingSuggest] = useState(false)
  const [displayName, setDisplayName] = useState(item.sku ? `${item.sku}${item.productName ? ' — ' + item.productName : ''}` : 'Pilih SKU...')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const fetchSuggestions = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!q.trim()) {
      setSuggestions([])
      return
    }
    debounceRef.current = setTimeout(async () => {
      setLoadingSuggest(true)
      try {
        const res = await fetch(`/api/products/search?q=${encodeURIComponent(q)}&limit=30`)
        const json = await res.json()
        setSuggestions(json.data ?? [])
      } catch {
        setSuggestions([])
      } finally {
        setLoadingSuggest(false)
      }
    }, 200)
  }, [])

  const handleOpen = () => {
    setOpen(true)
    setSearchQuery('')
    setSuggestions([])
  }

  const handleSelect = (p: any) => {
    onSelect(p)
    setDisplayName(`${p.sku} — ${p.productName}`)
    setOpen(false)
    setSearchQuery('')
  }

  return (
    <div className="relative flex-1" ref={dropdownRef}>
      <button
        type="button"
        onClick={handleOpen}
        className="w-full text-left bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none flex justify-between items-center transition-colors hover:border-zinc-600"
      >
        <span className="truncate">{displayName}</span>
        <ChevronDown size={14} className="text-zinc-500 shrink-0 ml-2" />
      </button>

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl overflow-hidden">
          <div className="p-2 border-b border-zinc-700">
            <input
              autoFocus
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); fetchSuggestions(e.target.value) }}
              placeholder="Ketik SKU atau nama produk..."
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
            />
          </div>
          <div className="max-h-52 overflow-y-auto divide-y divide-zinc-700/50">
            {loadingSuggest && (
              <p className="text-center py-3 text-xs text-zinc-500 animate-pulse">Mencari...</p>
            )}
            {!loadingSuggest && suggestions.map(p => (
              <button
                key={p.sku}
                type="button"
                onClick={() => handleSelect(p)}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-zinc-700 transition-colors ${item.sku === p.sku ? 'bg-emerald-900/30 text-emerald-300' : 'text-zinc-300'}`}
              >
                <span className="font-mono text-emerald-400/80 mr-1.5">{p.sku}</span>— {p.productName}
              </button>
            ))}
            {!loadingSuggest && searchQuery.length > 0 && suggestions.length === 0 && (
              <p className="text-center py-3 text-xs text-zinc-500">Produk tidak ditemukan</p>
            )}
            {!loadingSuggest && searchQuery.length === 0 && (
              <p className="text-center py-3 text-xs text-zinc-500">Ketik untuk mencari produk...</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Create / Edit PO Modal ────────────────────────────────────────
function POFormModal({
  vendors,
  editPO,
  onClose,
}: {
  vendors: any[]
  editPO: any | null  // null = create mode
  onClose: () => void
}) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const isEdit = !!editPO

  const [poNumberOverride, setPoNumberOverride] = useState(isEdit ? editPO.poNumber : '')
  const [vendorId, setVendorId] = useState(isEdit ? editPO.vendorId : '')
  const [poDate, setPoDate] = useState(isEdit ? editPO.poDate?.slice(0, 10) : new Date().toISOString().slice(0, 10))
  const [expectedDate, setExpectedDate] = useState(isEdit ? (editPO.expectedDate?.slice(0, 10) || '') : '')
  const [note, setNote] = useState(isEdit ? (editPO.note || '') : '')
  const [items, setItems] = useState<{ sku: string; productName?: string; categoryName?: string; qtyOrder: number }[]>(
    isEdit
      ? (editPO.items?.map((it: any) => ({ sku: it.sku, productName: it.productName, categoryName: '', qtyOrder: it.qtyOrder })) || [{ sku: '', qtyOrder: 1 }])
      : [{ sku: '', qtyOrder: 1 }]
  )
  const [loading, setLoading] = useState(false)
  const [autoSplit, setAutoSplit] = useState(false)

  const addItem = () => setItems(p => [...p, { sku: '', qtyOrder: 1 }])
  const removeItem = (i: number) => setItems(p => p.filter((_, idx) => idx !== i))
  const updateItem = (i: number, field: string, val: any) =>
    setItems(p => p.map((item, idx) => idx === i ? { ...item, [field]: val } : item))

  const validItems = items.filter(i => i.sku && i.qtyOrder > 0)
  const categoryGroups = validItems.reduce<Record<string, typeof validItems>>((acc, item) => {
    const cat = item.categoryName || 'Tanpa Kategori'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {})
  const categories = Object.keys(categoryGroups)
  const isMultiCategory = categories.length > 1

  function buildSplitPONumbers(base: string, count: number): string[] {
    const match = base.trim().match(/^(.*?)(\d+)$/)
    if (!match) return Array.from({ length: count }, (_, i) => i === 0 ? base.trim() : `${base.trim()}-${i + 1}`)
    const [, prefix, numStr] = match
    const start = parseInt(numStr)
    const pad = numStr.length
    return Array.from({ length: count }, (_, i) => `${prefix}${String(start + i).padStart(pad, '0')}`)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!vendorId) { toast({ title: 'Pilih vendor', type: 'error' }); return }
    if (!validItems.length) { toast({ title: 'Tambah minimal 1 item', type: 'error' }); return }
    setLoading(true)
    try {
      if (autoSplit && isMultiCategory && !isEdit) {
        const poNumbers = buildSplitPONumbers(poNumberOverride.trim() || '', categories.length)
        const results: string[] = []
        for (let i = 0; i < categories.length; i++) {
          const cat = categories[i]
          const catItems = categoryGroups[cat].map(item => ({ sku: item.sku, qtyOrder: item.qtyOrder }))
          const payload = { vendorId, poDate, expectedDate: expectedDate || null, note, items: catItems, ...(poNumbers[i] ? { poNumberOverride: poNumbers[i] } : {}) }
          const res = await fetch('/api/purchase-orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
          const json = await res.json()
          if (!res.ok) throw new Error(`Gagal buat PO untuk kategori ${cat}: ${json.error}`)
          results.push(json.data.poNumber)
        }
        toast({ title: `${results.length} PO berhasil dibuat: ${results.join(', ')}`, type: 'success' })
      } else {
        const payload = {
          vendorId,
          poDate,
          expectedDate: expectedDate || null,
          note,
          items: validItems.map(i => ({ sku: i.sku, qtyOrder: i.qtyOrder })),
          ...(poNumberOverride.trim() && !isEdit ? { poNumberOverride: poNumberOverride.trim() } : {}),
        }
        const res = isEdit
          ? await fetch('/api/purchase-orders', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editPO.id, ...payload }) })
          : await fetch('/api/purchase-orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error)
        toast({ title: isEdit ? `PO berhasil diperbarui` : `PO ${json.data.poNumber} berhasil dibuat`, type: 'success' })
      }
      qc.invalidateQueries({ queryKey: ['purchase-orders'] })
      onClose()
    } catch (err: any) {
      toast({ title: err.message || 'Gagal', type: 'error' })
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl p-6 pb-8 max-h-[92vh] overflow-y-auto">
        <h2 className="text-base font-semibold text-white mb-5">
          {isEdit ? `Edit PO — ${editPO.poNumber}` : 'Buat Purchase Order'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Row 1: No PO + Vendor */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">
                No. PO {!isEdit && <span className="text-zinc-600">(kosong = auto)</span>}
              </label>
              <input
                value={poNumberOverride}
                onChange={e => setPoNumberOverride(e.target.value)}
                placeholder={isEdit ? editPO.poNumber : 'Auto-generate...'}
                disabled={isEdit}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Vendor *</label>
              <select value={vendorId} onChange={e => setVendorId(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none">
                <option value="">Pilih vendor</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.namaVendor}</option>)}
              </select>
            </div>
          </div>

          {/* Row 2: Tanggal PO + Estimasi Tiba */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Tanggal PO *</label>
              <input type="date" value={poDate} onChange={e => setPoDate(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none"/>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Estimasi Tiba</label>
              <input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none"/>
            </div>
          </div>

          {/* Catatan */}
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Catatan</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Opsional"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none"/>
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-zinc-500 font-medium">Items</label>
              <button type="button" onClick={addItem} className="text-xs text-emerald-400 hover:text-emerald-300">+ Tambah Item</button>
            </div>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="flex gap-2">
                  <POItemSelect
                    item={item}
                    onSelect={(p) => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, sku: p.sku, productName: p.productName, categoryName: p.categoryName || '' } : it))}
                  />
                  <input type="number" min={1} value={item.qtyOrder} onChange={e => updateItem(i, 'qtyOrder', Number(e.target.value))}
                    className="w-24 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none"/>
                  {items.length > 1 && (
                    <button type="button" onClick={() => removeItem(i)} className="text-zinc-600 hover:text-red-400 px-2">✕</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Auto Split Toggle */}
          {!isEdit && validItems.length > 0 && (
            <div className="border border-zinc-700 rounded-xl p-3 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={autoSplit} onChange={e => setAutoSplit(e.target.checked)}
                  className="w-3.5 h-3.5 accent-emerald-500" />
                <span className="text-xs text-zinc-300 font-medium">Auto Split berdasarkan Kategori</span>
                {isMultiCategory && <span className="text-[10px] bg-emerald-900/40 text-emerald-400 border border-emerald-800 px-1.5 py-0.5 rounded-full">{categories.length} kategori terdeteksi</span>}
              </label>
              {autoSplit && isMultiCategory && (
                <div className="space-y-1 pt-1">
                  {(() => {
                    const poNums = buildSplitPONumbers(poNumberOverride.trim() || '???', categories.length)
                    return categories.map((cat, i) => (
                      <div key={cat} className="flex items-start gap-2 text-[11px]">
                        <span className="font-mono text-emerald-400 shrink-0 w-24 truncate">{poNums[i]}</span>
                        <span className="text-zinc-500">→</span>
                        <span className="text-zinc-400">[{cat}]</span>
                        <span className="text-zinc-500">{categoryGroups[cat].map(it => it.sku).join(', ')} ({categoryGroups[cat].length} item)</span>
                      </div>
                    ))
                  })()}
                </div>
              )}
              {autoSplit && !isMultiCategory && (
                <p className="text-[11px] text-zinc-500">Semua item dalam 1 kategori — tidak perlu split.</p>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg py-2 text-sm transition-colors">Batal</button>
            <button type="submit" disabled={loading} className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-medium transition-colors">
              {loading ? 'Menyimpan...' : isEdit ? 'Simpan Perubahan' : autoSplit && isMultiCategory ? `Buat ${categories.length} PO` : 'Buat PO'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function DetailPOModal({ po, onClose, onDownload, onPrint }: { po: any; onClose: () => void; onDownload: (po: any) => void; onPrint: (po: any) => void }) {
  const totalOutstanding = po.totalAmount - po.totalPaid
  const progressPct = po.totalQtyOrder > 0 ? Math.round((po.totalQtyReceived / po.totalQtyOrder) * 100) : 0

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-zinc-800">
          <div>
            <p className="text-xs text-zinc-500 mb-0.5">Detail PO:</p>
            <h2 className="text-sm font-bold text-emerald-400 font-mono">{po.poNumber}</h2>
            <p className="text-xs text-zinc-400 mt-1">Vendor: <span className="text-zinc-200">{po.vendorName}</span></p>
          </div>
          <div className="flex items-start gap-6 text-right">
            <div>
              <p className="text-xs text-zinc-500">Tanggal:</p>
              <p className="text-xs text-zinc-200">{formatDate(po.poDate)}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Progress</p>
              <p className="text-xs text-zinc-200 font-bold">{progressPct}%  <span className="text-zinc-500 font-normal">{po.totalQtyReceived}/{po.totalQtyOrder}</span></p>
            </div>
            <div className="flex gap-1.5 items-center">
              <span className="badge-warning text-[10px] font-bold">{po.status}</span>
            </div>
            <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors"><X size={18} /></button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 divide-x divide-zinc-800 border-b border-zinc-800">
          <div className="px-6 py-3">
            <p className="text-xs text-zinc-500 mb-1">Total PO</p>
            <p className="text-sm font-bold text-white">{formatRupiah(po.totalAmount, true)}</p>
          </div>
          <div className="px-6 py-3">
            <p className="text-xs text-zinc-500 mb-1">Terbayar</p>
            <p className="text-sm font-bold text-emerald-400">{formatRupiah(po.totalPaid, true)}</p>
          </div>
          <div className="px-6 py-3">
            <p className="text-xs text-zinc-500 mb-1">Outstanding</p>
            <p className="text-sm font-bold text-amber-400">{formatRupiah(totalOutstanding, true)}</p>
          </div>
        </div>

        {/* Items Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-zinc-800/80 backdrop-blur-sm">
              <tr>
                <th className="text-left px-4 py-2 text-zinc-400 font-medium w-24">SKU</th>
                <th className="text-left px-4 py-2 text-zinc-400 font-medium">Produk</th>
                <th className="text-right px-4 py-2 text-zinc-400 font-medium w-24">HPP</th>
                <th className="text-right px-4 py-2 text-zinc-400 font-medium w-16">Order</th>
                <th className="text-right px-4 py-2 text-zinc-400 font-medium w-20">Received</th>
                <th className="text-right px-4 py-2 text-zinc-400 font-medium w-20">Outstanding</th>
                <th className="text-right px-4 py-2 text-zinc-400 font-medium w-28">Subtotal</th>
                <th className="text-center px-4 py-2 text-zinc-400 font-medium w-20">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {(po.items || []).map((item: any) => {
                const outstanding = item.qtyOrder - (item.qtyReceived || 0)
                const subtotal = item.qtyOrder * item.unitPrice
                return (
                  <tr key={item.id} className="hover:bg-zinc-800/50 transition-colors">
                    <td className="px-4 py-2 font-mono text-emerald-400">{item.sku}</td>
                    <td className="px-4 py-2 text-zinc-200">{item.productName}</td>
                    <td className="px-4 py-2 text-right text-zinc-400">{formatRupiah(item.unitPrice, true)}</td>
                    <td className="px-4 py-2 text-right text-zinc-200 font-bold">{item.qtyOrder}</td>
                    <td className="px-4 py-2 text-right text-emerald-400">{item.qtyReceived || 0}</td>
                    <td className="px-4 py-2 text-right text-amber-400">{outstanding}</td>
                    <td className="px-4 py-2 text-right text-zinc-200">{formatRupiah(subtotal, true)}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={outstanding > 0 ? 'badge-warning text-[10px]' : 'badge-success text-[10px]'}>
                        {outstanding > 0 ? 'OPEN' : 'DONE'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800">
          <p className="text-xs text-zinc-500">{po.items?.length || 0} item • dibuat oleh {po.createdBy || '-'}</p>
          <div className="flex gap-2">
            <button onClick={() => onDownload(po)} className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-blue-400 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors border border-zinc-700">
              <FileDown size={13} /> Download CSV
            </button>
            <button onClick={() => onPrint(po)} className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-emerald-400 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors border border-zinc-700">
              <Printer size={13} /> Cetak PDF
            </button>
            <button onClick={onClose} className="bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg px-4 py-1.5 text-xs font-medium transition-colors">Tutup</button>
          </div>
        </div>
      </div>
    </div>
  )
}

const PRINT_TWO_COLUMN_THRESHOLD = 18

function getPrintableItemColumns(items: any[]) {
  if (items.length <= PRINT_TWO_COLUMN_THRESHOLD) return [items]
  const midpoint = Math.ceil(items.length / 2)
  return [items.slice(0, midpoint), items.slice(midpoint)]
}

function PrintablePOContent({ po }: { po: any }) {
  const items = po.items || []
  const itemColumns = getPrintableItemColumns(items)
  const printedAt = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date())

  return (
    <div className="po-print-sheet mx-auto w-full max-w-[794px] bg-white text-black shadow-sm">
      <div className="border border-zinc-300 px-6 py-4 sm:px-8 sm:py-6">
        <div className="mb-4 flex items-center justify-between text-[10px] text-zinc-600">
          <span>{printedAt}</span>
          <span className="font-medium tracking-wide">ELYASR Business Operation</span>
        </div>

        <h1 className="mb-5 text-center text-2xl font-bold uppercase tracking-[0.2em]">Purchase Order</h1>

        <div className="mb-4 grid grid-cols-2 gap-6 text-[11px] leading-5">
          <div>
            <p><span className="font-bold">No. PO:</span> {po.poNumber}</p>
            <p><span className="font-bold">Tanggal PO:</span> {formatDate(po.poDate)}</p>
            <p><span className="font-bold">Estimasi Tiba:</span> {po.expectedDate ? formatDate(po.expectedDate) : '-'}</p>
          </div>
          <div className="text-right">
            <p className="font-bold">Kepada Vendor:</p>
            <p>{po.vendorName}</p>
            {po.vendor?.kontak && <p>{po.vendor.kontak}</p>}
          </div>
        </div>

        <div className={`mb-4 grid gap-3 ${itemColumns.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {itemColumns.map((columnItems, columnIndex) => {
            const startNumber = columnIndex === 0 ? 0 : itemColumns[0].length
            return (
              <div key={`column-${columnIndex}`} className="po-table-block">
                <table className="w-full table-fixed border-collapse border border-zinc-800 text-[10px] leading-tight">
                  <thead>
                    <tr className="bg-zinc-100">
                      <th className="w-9 border border-zinc-800 px-1.5 py-1 text-left font-bold">No</th>
                      <th className="w-20 border border-zinc-800 px-1.5 py-1 text-left font-bold">SKU</th>
                      <th className="border border-zinc-800 px-1.5 py-1 text-left font-bold">Nama Produk</th>
                      <th className="w-14 border border-zinc-800 px-1.5 py-1 text-center font-bold">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {columnItems.map((item: any, itemIndex: number) => (
                      <tr key={item.id ?? `${item.sku}-${columnIndex}-${itemIndex}`}>
                        <td className="border border-zinc-300 px-1.5 py-1 align-top">{startNumber + itemIndex + 1}</td>
                        <td className="border border-zinc-300 px-1.5 py-1 align-top font-mono">{item.sku}</td>
                        <td className="border border-zinc-300 px-1.5 py-1">{item.productName}</td>
                        <td className="border border-zinc-300 px-1.5 py-1 text-center font-bold">{item.qtyOrder}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>

        <div className="po-notes-block mb-6">
          <p className="mb-1 text-[11px] font-bold">Catatan:</p>
          <div className="min-h-[48px] border border-zinc-300 px-3 py-2 text-[10px] leading-4">
            {po.note || '-'}
          </div>
        </div>

        <div className="po-signature-block grid grid-cols-2 gap-10 px-8 pt-2 text-center text-[11px]">
          <div>
            <p className="mb-12 font-bold">Vendor</p>
            <div className="border-t border-black" />
          </div>
          <div>
            <p className="mb-12 font-bold">Purchasing</p>
            <div className="border-t border-black" />
          </div>
        </div>
      </div>
    </div>
  )
}

function PrintPOModal({ po, onClose }: { po: any; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <style>{`
        @page { size: A4 portrait; margin: 10mm; }
        @media print {
          html, body { background: white !important; }
          body * { visibility: hidden; }
          #printable-po, #printable-po * { visibility: visible; }
          #printable-po {
            position: absolute;
            inset: 0;
            width: 100%;
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
            color: black !important;
            overflow: visible !important;
          }
          .po-print-modal {
            width: 100% !important;
            max-width: none !important;
            max-height: none !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            overflow: visible !important;
          }
          .po-print-scroll {
            overflow: visible !important;
            padding: 0 !important;
            background: white !important;
          }
          .po-print-sheet {
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            box-shadow: none !important;
          }
          .po-table-block,
          .po-notes-block,
          .po-signature-block {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .no-print { display: none !important; }
        }
      `}</style>
      
      <div className="po-print-modal bg-white rounded-xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden relative">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-zinc-50 border-zinc-200 no-print">
          <h2 className="text-base font-bold text-zinc-800">Print Purchase Order</h2>
          <div className="flex gap-2">
            <button onClick={() => window.print()} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded px-4 py-1.5 text-sm font-medium transition-colors">
              <Printer size={14} /> Print
            </button>
            <button onClick={onClose} className="p-1.5 rounded bg-zinc-200 hover:bg-zinc-300 text-zinc-600 transition-colors">
              <span className="sr-only">Tutup</span>✕
            </button>
          </div>
        </div>
        
        <div className="po-print-scroll flex-1 overflow-auto bg-zinc-100 p-4 sm:p-6" id="printable-po">
          <PrintablePOContent po={po} />
        </div>
      </div>
    </div>
  )
}

export default function PurchaseOrdersPage() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const { toast } = useToast()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const [editPO, setEditPO] = useState<any>(null)
  const [printPO, setPrintPO] = useState<any>(null)
  const [detailPO, setDetailPO] = useState<any>(null)
  const [payPO, setPayPO] = useState<any>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const limit = 20

  const { data, isLoading } = useQuery({
    queryKey: ['purchase-orders', search, status, page],
    queryFn: () => {
      const p = new URLSearchParams({ search, status, page: String(page), limit: String(limit) })
      return fetch(`/api/purchase-orders?${p}`).then(r => r.json()).then(d => d.data)
    },
  })

  const { data: vendors } = useQuery({
    queryKey: ['vendors-all'],
    queryFn: () => fetch('/api/vendors?all=true').then(r => r.json()).then(d => d.data ?? []),
  })

  const pos = data?.purchaseOrders ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / limit)

  const isOwner = user?.userRole === 'OWNER'
  const isFinance = user?.userRole === 'FINANCE'

  const handlePrint = (po: any) => setPrintPO(po)

  const handleDownload = (po: any) => {
    const rows = (po.items || []).map((item: any) => ({
      'Kode PO': po.poNumber,
      'SKU': item.sku,
      'Nama Artikel': item.productName,
      'Qty Order': item.qtyOrder,
      'Qty Receive': item.qtyReceived || 0,
      'HPP': item.unitPrice,
      'Subtotal': item.qtyOrder * item.unitPrice
    }))
    downloadCSV(`PO-${po.poNumber}.csv`, rows)
  }

  const handleDelete = async (po: any) => {
    const isRequestOnly = isFinance

    if (isRequestOnly) {
      if (!confirm(`Request delete PO ${po.poNumber}? Owner akan dinotifikasi.`)) return
    } else {
      if (!confirm(`Hapus PO ${po.poNumber}? Semua item PO ini akan dihapus.`)) return
    }

    setDeletingId(po.id)
    try {
      const res = await fetch('/api/purchase-orders', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: po.id, requestOnly: isRequestOnly }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ title: json.data.message, type: 'success' })
      qc.invalidateQueries({ queryKey: ['purchase-orders'] })
    } catch (err: any) {
      toast({ title: err.message || 'Gagal', type: 'error' })
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <AppLayout>
      {detailPO && (
        <DetailPOModal
          po={detailPO}
          onClose={() => setDetailPO(null)}
          onDownload={(po) => { handleDownload(po) }}
          onPrint={(po) => { setDetailPO(null); setPrintPO(po) }}
        />
      )}
      {printPO && (
        <PrintPOModal po={printPO} onClose={() => setPrintPO(null)} />
      )}
      {payPO && (
        <PayVendorModal
          prefillVendorId={payPO.vendorId}
          prefillPoId={payPO.id}
          onClose={() => setPayPO(null)}
          onSuccess={() => {
            setPayPO(null)
            qc.invalidateQueries({ queryKey: ['purchase-orders'] })
          }}
        />
      )}
      {(showCreate || editPO) && vendors && (
        <POFormModal
          vendors={vendors}
          editPO={editPO}
          onClose={() => { setShowCreate(false); setEditPO(null) }}
        />
      )}

      <div className="page-header">
        <h1 className="page-title flex items-center gap-2"><FileText size={22} className="text-emerald-400"/>Purchase Orders</h1>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors">
          <Plus size={14}/> Buat PO
        </button>
      </div>

      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"/>
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Cari no. PO atau vendor..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"/>
        </div>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-400 focus:outline-none">
          <option value="">Semua Status</option>
          {['OPEN','PARTIAL','COMPLETED','CANCELLED'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-36">No. PO</th>
                <th>Vendor</th>
                <th className="w-24">Tgl PO</th>
                <th className="w-20 text-center">Items</th>
                <th className="w-28 text-right">Total</th>
                <th className="w-28 text-right">Terbayar</th>
                <th className="w-24">Status</th>
                <th className="w-20 text-center">Diterima</th>
                <th className="w-24 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? Array.from({length:6}).map((_,i)=>(
                <tr key={i}>{Array.from({length:9}).map((_,j)=><td key={j}><div className="h-4 bg-zinc-800 rounded animate-pulse"/></td>)}</tr>
              )) : pos.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-10 text-zinc-600">Belum ada Purchase Order</td></tr>
              ) : pos.map((po: any) => {
                const isDeleteReq = po.note?.startsWith('[DELETE_REQUESTED')
                return (
                  <tr key={po.id} className={isDeleteReq ? 'bg-red-950/20' : ''}>
                    <td>
                      <span className="font-mono text-xs text-zinc-300">{po.poNumber}</span>
                      {isDeleteReq && (
                        <span className="ml-1.5 text-[9px] text-red-400 bg-red-900/30 border border-red-900/40 px-1.5 py-0.5 rounded font-medium">
                          DELETE REQ
                        </span>
                      )}
                    </td>
                    <td><p className="text-xs text-zinc-300">{po.vendorName}</p></td>
                    <td className="text-xs text-zinc-400">{formatDate(po.poDate)}</td>
                    <td className="text-center text-xs text-zinc-400">{po.totalItems}</td>
                    <td className="text-right text-xs text-zinc-300">{formatRupiah(po.totalAmount, true)}</td>
                    <td className="text-right text-xs text-emerald-400">{formatRupiah(po.totalPaid, true)}</td>
                    <td>
                      <span className={PO_STATUS_COLOR[po.status] || 'badge-muted'}>{po.status}</span>
                      <span className={`${PAY_STATUS_COLOR[po.paymentStatus] || 'badge-muted'} ml-1 text-[10px]`}>{po.paymentStatus}</span>
                    </td>
                    <td className="text-center"><span className="text-[10px] text-zinc-400 font-bold">{po.totalQtyReceived}/{po.totalQtyOrder}</span></td>
                    <td>
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => setDetailPO(po)} className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors" title="Detail">
                          <Eye size={13} />
                        </button>
                        <button onClick={() => handlePrint(po)} className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-emerald-400 transition-colors" title="Cetak PDF">
                          <Printer size={13} />
                        </button>
                        <button onClick={() => handleDownload(po)} className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-blue-400 transition-colors" title="Download CSV">
                          <FileDown size={13} />
                        </button>
                        {po.paymentStatus !== 'PAID' && (
                          <button onClick={() => setPayPO(po)} className="p-1.5 rounded bg-zinc-800 hover:bg-emerald-900/50 text-zinc-400 hover:text-emerald-400 transition-colors" title="Bayar Vendor">
                            <CreditCard size={13} />
                          </button>
                        )}
                        {/* Edit — OWNER only */}
                        {isOwner && (
                          <button onClick={() => setEditPO(po)} className="p-1.5 rounded bg-zinc-800 hover:bg-amber-900/40 text-zinc-400 hover:text-amber-400 transition-colors" title="Edit PO">
                            <Pencil size={13} />
                          </button>
                        )}
                        {/* Delete (Owner) / Request Delete (Finance) */}
                        {(isOwner || isFinance) && (
                          <button
                            onClick={() => handleDelete(po)}
                            disabled={deletingId === po.id}
                            className={`p-1.5 rounded transition-colors disabled:opacity-40 ${
                              isOwner
                                ? 'bg-zinc-800 hover:bg-red-900/40 text-zinc-400 hover:text-red-400'
                                : 'bg-zinc-800 hover:bg-orange-900/40 text-zinc-400 hover:text-orange-400'
                            }`}
                            title={isOwner ? 'Hapus PO' : 'Request Delete'}
                          >
                            {isOwner ? <Trash2 size={13} /> : <AlertTriangle size={13} />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800">
            <p className="text-xs text-zinc-500">{total} PO</p>
            <div className="flex gap-1 items-center">
              <button onClick={() => setPage(p=>Math.max(1,p-1))} disabled={page===1} className="p-1.5 rounded bg-zinc-800 text-zinc-400 disabled:opacity-30"><ChevronLeft size={14}/></button>
              <span className="text-xs text-zinc-400 px-2">{page}/{totalPages}</span>
              <button onClick={() => setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages} className="p-1.5 rounded bg-zinc-800 text-zinc-400 disabled:opacity-30"><ChevronRight size={14}/></button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
