'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { formatDate, downloadCSV } from '@/lib/utils'
import { useToast } from '@/components/ui/toaster'
import { Shield, Users, FileText, Download, Plus, Edit2, Loader2 } from 'lucide-react'

const TABS = ['Users', 'Audit Log', 'Backup Data']
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

function BackupTab() {
  const { toast } = useToast()
  const [loading, setLoading] = useState<string | null>(null)

  const entities = [
    { key: 'all', label: 'Semua Data', desc: 'Export lengkap semua entity' },
    { key: 'orders', label: 'Orders', desc: 'Semua pesanan' },
    { key: 'products', label: 'Master Produk', desc: 'Data produk & SKU' },
    { key: 'wallet_ledger', label: 'Wallet Ledger', desc: 'Semua transaksi keuangan' },
    { key: 'inventory_ledger', label: 'Inventory Ledger', desc: 'Riwayat stok masuk/keluar' },
    { key: 'purchase_orders', label: 'Purchase Orders', desc: 'Semua PO & items' },
  ]

  const handleExport = async (key: string) => {
    setLoading(key)
    try {
      const res = await fetch(`/api/backup?entity=${key}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)

      const blob = new Blob([JSON.stringify(json.data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `elyasr-backup-${key}-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast({ title: `Backup ${key} berhasil didownload`, type: 'success' })
    } catch (err: any) {
      toast({ title: err.message || 'Gagal', type: 'error' })
    } finally { setLoading(null) }
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {entities.map(e => (
        <div key={e.key} className="stat-card flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-zinc-200">{e.label}</p>
            <p className="text-xs text-zinc-500">{e.desc}</p>
          </div>
          <button onClick={() => handleExport(e.key)} disabled={loading === e.key}
            className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg px-3 py-2 text-xs transition-colors shrink-0 disabled:opacity-50">
            {loading === e.key ? <Loader2 size={12} className="animate-spin"/> : <Download size={12}/>}
            Export
          </button>
        </div>
      ))}
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
      {activeTab === 'Backup Data' && <BackupTab />}
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
