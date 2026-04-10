'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { downloadCSV } from '@/lib/utils'
import { useToast } from '@/components/ui/toaster'
import { Database, Plus, Download, Upload, Search, Edit2, ChevronLeft, ChevronRight, FileDown } from 'lucide-react'
import Papa from 'papaparse'

function ProductModal({ product, categories, onClose }: { product?: any; categories: any[]; onClose: () => void }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const isEdit = !!product
  const [form, setForm] = useState({
    sku: product?.sku ?? '',
    productName: product?.productName ?? '',
    categoryId: product?.categoryId ?? '',
    unit: product?.unit ?? 'pcs',
    hpp: product?.hpp ?? 0,
    rop: product?.rop ?? 0,
    leadTimeDays: product?.leadTimeDays ?? 0,
    stokAwal: product?.stokAwal ?? 0,
    isActive: product?.isActive ?? true,
  })
  const [loading, setLoading] = useState(false)

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const url = isEdit ? `/api/products/${product.id}` : '/api/products'
      const method = isEdit ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ title: isEdit ? 'Produk diperbarui' : 'Produk ditambahkan', type: 'success' })
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['products-all'] })
      onClose()
    } catch (err: any) {
      toast({ title: err.message || 'Gagal', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const fields = [
    { label: 'SKU *', key: 'sku', type: 'text', disabled: isEdit },
    { label: 'Nama Produk *', key: 'productName', type: 'text' },
    { label: 'Unit', key: 'unit', type: 'text' },
    { label: 'HPP (Rp)', key: 'hpp', type: 'number' },
    { label: 'ROP (Reorder Point)', key: 'rop', type: 'number' },
    { label: 'Lead Time (hari)', key: 'leadTimeDays', type: 'number' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-base font-semibold text-white mb-5">{isEdit ? 'Edit Produk' : 'Tambah Produk'}</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          {fields.map(f => (
            <div key={f.key}>
              <label className="block text-xs text-zinc-500 mb-1">{f.label}</label>
              <input
                type={f.type}
                value={(form as any)[f.key]}
                onChange={e => set(f.key, f.type === 'number' ? Number(e.target.value) : e.target.value)}
                disabled={f.disabled}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none disabled:opacity-50"
              />
            </div>
          ))}
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Kategori</label>
            <select value={form.categoryId} onChange={e => set('categoryId', e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none">
              <option value="">— Tanpa Kategori —</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.categoryName}</option>)}
            </select>
          </div>
          {isEdit && (
            <div className="flex items-center gap-2">
              <input type="checkbox" id="isActive" checked={form.isActive} onChange={e => set('isActive', e.target.checked)} className="rounded" />
              <label htmlFor="isActive" className="text-xs text-zinc-400">Produk aktif</label>
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg py-2 text-sm transition-colors">Batal</button>
            <button type="submit" disabled={loading} className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-medium transition-colors">
              {loading ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ImportModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  const downloadTemplate = () => {
    downloadCSV('template-import-produk.csv', [{
      sku: 'PROD-001',
      productName: 'Contoh Produk A',
      categoryName: 'Aksesoris',
      unit: 'pcs',
      hpp: 10000,
      rop: 10,
      leadTimeDays: 3,
      stokAwal: 50
    }])
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const res = await fetch('/api/products/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ products: results.data }),
          })
          const json = await res.json()
          if (!res.ok) {
            toast({ title: json.error || 'Gagal import produk', type: 'error' })
            if (json.errors) {
              alert('Detail Error:\n' + json.errors.join('\n'))
            }
          } else {
            toast({ title: json.data?.message || 'Produk berhasil diimport', type: 'success' })
            qc.invalidateQueries({ queryKey: ['products'] })
            qc.invalidateQueries({ queryKey: ['products-all'] })
            onClose()
          }
        } catch (err: any) {
          toast({ title: err.message || 'Gagal tersambung ke server', type: 'error' })
        } finally {
          setLoading(false)
        }
      },
      error: (error) => {
        toast({ title: `Gagal membaca file: ${error.message}`, type: 'error' })
        setLoading(false)
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6">
        <h2 className="text-base font-semibold text-white mb-5">Import Data Produk Baru</h2>
        
        <div className="space-y-4">
          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4">
            <h3 className="text-sm font-medium text-white mb-2 flex items-center gap-2">
              <FileDown size={14} className="text-emerald-400" />
              1. Download Template CSV
            </h3>
            <p className="text-xs text-zinc-400 mb-3 leading-relaxed">
              Silakan unduh template CSV berikut dan isi data produk Anda ke dalamnya. Pastikan judul kolom (header) pada baris pertama tidak diubah.
            </p>
            <button onClick={downloadTemplate} className="w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 rounded-lg py-2 text-sm transition-colors">
              <Download size={14} /> Unduh Template CSV
            </button>
          </div>

          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4">
            <h3 className="text-sm font-medium text-white mb-2 flex items-center gap-2">
              <Upload size={14} className="text-blue-400" />
              2. Upload File CSV
            </h3>
            <p className="text-xs text-zinc-400 mb-3 leading-relaxed">
              Setelah template diisi, simpan sebagai CSV dan unggah di sini. (Data sku tidak boleh ada spasi dan tidak boleh ganda).
            </p>
            
            <label className={`flex flex-col items-center justify-center w-full h-24 border-2 border-dashed ${loading ? 'border-zinc-700 bg-zinc-800/30 cursor-not-allowed' : 'border-emerald-700/50 hover:bg-emerald-900/10 hover:border-emerald-500 cursor-pointer'} rounded-xl transition-all`}>
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Upload size={20} className={loading ? "text-zinc-600 mb-2" : "text-emerald-500 mb-2"} />
                <p className="text-xs text-zinc-400 font-medium">{loading ? 'Memproses import...' : 'Klik untuk memilih file CSV'}</p>
              </div>
              <input type="file" className="hidden" accept=".csv" disabled={loading} onChange={handleFileUpload} />
            </label>
          </div>
        </div>

        <div className="flex gap-2 pt-4 mt-2">
          <button type="button" onClick={onClose} disabled={loading} className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg py-2.5 text-sm font-medium transition-colors">
            Tutup
          </button>
        </div>
      </div>
    </div>
  )
}

export default function MasterProductsPage() {
  const { toast } = useToast()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [modal, setModal] = useState<'add' | 'edit' | 'import' | null>(null)
  const [selected, setSelected] = useState<any>(null)
  const limit = 50

  const { data, isLoading } = useQuery({
    queryKey: ['products', search, page],
    queryFn: async () => {
      const params = new URLSearchParams({ search, page: String(page), limit: String(limit) })
      const res = await fetch(`/api/products?${params}`)
      return res.json().then(d => d.data)
    },
  })

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await fetch('/api/categories')
      return res.json().then(d => d.data?.categories ?? [])
    },
  })

  const products = data?.products ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / limit)

  const handleExport = () => {
    downloadCSV('master-produk.csv', products.map((p: any) => ({
      SKU: p.sku,
      'Nama Produk': p.productName,
      Satuan: p.unit,
      HPP: p.hpp,
      ROP: p.rop,
      'Lead Time (hari)': p.leadTimeDays,
      Kategori: p.categoryName || '',
      Status: p.isActive ? 'Aktif' : 'Nonaktif',
    })))
  }

  return (
    <AppLayout>
      {modal === 'import' && (
        <ImportModal onClose={() => setModal(null)} />
      )}

      {(modal === 'add' || modal === 'edit') && (
        <ProductModal
          product={modal === 'edit' ? selected : undefined}
          categories={categories ?? []}
          onClose={() => { setModal(null); setSelected(null) }}
        />
      )}

      <div className="page-header">
        <h1 className="page-title flex items-center gap-2">
          <Database size={22} className="text-emerald-400" />
          Master Produk
        </h1>
        <div className="flex gap-2">
          <button onClick={handleExport} className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg px-3 py-2 text-sm transition-colors border border-zinc-700">
            <Download size={14} /> Export
          </button>
          <button onClick={() => setModal('import')} className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-blue-400 rounded-lg px-3 py-2 text-sm transition-colors border border-zinc-700 font-medium">
            <Upload size={14} /> Import CSV
          </button>
          <button onClick={() => setModal('add')} className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors">
            <Plus size={14} /> Tambah Produk
          </button>
        </div>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          placeholder="Cari SKU atau nama produk..."
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
        />
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-32">SKU</th>
                <th>Nama Produk</th>
                <th className="w-24">Kategori</th>
                <th className="w-16 text-center">Unit</th>
                <th className="w-24 text-right">HPP</th>
                <th className="w-16 text-center">ROP</th>
                <th className="w-20">Status</th>
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 8 }).map((_, j) => (
                    <td key={j}><div className="h-4 bg-zinc-800 rounded animate-pulse" /></td>
                  ))}</tr>
                ))
              ) : products.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-10 text-zinc-600">Tidak ada produk</td></tr>
              ) : (
                products.map((p: any) => (
                  <tr key={p.id}>
                    <td><span className="font-mono text-xs text-zinc-400">{p.sku}</span></td>
                    <td><p className="text-sm text-zinc-200">{p.productName}</p></td>
                    <td><span className="text-xs text-zinc-500">{p.categoryName || '—'}</span></td>
                    <td className="text-center text-xs text-zinc-400">{p.unit}</td>
                    <td className="text-right text-xs text-zinc-300">
                      {p.hpp ? `Rp ${p.hpp.toLocaleString('id')}` : '—'}
                    </td>
                    <td className="text-center text-xs text-zinc-400">{p.rop}</td>
                    <td>{p.isActive ? <span className="badge-success">Aktif</span> : <span className="badge-muted">Nonaktif</span>}</td>
                    <td>
                      <button onClick={() => { setSelected(p); setModal('edit') }}
                        className="p-1.5 rounded hover:bg-zinc-800 text-zinc-600 hover:text-zinc-300 transition-colors">
                        <Edit2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800">
            <p className="text-xs text-zinc-500">{total} produk</p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1.5 rounded bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30"><ChevronLeft size={14} /></button>
              <span className="text-xs text-zinc-400 px-2">{page}/{totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="p-1.5 rounded bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30"><ChevronRight size={14} /></button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
