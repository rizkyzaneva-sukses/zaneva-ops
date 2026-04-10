'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { formatRupiah, formatDate, downloadCSV } from '@/lib/utils'
import { useToast } from '@/components/ui/toaster'
import { Wallet, Plus, Download, Filter, ChevronLeft, ChevronRight, Settings, Edit2, Trash } from 'lucide-react'

const TRX_TYPE_COLORS: Record<string, string> = {
  PAYOUT: 'badge-success',
  OTHER_INCOME: 'badge-info',
  EXPENSE: 'badge-danger',
  TRANSFER: 'badge-muted',
}

function AddTransactionModal({ onClose, wallets }: { onClose: () => void; wallets: any[] }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [form, setForm] = useState({
    walletId: wallets[0]?.id ?? '',
    trxDate: new Date().toISOString().slice(0, 10),
    trxType: 'EXPENSE',
    category: '',
    amount: '',
    note: '',
    destWalletId: '',
  })
  const [loading, setLoading] = useState(false)

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  // Ambil data kategori dari database berdasarkan tipe transaksi (optional context)
  const { data: categories } = useQuery({
    queryKey: ['master-categories', form.trxType],
    queryFn: async () => {
      if (form.trxType === 'TRANSFER') return []
      const res = await fetch(`/api/master-categories?type=${form.trxType}`)
      return res.json().then(d => d.data ?? [])
    },
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/wallet/ledger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount: parseInt(form.amount, 10) }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ title: 'Transaksi berhasil ditambahkan', type: 'success' })
      qc.invalidateQueries({ queryKey: ['wallets'] })
      qc.invalidateQueries({ queryKey: ['wallet-ledger'] })
      onClose()
    } catch (err: any) {
      toast({ title: err.message || 'Gagal', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6">
        <h2 className="text-base font-semibold text-white mb-5">Tambah Transaksi</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Wallet</label>
            <select
              value={form.walletId}
              onChange={e => set('walletId', e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none"
            >
              {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Tanggal</label>
            <input
              type="date"
              value={form.trxDate}
              onChange={e => set('trxDate', e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none [&::-webkit-calendar-picker-indicator]:invert-[0.6]"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Tipe</label>
            <select
              value={form.trxType}
              onChange={e => set('trxType', e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none"
            >
              {['PAYOUT','OTHER_INCOME','EXPENSE','TRANSFER'].map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          {form.trxType !== 'TRANSFER' && (
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Kategori</label>
              <input
                list="category-options"
                value={form.category}
                onChange={e => set('category', e.target.value)}
                placeholder="Pilih atau ketik kategori..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              />
              <datalist id="category-options">
                {(categories ?? []).map((c: any) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
            </div>
          )}
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Jumlah (Rp)</label>
            <input
              type="number"
              value={form.amount}
              onChange={e => set('amount', e.target.value)}
              placeholder="0"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Catatan</label>
            <input
              type="text"
              value={form.note}
              onChange={e => set('note', e.target.value)}
              placeholder="Opsional"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none"
            />
          </div>

          {form.trxType === 'TRANSFER' && (
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Wallet Tujuan</label>
              <select value={form.destWalletId} onChange={e => set('destWalletId', e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none">
                <option value="">Pilih wallet tujuan</option>
                {wallets.filter(w => w.id !== form.walletId).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg py-2 text-sm transition-colors">
              Batal
            </button>
            <button type="submit" disabled={loading} className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-medium transition-colors">
              {loading ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ManageWalletsModal({ onClose, wallets }: { onClose: () => void; wallets: any[] }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [newWalletName, setNewWalletName] = useState('')
  const [loading, setLoading] = useState(false)

  const handleCreate = async () => {
    if (!newWalletName) return
    setLoading(true)
    try {
      const res = await fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newWalletName }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setNewWalletName('')
      qc.invalidateQueries({ queryKey: ['wallets'] })
      toast({ title: 'Wallet berhasil dibuat', type: 'success' })
    } catch (err: any) {
      toast({ title: err.message || 'Gagal', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const toggleActive = async (id: string, currentStatus: boolean) => {
    const cfm = confirm(`Yakin ingin ${currentStatus ? 'menonaktifkan' : 'mengaktifkan'} wallet ini?`)
    if (!cfm) return
    setLoading(true)
    try {
      const res = await fetch(`/api/wallet/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentStatus }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      qc.invalidateQueries({ queryKey: ['wallets'] })
      toast({ title: 'Status wallet diperbarui', type: 'success' })
    } catch (err: any) {
      toast({ title: err.message || 'Gagal', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg p-6">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-base font-semibold text-white">Kelola Data Wallet</h2>
        </div>
        
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            placeholder="Nama Wallet Baru"
            value={newWalletName}
            onChange={e => setNewWalletName(e.target.value)}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none"
          />
          <button onClick={handleCreate} disabled={loading || !newWalletName} className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors">
            Tambah
          </button>
        </div>

        <div className="max-h-60 overflow-y-auto space-y-2 pr-1 mb-4">
          {wallets.map(w => (
            <div key={w.id} className="flex items-center justify-between bg-zinc-800/50 border border-zinc-700/50 p-3 rounded-lg">
              <div>
                <p className="text-sm font-medium text-white">{w.name}</p>
                <p className="text-xs text-zinc-500">{w.isActive ? 'Aktif' : 'Nonaktif'}</p>
              </div>
              <button 
                onClick={() => toggleActive(w.id, w.isActive)} 
                disabled={loading}
                className={`text-xs px-2 py-1 rounded transition-colors ${w.isActive ? 'bg-red-900/30 text-red-400 hover:bg-red-900/50' : 'bg-emerald-900/30 text-emerald-400 hover:bg-emerald-900/50'}`}
              >
                {w.isActive ? 'Nonaktifkan' : 'Aktifkan'}
              </button>
            </div>
          ))}
          {wallets.length === 0 && <p className="text-sm text-zinc-500 text-center py-4">Data kosong.</p>}
        </div>

        <div className="flex gap-2 pt-2 border-t border-zinc-800">
          <button type="button" onClick={onClose} className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg py-2.5 text-sm font-medium transition-colors">
            Tutup
          </button>
        </div>
      </div>
    </div>
  )
}

export default function FinancePage() {
  const { toast } = useToast()
  const [showModal, setShowModal] = useState(false)
  const [showManageWallets, setShowManageWallets] = useState(false)
  const [walletFilter, setWalletFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [page, setPage] = useState(1)
  const limit = 30

  const { data: wallets } = useQuery({
    queryKey: ['wallets'],
    queryFn: async () => {
      const res = await fetch('/api/wallet')
      return res.json().then(d => d.data ?? [])
    },
  })

  const { data: ledgerData, isLoading } = useQuery({
    queryKey: ['wallet-ledger', walletFilter, typeFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({ walletId: walletFilter, trxType: typeFilter, page: String(page), limit: String(limit) })
      const res = await fetch(`/api/wallet/ledger?${params}`)
      return res.json().then(d => d.data)
    },
  })

  const entries = ledgerData?.entries ?? []
  const total = ledgerData?.total ?? 0
  const totalPages = Math.ceil(total / limit)

  const totalBalance = (wallets ?? []).reduce((s: number, w: any) => s + w.balance, 0)

  const handleExport = () => {
    downloadCSV('wallet-ledger.csv', entries.map((e: any) => ({
      Tanggal: formatDate(e.trxDate),
      Wallet: e.wallet?.name,
      Tipe: e.trxType,
      Kategori: e.category,
      Amount: e.amount,
      'Ref Order': e.refOrderNo,
      Catatan: e.note,
    })))
  }

  return (
    <AppLayout>
      {showModal && wallets && <AddTransactionModal onClose={() => setShowModal(false)} wallets={wallets} />}
      {showManageWallets && wallets && <ManageWalletsModal onClose={() => setShowManageWallets(false)} wallets={wallets} />}

      <div className="page-header">
        <h1 className="page-title flex items-center gap-2">
          <Wallet size={22} className="text-emerald-400" />
          Keuangan
        </h1>
        <div className="flex gap-2">
          <button onClick={() => setShowManageWallets(true)} className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-blue-400 rounded-lg px-3 py-2 text-sm transition-colors border border-zinc-700 font-medium">
            <Settings size={14} /> Kelola Wallet
          </button>
          <button onClick={handleExport} className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg px-3 py-2 text-sm transition-colors border border-zinc-700">
            <Download size={14} /> Export
          </button>
          <button onClick={() => setShowModal(true)} className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors">
            <Plus size={14} /> Tambah Transaksi
          </button>
        </div>
      </div>

      {/* Wallet Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {(wallets ?? []).map((w: any) => (
          <div key={w.id} className={`stat-card cursor-pointer transition-all ${walletFilter === w.id ? 'ring-2 ring-emerald-500/50' : ''}`}
            onClick={() => setWalletFilter(walletFilter === w.id ? '' : w.id)}>
            <p className="text-zinc-500 text-xs truncate mb-1">{w.name}</p>
            <p className={`font-bold text-sm ${w.balance >= 0 ? 'text-white' : 'text-red-400'}`}>
              {formatRupiah(w.balance, true)}
            </p>
          </div>
        ))}
        <div className="stat-card bg-emerald-900/20 border-emerald-800">
          <p className="text-zinc-500 text-xs mb-1">Total Saldo</p>
          <p className={`font-bold text-sm ${totalBalance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {formatRupiah(totalBalance, true)}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1) }}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none">
          <option value="">Semua Tipe</option>
          {['PAYOUT','OTHER_INCOME','EXPENSE','TRANSFER'].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {walletFilter && (
          <button onClick={() => setWalletFilter('')} className="text-xs text-zinc-500 hover:text-zinc-300">
            ✕ Reset filter wallet
          </button>
        )}
      </div>

      {/* Ledger Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-28">Tanggal</th>
                <th className="w-32">Wallet</th>
                <th className="w-28">Tipe</th>
                <th>Kategori</th>
                <th className="w-32 text-right">Jumlah</th>
                <th>Catatan</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 6 }).map((_, j) => (
                    <td key={j}><div className="h-4 bg-zinc-800 rounded animate-pulse" /></td>
                  ))}</tr>
                ))
              ) : entries.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-10 text-zinc-600">Tidak ada transaksi</td></tr>
              ) : (
                entries.map((e: any) => (
                  <tr key={e.id}>
                    <td className="text-xs text-zinc-400">{formatDate(e.trxDate)}</td>
                    <td className="text-xs text-zinc-400">{e.wallet?.name}</td>
                    <td><span className={TRX_TYPE_COLORS[e.trxType] || 'badge-muted'}>{e.trxType}</span></td>
                    <td className="text-xs text-zinc-400">{e.category || '—'}</td>
                    <td className={`text-right text-sm font-medium ${e.amount >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {e.amount >= 0 ? '+' : ''}{formatRupiah(e.amount, true)}
                    </td>
                    <td className="text-xs text-zinc-500 max-w-xs truncate">{e.note || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800">
            <p className="text-xs text-zinc-500">{total} transaksi</p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1.5 rounded bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30">
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs text-zinc-400 px-2">{page}/{totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="p-1.5 rounded bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
