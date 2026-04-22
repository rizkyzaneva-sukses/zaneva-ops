'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { formatDate } from '@/lib/utils'
import { useToast } from '@/components/ui/toaster'
import { Shield, Download, Plus, Edit2, Loader2, Settings, Upload, CheckCircle2, AlertCircle, FileJson, Tag, X, ToggleLeft, ToggleRight, Pencil } from 'lucide-react'

const TABS = ['Users', 'Audit Log', 'Kategori', 'Backup Data', 'Pengaturan']
const ROLES = ['OWNER', 'FINANCE', 'STAFF', 'EXTERNAL']

function UserModal({ user, onClose }: { user?: any; onClose: () => void }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const isEdit = !!user
  const [form, setForm] = useState({
    username: user?.username ?? '',
    fullName: user?.fullName ?? '',
    userRole: user?.userRole ?? 'STAFF',
    isActive: user?.isActive ?? true,
    password: '',
  })
  const [loading, setLoading] = useState(false)
  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const url = isEdit ? `/api/users/${user.id}` : '/api/users'
      const body = isEdit
        ? { fullName: form.fullName, userRole: form.userRole, isActive: form.isActive, newPassword: form.password || undefined }
        : { username: form.username, password: form.password, fullName: form.fullName, userRole: form.userRole }
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ title: isEdit ? 'User diperbarui' : 'User ditambahkan', type: 'success' })
      qc.invalidateQueries({ queryKey: ['users'] })
      onClose()
    } catch (err: any) {
      toast({ title: err.message || 'Gagal', type: 'error' })
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm p-6">
        <h2 className="text-base font-semibold text-white mb-4">{isEdit ? 'Edit User' : 'Tambah User'}</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          {!isEdit && (
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Username *</label>
              <input value={form.username} onChange={e => set('username', e.target.value)} required
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none"/>
            </div>
          )}
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Nama Lengkap</label>
            <input value={form.fullName} onChange={e => set('fullName', e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none"/>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Role *</label>
            <select value={form.userRole} onChange={e => set('userRole', e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none">
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">{isEdit ? 'Password Baru (kosongkan jika tidak diubah)' : 'Password *'}</label>
            <input type="password" value={form.password} onChange={e => set('password', e.target.value)} required={!isEdit}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none"/>
          </div>
          {isEdit && (
            <div className="flex items-center gap-2">
              <input type="checkbox" id="ua" checked={form.isActive} onChange={e => set('isActive', e.target.checked)} className="rounded"/>
              <label htmlFor="ua" className="text-xs text-zinc-400">Aktif</label>
            </div>
          )}
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

function UsersTab() {
  const [modal, setModal] = useState<any>(false)
  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => fetch('/api/users').then(r => r.json()).then(d => d.data ?? []),
  })

  return (
    <div>
      {modal && (
        <UserModal user={typeof modal === 'object' ? modal : undefined} onClose={() => setModal(false)} />
      )}
      <div className="flex justify-end mb-4">
        <button onClick={() => setModal(true)} className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors">
          <Plus size={14}/> Tambah User
        </button>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="data-table w-full">
          <thead>
            <tr><th>Username</th><th>Nama</th><th className="w-24">Role</th><th className="w-20">Status</th><th className="w-28">Dibuat</th><th className="w-12"></th></tr>
          </thead>
          <tbody>
            {isLoading ? Array.from({length:3}).map((_,i)=>(
              <tr key={i}>{Array.from({length:6}).map((_,j)=><td key={j}><div className="h-4 bg-zinc-800 rounded animate-pulse"/></td>)}</tr>
            )) : (users ?? []).map((u: any) => (
              <tr key={u.id}>
                <td><span className="font-mono text-sm text-zinc-200">{u.username}</span></td>
                <td className="text-sm text-zinc-400">{u.fullName || '—'}</td>
                <td><span className="badge-info">{u.userRole}</span></td>
                <td>{u.isActive ? <span className="badge-success">Aktif</span> : <span className="badge-danger">Nonaktif</span>}</td>
                <td className="text-xs text-zinc-500">{formatDate(u.createdAt)}</td>
                <td>
                  <button onClick={() => setModal(u)} className="p-1.5 rounded hover:bg-zinc-800 text-zinc-600 hover:text-zinc-300">
                    <Edit2 size={12}/>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function AuditTab() {
  const [entityType, setEntityType] = useState('')
  const [page, setPage] = useState(1)
  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', entityType, page],
    queryFn: () => {
      const p = new URLSearchParams({ entityType, page: String(page), limit: '50' })
      return fetch(`/api/audit?${p}`).then(r => r.json()).then(d => d.data)
    },
  })
  const logs = data?.logs ?? []
  const total = data?.total ?? 0

  return (
    <div>
      <div className="flex gap-3 mb-4">
        <select value={entityType} onChange={e => setEntityType(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-400 focus:outline-none">
          <option value="">Semua Entity</option>
          {['Order','InventoryScanBatch','StockOpnameBatch','PurchaseOrder','GoodsReceipt'].map(e => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
        <p className="text-xs text-zinc-500 self-center">{total} log</p>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="data-table w-full">
          <thead>
            <tr><th className="w-32">Waktu</th><th className="w-32">Entity</th><th className="w-20">Aksi</th><th>Detail</th><th className="w-24">Oleh</th></tr>
          </thead>
          <tbody>
            {isLoading ? Array.from({length:5}).map((_,i)=>(
              <tr key={i}>{Array.from({length:5}).map((_,j)=><td key={j}><div className="h-4 bg-zinc-800 rounded animate-pulse"/></td>)}</tr>
            )) : logs.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-zinc-600">Belum ada audit log</td></tr>
            ) : logs.map((l: any) => (
              <tr key={l.id}>
                <td className="text-[10px] text-zinc-500">{formatDate(l.createdAt, 'datetime')}</td>
                <td className="text-xs text-zinc-400">{l.entityType}</td>
                <td><span className="badge-muted text-[10px]">{l.action}</span></td>
                <td className="text-[10px] text-zinc-600 max-w-xs truncate">{l.note || l.entityId}</td>
                <td className="text-xs text-zinc-400">{l.performedBy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

interface ImportResult {
  inserted: number
  updated: number
  skipped: number
  total: number
  summary?: Record<string, { inserted: number; updated: number; skipped: number; total: number }>
}

function BackupEntityRow({ entityKey, label, desc, canImport }: {
  entityKey: string
  label: string
  desc: string
  canImport?: boolean
}) {
  const { toast } = useToast()
  const [exportLoading, setExportLoading] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [pendingData, setPendingData] = useState<any>(null)

  const handleExport = async () => {
    setExportLoading(true)
    try {
      const res = await fetch(`/api/backup?entity=${entityKey}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      const payload = entityKey === 'all' ? json.data : json.data
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `elyasr-backup-${entityKey}-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast({ title: `Export "${label}" berhasil`, type: 'success' })
    } catch (err: any) {
      toast({ title: err.message || 'Gagal export', type: 'error' })
    } finally { setExportLoading(false) }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportResult(null)
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)

      if (entityKey === 'all') {
        // Format export semua: { exportedAt, exportedBy, data: { products: [], orders: [], ... } }
        const dataObj = (parsed?.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data))
          ? parsed.data
          : (typeof parsed === 'object' && !Array.isArray(parsed) && !parsed.exportedAt ? parsed : null)
        if (!dataObj) throw new Error('Format tidak valid. Upload file hasil "Export Semua Data" dari sistem ini.')
        const KEYS = ['products', 'orders', 'vendors', 'wallet_ledger', 'inventory_ledger']
        const total = KEYS.reduce((s, k) => s + (Array.isArray(dataObj[k]) ? dataObj[k].length : 0), 0)
        if (total === 0) throw new Error('Tidak ada data yang bisa diimport dalam file ini.')
        setPreviewCount(total)
        setPendingData(dataObj)
        return
      }

      // Entity tunggal: array langsung atau {data: [...]}
      let rows: any[]
      if (Array.isArray(parsed)) {
        rows = parsed
      } else if (Array.isArray(parsed.data)) {
        rows = parsed.data
      } else if (parsed.data && typeof parsed.data === 'object' && Array.isArray(parsed.data[entityKey])) {
        rows = parsed.data[entityKey]
      } else {
        throw new Error('Format JSON tidak dikenali. Harap gunakan file export dari sistem ini.')
      }
      setPreviewCount(rows.length)
      setPendingData(rows)
    } catch (err: any) {
      toast({ title: err.message || 'File JSON tidak valid', type: 'error' })
      e.target.value = ''
    }
  }

  const handleImport = async () => {
    if (!pendingData) return
    setImportLoading(true)
    setImportResult(null)
    try {
      const res = await fetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity: entityKey, data: pendingData }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setImportResult(json.data)
      setPendingData(null)
      setPreviewCount(null)
      toast({ title: `Import "${label}" berhasil`, type: 'success' })
    } catch (err: any) {
      toast({ title: err.message || 'Gagal import', type: 'error' })
    } finally { setImportLoading(false) }
  }

  const handleCancelImport = () => {
    setPendingData(null)
    setPreviewCount(null)
    setImportResult(null)
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileJson size={15} className="text-emerald-400 shrink-0 mt-0.5"/>
          <div>
            <p className="text-sm font-medium text-zinc-200">{label}</p>
            <p className="text-xs text-zinc-500">{desc}</p>
          </div>
        </div>
        <button
          onClick={handleExport}
          disabled={exportLoading}
          className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 rounded-lg px-3 py-1.5 text-xs transition-colors shrink-0 disabled:opacity-50"
        >
          {exportLoading ? <Loader2 size={11} className="animate-spin"/> : <Download size={11}/>}
          Export
        </button>
      </div>

      {/* Import area - only for supported entities */}
      {canImport && (
        <div className="border-t border-zinc-800 pt-3">
          {!pendingData && !importResult && (
            <label className="flex items-center gap-2 cursor-pointer group">
              <div className="flex items-center gap-2 bg-zinc-800 hover:bg-emerald-900/40 border border-zinc-700 hover:border-emerald-700 rounded-lg px-3 py-1.5 text-xs text-zinc-400 group-hover:text-emerald-300 transition-all">
                <Upload size={11}/>
                <span>Import JSON</span>
              </div>
              <input
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleFileChange}
              />
            </label>
          )}

          {pendingData && (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 bg-amber-900/20 border border-amber-700/40 rounded-lg px-3 py-1.5 text-xs text-amber-300">
                <AlertCircle size={11}/>
                {entityKey === 'all'
                  ? `${previewCount?.toLocaleString('id-ID')} total records (5 entity) siap diimport`
                  : `${previewCount?.toLocaleString('id-ID')} baris siap diimport`
                }
              </div>
              <button
                onClick={handleImport}
                disabled={importLoading}
                className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
              >
                {importLoading ? <Loader2 size={11} className="animate-spin"/> : <Upload size={11}/>}
                {importLoading ? 'Mengimport...' : 'Konfirmasi Import'}
              </button>
              <button
                onClick={handleCancelImport}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1.5"
              >
                Batal
              </button>
            </div>
          )}

          {importResult && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 bg-emerald-900/20 border border-emerald-700/40 rounded-lg px-3 py-1.5 text-xs text-emerald-300">
                  <CheckCircle2 size={11}/>
                  +{importResult.inserted} baru · ~{importResult.updated} update · {importResult.skipped} skip
                </div>
                <button onClick={handleCancelImport} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1.5">Reset</button>
              </div>
              {importResult.summary && (
                <div className="flex flex-wrap gap-1">
                  {Object.entries(importResult.summary).map(([ent, s]) => s.total > 0 && (
                    <span key={ent} className="text-[10px] bg-zinc-800 border border-zinc-700 rounded px-2 py-0.5 text-zinc-400">
                      {ent}: +{s.inserted} ~{s.updated} /{s.skipped}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function BackupTab() {
  const entities: { key: string; label: string; desc: string; canImport?: boolean }[] = [
    { key: 'all', label: 'Semua Data', desc: 'Export & Import lengkap semua entity sekaligus', canImport: true },
    { key: 'products', label: 'Master Produk', desc: 'Data produk & SKU (upsert by SKU)', canImport: true },
    { key: 'orders', label: 'Orders', desc: 'Semua pesanan (upsert by orderNo)', canImport: true },
    { key: 'vendors', label: 'Vendors', desc: 'Data vendor (upsert by vendorCode)', canImport: true },
    { key: 'wallet_ledger', label: 'Wallet Ledger', desc: 'Transaksi keuangan (insert only)', canImport: true },
    { key: 'inventory_ledger', label: 'Inventory Ledger', desc: 'Riwayat stok masuk/keluar (insert only)', canImport: true },
    { key: 'purchase_orders', label: 'Purchase Orders', desc: 'Semua PO & items (export only)' },
    { key: 'payouts', label: 'Payouts', desc: 'Data payout marketplace (export only)' },
    { key: 'utangs', label: 'Utang & Piutang', desc: 'Catatan utang & piutang (export only)' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 bg-blue-900/20 border border-blue-700/40 rounded-lg px-4 py-3">
        <AlertCircle size={14} className="text-blue-400 shrink-0"/>
        <p className="text-xs text-blue-300">
          <strong>Import Semua Data</strong> — upload file hasil Export Semua Data untuk restore semua entity sekaligus.
          Bisa juga import per-entity satu per satu di bawah.
          <span className="text-blue-400"> Produk, Orders & Vendors: upsert (update jika ada). Ledger: insert only (skip duplikat).</span>
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {entities.map(e => (
          <BackupEntityRow
            key={e.key}
            entityKey={e.key}
            label={e.label}
            desc={e.desc}
            canImport={e.canImport}
          />
        ))}
      </div>
    </div>
  )
}

// ── Kategori Transaksi Tab ────────────────────────────────────────────────────
const DEFAULT_GROUPS = ['Beban Pokok Penjualan', 'Beban Operasional', 'Beban Lain-lain', 'Non-Beban / Aset']

function KategoriModal({ cat, onClose }: { cat?: any; onClose: () => void }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const isEdit = !!cat
  const [form, setForm] = useState({
    name: cat?.name ?? '',
    group: cat?.group ?? 'Beban Operasional',
    customGroup: '',
    isBeban: cat?.isBeban ?? true,
  })
  const [loading, setLoading] = useState(false)
  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))
  const useCustomGroup = form.group === '__custom__'
  const finalGroup = useCustomGroup ? form.customGroup : form.group

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !finalGroup.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/finance/categories', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEdit
          ? { id: cat.id, name: form.name, group: finalGroup, isBeban: form.isBeban }
          : { name: form.name, group: finalGroup, isBeban: form.isBeban }
        ),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ title: isEdit ? 'Kategori diperbarui' : 'Kategori ditambahkan', type: 'success' })
      qc.invalidateQueries({ queryKey: ['owner-categories'] })
      qc.invalidateQueries({ queryKey: ['expense-categories'] })
      onClose()
    } catch (err: any) {
      toast({ title: err.message || 'Gagal', type: 'error' })
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white">{isEdit ? 'Edit Kategori' : 'Tambah Kategori'}</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={16}/></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Nama Kategori *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} required
              disabled={isEdit && cat?.isSystem}
              placeholder="cth: Beban Sewa Gudang"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none disabled:opacity-50"/>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Group</label>
            <select value={form.group} onChange={e => set('group', e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none">
              {DEFAULT_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
              <option value="__custom__">+ Group Baru...</option>
            </select>
            {useCustomGroup && (
              <input value={form.customGroup} onChange={e => set('customGroup', e.target.value)} required
                placeholder="Nama group baru" autoFocus
                className="w-full mt-2 bg-zinc-800 border border-emerald-600 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none"/>
            )}
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-2">Pengaruh ke Laporan L/R</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => set('isBeban', true)}
                className={`flex-1 rounded-lg px-3 py-2.5 text-xs font-medium border transition-all ${form.isBeban ? 'bg-red-900/40 border-red-600 text-red-300' : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:border-zinc-600'}`}>
                📊 Masuk L/R (Beban)
              </button>
              <button type="button" onClick={() => set('isBeban', false)}
                className={`flex-1 rounded-lg px-3 py-2.5 text-xs font-medium border transition-all ${!form.isBeban ? 'bg-blue-900/40 border-blue-600 text-blue-300' : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:border-zinc-600'}`}>
                📦 Tidak masuk L/R
              </button>
            </div>
            <p className="text-[10px] text-zinc-600 mt-1.5">
              {form.isBeban ? 'Transaksi ini akan muncul sebagai beban di laporan Laba/Rugi.' : 'Transaksi ini tidak mempengaruhi L/R (misal: beli perlengkapan, aset kecil).'}
            </p>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg py-2 text-sm">Batal</button>
            <button type="submit" disabled={loading || (!isEdit && !form.name)} className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-medium">
              {loading ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function KategoriTab() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [modal, setModal] = useState<any>(null) // false | true (add) | object (edit)
  const [filterGroup, setFilterGroup] = useState('')
  const [filterBeban, setFilterBeban] = useState<'all' | 'beban' | 'non'>('all')

  const { data, isLoading } = useQuery({
    queryKey: ['owner-categories'],
    queryFn: () => fetch('/api/finance/categories?all=true').then(r => r.json()).then(d => d.data?.categories ?? []),
  })
  const categories: any[] = data ?? []
  const groups = [...new Set(categories.map((c: any) => c.group))].sort()

  const filtered = categories.filter((c: any) => {
    if (filterGroup && c.group !== filterGroup) return false
    if (filterBeban === 'beban' && !c.isBeban) return false
    if (filterBeban === 'non' && c.isBeban) return false
    return true
  })

  const toggleActive = async (cat: any) => {
    try {
      const res = await fetch('/api/finance/categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: cat.id, isActive: !cat.isActive }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast({ title: `Kategori ${cat.isActive ? 'dinonaktifkan' : 'diaktifkan'}`, type: 'success' })
      qc.invalidateQueries({ queryKey: ['owner-categories'] })
      qc.invalidateQueries({ queryKey: ['expense-categories'] })
    } catch (err: any) {
      toast({ title: err.message || 'Gagal', type: 'error' })
    }
  }

  return (
    <div>
      {modal && <KategoriModal cat={typeof modal === 'object' ? modal : undefined} onClose={() => setModal(null)} />}

      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex gap-2 flex-wrap">
          <select value={filterGroup} onChange={e => setFilterGroup(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-400 focus:outline-none">
            <option value="">Semua Group</option>
            {groups.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <select value={filterBeban} onChange={e => setFilterBeban(e.target.value as any)}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-400 focus:outline-none">
            <option value="all">Semua Tipe</option>
            <option value="beban">Masuk L/R (Beban)</option>
            <option value="non">Tidak masuk L/R</option>
          </select>
        </div>
        <button onClick={() => setModal(true)}
          className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors">
          <Plus size={14}/> Tambah Kategori
        </button>
      </div>

      <div className="bg-amber-900/20 border border-amber-700/40 rounded-lg px-4 py-3 mb-4">
        <p className="text-xs text-amber-300">
          <strong>Masuk L/R</strong> = beban yang tampil di laporan Laba/Rugi (cth: Beban Sewa, Gaji, Listrik).
          <strong className="ml-2">Tidak masuk L/R</strong> = pengeluaran yang tidak mempengaruhi L/R (cth: Beli Perlengkapan, Inventaris Kecil).
        </p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="data-table w-full">
          <thead>
            <tr>
              <th>Nama Kategori</th>
              <th className="w-40">Group</th>
              <th className="w-32">Pengaruh L/R</th>
              <th className="w-20">Status</th>
              <th className="w-24">Tipe</th>
              <th className="w-16"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? Array.from({length:5}).map((_,i) => (
              <tr key={i}>{Array.from({length:6}).map((_,j) => <td key={j}><div className="h-4 bg-zinc-800 rounded animate-pulse"/></td>)}</tr>
            )) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-zinc-600">Tidak ada kategori</td></tr>
            ) : filtered.map((c: any) => (
              <tr key={c.id}>
                <td className="text-sm text-zinc-200 font-medium">{c.name}</td>
                <td className="text-xs text-zinc-400">{c.group}</td>
                <td>
                  {c.isBeban
                    ? <span className="badge-danger">📊 Masuk L/R</span>
                    : <span className="badge-info">📦 Non-Beban</span>}
                </td>
                <td>
                  {c.isActive
                    ? <span className="badge-success">Aktif</span>
                    : <span className="badge-muted">Nonaktif</span>}
                </td>
                <td>
                  {c.isSystem
                    ? <span className="text-[10px] text-zinc-600 italic">System</span>
                    : <span className="text-[10px] text-zinc-500">Custom</span>}
                </td>
                <td>
                  <div className="flex items-center gap-1">
                    {!c.isSystem && (
                      <button onClick={() => setModal(c)}
                        className="p-1.5 rounded hover:bg-zinc-800 text-zinc-600 hover:text-zinc-300" title="Edit">
                        <Pencil size={11}/>
                      </button>
                    )}
                    <button onClick={() => toggleActive(c)}
                      className={`p-1.5 rounded text-xs transition-colors ${
                        c.isActive ? 'hover:bg-red-900/30 text-zinc-600 hover:text-red-400' : 'hover:bg-emerald-900/30 text-zinc-600 hover:text-emerald-400'
                      }`} title={c.isActive ? 'Nonaktifkan' : 'Aktifkan'}>
                      {c.isActive ? <ToggleRight size={14}/> : <ToggleLeft size={14}/>}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-600 mt-2">{filtered.length} kategori ditampilkan dari {categories.length} total</p>
    </div>
  )
}


function PengaturanTab() {
  const { toast } = useToast()
  const [shopee, setShopee] = useState('')
  const [tiktok, setTiktok] = useState('')
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setShopee(d.data?.biaya_admin_shopee ?? '14')
          setTiktok(d.data?.biaya_admin_tiktok ?? '14.1')
        }
      })
      .finally(() => setFetching(false))
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const results = await Promise.all([
        fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'biaya_admin_shopee', value: shopee }),
        }),
        fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'biaya_admin_tiktok', value: tiktok }),
        }),
      ])
      const jsons = await Promise.all(results.map(r => r.json()))
      const failed = jsons.find(j => !j.success)
      if (failed) throw new Error(failed.error)
      toast({ title: 'Pengaturan berhasil disimpan', type: 'success' })
    } catch (err: any) {
      toast({ title: err.message || 'Gagal menyimpan', type: 'error' })
    } finally { setLoading(false) }
  }

  return (
    <div className="max-w-md">
      <div className="flex items-center gap-2 mb-4">
        <Settings size={16} className="text-emerald-400"/>
        <h2 className="text-sm font-semibold text-zinc-200">Biaya Admin Platform</h2>
      </div>
      <div className="bg-amber-900/20 border border-amber-700/40 rounded-lg px-4 py-3 mb-5">
        <p className="text-xs text-amber-300">
          Perubahan hanya berlaku untuk data order yang diupload setelah penyimpanan ini.
          Data order yang sudah ada tidak akan terpengaruh.
        </p>
      </div>
      {fetching ? (
        <div className="flex items-center gap-2 text-zinc-500 text-sm">
          <Loader2 size={14} className="animate-spin"/> Memuat pengaturan...
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Biaya Admin Shopee (%)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={shopee}
              onChange={e => setShopee(e.target.value)}
              required
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-600"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Biaya Admin TikTok (%)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={tiktok}
              onChange={e => setTiktok(e.target.value)}
              required
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-600"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            {loading ? <Loader2 size={14} className="animate-spin"/> : null}
            {loading ? 'Menyimpan...' : 'Simpan Pengaturan'}
          </button>
        </form>
      )}
    </div>
  )
}

function OwnerRoomContent() {
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const [activeTab, setActiveTab] = useState(tabParam || 'Users')

  useEffect(() => {
    if (tabParam && TABS.includes(tabParam)) {
      setActiveTab(tabParam)
    }
  }, [tabParam])

  return (
    <AppLayout>
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2"><Shield size={22} className="text-emerald-400"/>Owner Room</h1>
      </div>

      <div className="flex gap-1 mb-6 bg-zinc-900 border border-zinc-800 rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === t ? 'bg-emerald-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
            {t}
          </button>
        ))}
      </div>

      {activeTab === 'Users' && <UsersTab />}
      {activeTab === 'Audit Log' && <AuditTab />}
      {activeTab === 'Kategori' && <KategoriTab />}
      {activeTab === 'Backup Data' && <BackupTab />}
      {activeTab === 'Pengaturan' && <PengaturanTab />}
    </AppLayout>
  )
}

export default function OwnerRoomPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-zinc-500">Memuat Owner Room...</div>}>
      <OwnerRoomContent />
    </Suspense>
  )
}
