'use client'

import { useQuery } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { formatDate, downloadCSV } from '@/lib/utils'
import { Package, Search, Download, RefreshCw, X, ArrowUpDown, ArrowUp, ArrowDown, History } from 'lucide-react'
import { useAuth } from '@/components/providers'

type SortDir = 'asc' | 'desc'
type SortCol = 'sku' | 'productName' | 'soh' | 'rop' | 'hpp' | 'value' | null

function SortIcon({ col, sortCol, sortDir }: { col: string; sortCol: SortCol; sortDir: SortDir }) {
  if (sortCol !== col) return <ArrowUpDown size={12} className="text-zinc-600 ml-1 inline-block" />
  if (sortDir === 'asc') return <ArrowUp size={12} className="text-emerald-400 ml-1 inline-block" />
  return <ArrowDown size={12} className="text-emerald-400 ml-1 inline-block" />
}

function LedgerModal({ sku, productName, onClose }: { sku: string; productName: string; onClose: () => void }) {
  const { data: ledger, isLoading } = useQuery({
    queryKey: ['ledger', sku],
    queryFn: async () => fetch(`/api/inventory/ledger?sku=${sku}`).then(res => res.json()).then(d => d.data?.ledger ?? [])
  })
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white">Riwayat Inventori (Ledger)</h2>
            <p className="text-xs text-zinc-400 mt-1">{sku} — {productName}</p>
          </div>
          <button onClick={onClose} className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-lg transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <table className="data-table w-full">
            <thead><tr>
              <th className="w-40">Tanggal</th>
              <th className="w-20 text-center">In/Out</th>
              <th className="w-24">Alasan</th>
              <th className="w-20 text-center">Qty</th>
              <th>Catatan</th>
              <th className="w-24">Oleh</th>
            </tr></thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="text-center py-8 text-zinc-500">Memuat riwayat...</td></tr>
              ) : !ledger || ledger.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-zinc-500">Belum ada riwayat</td></tr>
              ) : ledger.map((l: any) => (
                <tr key={l.id}>
                  <td className="text-xs text-zinc-400">{formatDate(l.trxDate, 'datetime')}</td>
                  <td className="text-center">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${l.direction === 'IN' ? 'bg-emerald-900/40 text-emerald-400' : 'bg-red-900/40 text-red-400'}`}>{l.direction}</span>
                  </td>
                  <td><span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-1 rounded">{l.reason}</span></td>
                  <td className="text-center font-bold text-sm text-zinc-200">{l.qty}</td>
                  <td className="text-xs text-zinc-500 truncate max-w-[150px]" title={l.note}>{l.note || '-'}</td>
                  <td className="text-xs text-zinc-500">{l.createdBy || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function StockBadge({ status }: { status: string }) {
  if (status === 'EMPTY') return <span className="badge-danger">Habis</span>
  if (status === 'LOW') return <span className="badge-warning">Kritis</span>
  return <span className="badge-success">Aman</span>
}

export function StokOverviewTab() {
  const { user } = useAuth()
  const hideHpp = user?.userRole === 'STAFF'
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'low' | 'empty'>('all')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [selectedLedgerSku, setSelectedLedgerSku] = useState<{sku: string, name: string} | null>(null)
  const [sortCol, setSortCol] = useState<SortCol>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  function handleSort(col: SortCol) {
    if (sortCol === col) {
      if (sortDir === 'asc') setSortDir('desc')
      else { setSortCol(null); setSortDir('asc') }
    } else { setSortCol(col); setSortDir('asc') }
  }

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['inventory', search, filter],
    queryFn: async () => {
      const params = new URLSearchParams({ search, belowRop: String(filter !== 'all') })
      const res = await fetch(`/api/inventory?${params}`)
      return res.json().then(d => d.data)
    },
  })

  const allProducts = data?.products ?? []
  const summary = data?.summary ?? {}
  const products = filter === 'empty'
    ? allProducts.filter((p: any) => p.soh <= 0)
    : filter === 'low'
    ? allProducts.filter((p: any) => p.soh > 0 && p.isBelowRop)
    : allProducts

  const categories = [...new Set(allProducts.map((p: any) => p.categoryName).filter(Boolean))] as string[]
  const filtered = categoryFilter ? products.filter((p: any) => p.categoryName === categoryFilter) : products

  const sorted = useMemo(() => {
    if (!sortCol) return filtered
    return [...filtered].sort((a: any, b: any) => {
      let va: any, vb: any
      if (sortCol === 'value') { va = (a.soh ?? 0) * (a.hpp ?? 0); vb = (b.soh ?? 0) * (b.hpp ?? 0) }
      else { va = a[sortCol]; vb = b[sortCol] }
      if (typeof va === 'number' && typeof vb === 'number') return sortDir === 'asc' ? va - vb : vb - va
      const cmp = String(va ?? '').localeCompare(String(vb ?? ''), undefined, { numeric: true, sensitivity: 'base' })
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [filtered, sortCol, sortDir])

  const handleExport = () => downloadCSV('stok-inventory.csv', sorted.map((p: any) => {
    const row: Record<string, any> = { SKU: p.sku, 'Nama Produk': p.productName, Kategori: p.categoryName || '', Satuan: p.unit, SOH: p.soh, ROP: p.rop, Status: p.stockStatus }
    if (!hideHpp) { row.HPP = p.hpp; row['Nilai Stok'] = p.soh * p.hpp }
    return row
  }))

  return (
    <>
      {selectedLedgerSku && (
        <LedgerModal sku={selectedLedgerSku.sku} productName={selectedLedgerSku.name} onClose={() => setSelectedLedgerSku(null)} />
      )}

      {/* Summary */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-zinc-500 text-sm">{summary.totalProducts ?? 0} produk aktif</p>
        <div className="flex gap-2">
          <button onClick={() => refetch()} className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors"><RefreshCw size={14} /></button>
          <button onClick={handleExport} className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg px-3 py-2 text-sm border border-zinc-700"><Download size={14} />Export</button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Stok Habis', value: summary.emptyStock ?? 0, color: 'text-red-400', key: 'empty' },
          { label: 'Stok Kritis', value: summary.lowStock ?? 0, color: 'text-yellow-400', key: 'low' },
          { label: 'Stok Aman', value: summary.okStock ?? 0, color: 'text-emerald-400', key: 'all' },
        ].map(c => (
          <button key={c.key} onClick={() => setFilter(c.key as any)}
            className={`stat-card text-left transition-all ${filter === c.key ? 'ring-2 ring-emerald-500/50' : ''}`}>
            <p className="text-zinc-500 text-xs mb-1">{c.label}</p>
            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
          </button>
        ))}
      </div>

      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari SKU atau nama produk..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
        </div>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none">
          <option value="">Semua Kategori</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead><tr>
              <th className="w-32"><button onClick={() => handleSort('sku')} className="flex items-center hover:text-zinc-200">SKU<SortIcon col="sku" sortCol={sortCol} sortDir={sortDir} /></button></th>
              <th><button onClick={() => handleSort('productName')} className="flex items-center hover:text-zinc-200">Nama Produk<SortIcon col="productName" sortCol={sortCol} sortDir={sortDir} /></button></th>
              <th className="w-28">Kategori</th>
              <th className="w-20 text-center"><button onClick={() => handleSort('soh')} className="flex items-center mx-auto hover:text-zinc-200">SOH<SortIcon col="soh" sortCol={sortCol} sortDir={sortDir} /></button></th>
              <th className="w-20 text-center"><button onClick={() => handleSort('rop')} className="flex items-center mx-auto hover:text-zinc-200">ROP<SortIcon col="rop" sortCol={sortCol} sortDir={sortDir} /></button></th>
              {!hideHpp && <th className="w-20 text-right"><button onClick={() => handleSort('hpp')} className="flex items-center ml-auto hover:text-zinc-200">HPP<SortIcon col="hpp" sortCol={sortCol} sortDir={sortDir} /></button></th>}
              {!hideHpp && <th className="w-28 text-right"><button onClick={() => handleSort('value')} className="flex items-center ml-auto hover:text-zinc-200">Nilai Stok<SortIcon col="value" sortCol={sortCol} sortDir={sortDir} /></button></th>}
              <th className="w-24">Status</th>
              <th className="w-28">Last Opname</th>
              <th className="w-16">Aksi</th>
            </tr></thead>
            <tbody>
              {isLoading ? Array.from({ length: 10 }).map((_, i) => (
                <tr key={i}>{Array.from({ length: hideHpp ? 7 : 9 }).map((_, j) => <td key={j}><div className="h-4 bg-zinc-800 rounded animate-pulse" /></td>)}</tr>
              )) : sorted.length === 0 ? (
                <tr><td colSpan={hideHpp ? 7 : 9} className="text-center py-12 text-zinc-600"><Package size={32} className="mx-auto mb-2 opacity-30" /><p>Tidak ada produk</p></td></tr>
              ) : sorted.map((p: any) => (
                <tr key={p.id}>
                  <td><span className="font-mono text-xs text-zinc-400">{p.sku}</span></td>
                  <td>
                    <p className="text-sm text-zinc-200">{p.productName}</p>
                    {p.variantInfo && <p className="text-[10px] text-zinc-600">{JSON.stringify(p.variantInfo)}</p>}
                  </td>
                  <td><span className="text-xs text-zinc-400">{p.categoryName || '—'}</span></td>
                  <td className="text-center">
                    <span className={`font-bold text-sm ${p.soh <= 0 ? 'text-red-400' : p.isBelowRop ? 'text-yellow-400' : 'text-white'}`}>{p.soh}</span>
                    <span className="text-zinc-600 text-[10px] ml-0.5">{p.unit}</span>
                  </td>
                  <td className="text-center text-xs text-zinc-500">{p.rop}</td>
                  {!hideHpp && <td className="text-right text-xs text-zinc-400">{p.hpp ? `Rp ${p.hpp.toLocaleString('id')}` : '—'}</td>}
                  {!hideHpp && <td className="text-right text-xs text-zinc-500">{(p.soh > 0 && p.hpp > 0) ? `Rp ${(p.soh * p.hpp).toLocaleString('id')}` : '—'}</td>}
                  <td><StockBadge status={p.stockStatus} /></td>
                  <td className="text-[10px] text-zinc-600">{p.lastOpnameDate ? formatDate(p.lastOpnameDate) : '—'}</td>
                  <td>
                    <button onClick={() => setSelectedLedgerSku({ sku: p.sku, name: p.productName })}
                      className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-emerald-400 transition-colors" title="Lihat Riwayat">
                      <History size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t border-zinc-800">
          <p className="text-xs text-zinc-600">Menampilkan {sorted.length} produk</p>
        </div>
      </div>
    </>
  )
}
