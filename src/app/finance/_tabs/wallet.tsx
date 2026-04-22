'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { formatRupiah, formatDate, downloadCSV } from '@/lib/utils'
import { useToast } from '@/components/ui/toaster'
import { Plus, Download, Settings, ChevronLeft, ChevronRight, HelpCircle, X, ChevronDown, Search } from 'lucide-react'


const TRX_TYPE_META: Record<string, { color: string; label: string }> = {
  PAYOUT:             { color: 'badge-success',  label: 'Payout' },
  OTHER_INCOME:       { color: 'badge-info',     label: 'Pendapatan Lain' },
  EXPENSE:            { color: 'badge-danger',   label: 'Beban' },
  TRANSFER:           { color: 'badge-muted',    label: 'Transfer' },
  MODAL_MASUK:        { color: 'bg-purple-900/50 text-purple-300 border border-purple-800 text-[10px] font-semibold px-2 py-0.5 rounded', label: 'Suntikan Modal' },
  PRIVE:              { color: 'bg-orange-900/50 text-orange-300 border border-orange-800 text-[10px] font-semibold px-2 py-0.5 rounded', label: 'Prive' },
  INVESTASI:          { color: 'bg-blue-900/50 text-blue-300 border border-blue-800 text-[10px] font-semibold px-2 py-0.5 rounded',    label: 'Investasi' },
  VENDOR_PAYMENT:     { color: 'bg-yellow-900/50 text-yellow-300 border border-yellow-800 text-[10px] font-semibold px-2 py-0.5 rounded', label: 'Bayar Vendor' },
  PENGEMBALIAN_MODAL: { color: 'bg-teal-900/50 text-teal-300 border border-teal-800 text-[10px] font-semibold px-2 py-0.5 rounded',   label: 'Pengembalian Modal' },
  BAYAR_UTANG:        { color: 'bg-red-900/50 text-red-300 border border-red-800 text-[10px] font-semibold px-2 py-0.5 rounded',       label: 'Bayar Utang' },
  TERIMA_PIUTANG_ND:  { color: 'bg-emerald-900/50 text-emerald-300 border border-emerald-800 text-[10px] font-semibold px-2 py-0.5 rounded', label: 'Terima Piutang Non Dagang' },
}
const TRX_TYPES = [
  { value: 'EXPENSE',            label: 'Beban Operasional',              tooltip: 'Beban operasional bisnis. Masuk laporan P&L.' },
  { value: 'OTHER_INCOME',       label: 'Pendapatan Lain',                tooltip: 'Pendapatan selain penjualan marketplace.' },
  { value: 'MODAL_MASUK',        label: 'Suntikan Modal',                 tooltip: 'Suntikan modal dari pemilik ke bisnis. Kas bertambah.' },
  { value: 'PENGEMBALIAN_MODAL', label: 'Pengembalian Modal',             tooltip: 'Perusahaan mengembalikan modal ke pemilik. Kas berkurang. Tidak masuk P&L.' },
  { value: 'PRIVE',              label: 'Prive (Ambil Modal)',            tooltip: 'Pengambilan modal oleh pemilik. Kas berkurang.' },
  { value: 'BAYAR_UTANG',        label: 'Pembayaran Utang',               tooltip: 'Pelunasan utang non-dagang. Kas berkurang. Tidak masuk P&L.' },
  { value: 'TERIMA_PIUTANG_ND',  label: 'Penerimaan Piutang Non Dagang', tooltip: 'Menerima piutang non-dagang. Kas bertambah. Tidak masuk P&L.' },
  { value: 'INVESTASI',          label: 'Pembelian Aset Tetap',           tooltip: 'Pembelian aset tetap.' },
  { value: 'TRANSFER',           label: 'Transfer Antar Wallet',          tooltip: 'Pindah dana antar wallet.' },
]

function Tooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false)
  return (
    <span className="relative inline-flex items-center ml-1">
      <HelpCircle size={12} className="text-zinc-600 hover:text-zinc-400 cursor-help shrink-0"
        onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)} />
      {show && (
        <div className="absolute z-[200] bottom-full mb-2 left-1/2 -translate-x-1/2 bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded-lg px-3 py-2 shadow-xl pointer-events-none w-64 max-w-[min(16rem,80vw)] whitespace-normal leading-relaxed">
          {text}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-700" />
        </div>
      )}
    </span>
  )
}

function CategoryDropdown({ value, onChange, grouped, allCategories, onAddNew }: {
  value: string; onChange: (v: string) => void
  grouped: Record<string, any[]>; allCategories: any[]; onAddNew: () => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const selected = allCategories.find(c => c.name === value)
  const filtered = search ? allCategories.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.group.toLowerCase().includes(search.toLowerCase())) : null

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-left hover:border-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50">
        <span className={selected ? 'text-zinc-200' : 'text-zinc-500'}>{selected ? selected.name : 'Cari atau pilih kategori...'}</span>
        <ChevronDown size={14} className="text-zinc-500 shrink-0" />
      </button>
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden">
          <div className="p-2 border-b border-zinc-800">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari kategori..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 focus:outline-none" />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered ? filtered.map(c => (
              <button key={c.id} type="button" onClick={() => { onChange(c.name); setOpen(false); setSearch('') }}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-zinc-800 ${value === c.name ? 'bg-emerald-900/30 text-emerald-300' : 'text-zinc-300'}`}>
                <span className="text-zinc-500 mr-1">{c.group} /</span>{c.name}
              </button>
            )) : Object.entries(grouped).map(([grp, cats]) => (
              <div key={grp}>
                <div className="px-3 py-1.5 text-[10px] font-bold text-zinc-500 uppercase tracking-wide bg-zinc-800/50 border-t border-zinc-800">{grp}</div>
                {cats.map((c: any) => (
                  <button key={c.id} type="button" onClick={() => { onChange(c.name); setOpen(false); setSearch('') }}
                    className={`w-full text-left px-4 py-2 text-xs hover:bg-zinc-800 ${value === c.name ? 'bg-emerald-900/30 text-emerald-300' : 'text-zinc-300'}`}>
                    {c.name}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div className="border-t border-zinc-800">
            <button type="button" onClick={() => { setOpen(false); onAddNew() }}
              className="w-full text-left px-3 py-2.5 text-xs text-emerald-400 hover:bg-zinc-800 flex items-center gap-1.5">
              <Plus size={11} />Tambah kategori baru...
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function AddCategoryModal({ onClose, onCreated }: { onClose: () => void; onCreated: (name: string) => void }) {
  const { toast } = useToast()
  const [form, setForm] = useState({ name: '', group: 'Beban Operasional' })
  const [loading, setLoading] = useState(false)
  const GROUPS = ['Beban Pokok Penjualan', 'Beban Operasional', 'Beban Lain-lain']

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true)
    try {
      const res = await fetch('/api/finance/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ title: 'Kategori berhasil dibuat', type: 'success' })
      onCreated(form.name); onClose()
    } catch (err: any) { toast({ title: err.message || 'Gagal', type: 'error' })
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-sm p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Tambah Kategori Baru</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={16}/></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Nama Kategori *</label>
            <input value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} required placeholder="cth: Komisi Reseller"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Group</label>
            <select value={form.group} onChange={e => setForm(p => ({...p, group: e.target.value}))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none">
              {GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div className="flex gap-2 pt-1">
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

function AddTransactionModal({ onClose, wallets }: { onClose: () => void; wallets: any[] }) {
  const qc = useQueryClient(); const { toast } = useToast()
  const [form, setForm] = useState({
    walletId: wallets[0]?.id ?? '', trxDate: new Date().toISOString().slice(0,10),
    trxType: 'EXPENSE', category: '', amount: '', note: '', destWalletId: '',
  })
  const [loading, setLoading] = useState(false)
  const [showAddCat, setShowAddCat] = useState(false)
  const set = (k: string, v: string) => setForm(p => ({...p, [k]: v}))

  const { data: catData } = useQuery({ queryKey: ['expense-categories'],
    queryFn: async () => fetch('/api/finance/categories').then(r => r.json()).then(d => d.data) })
  const categories: any[] = catData?.categories ?? []
  const grouped: Record<string, any[]> = catData?.grouped ?? {}
  const selectedType = TRX_TYPES.find(t => t.value === form.trxType)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true)
    try {
      const res = await fetch('/api/wallet/ledger', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({...form, amount: parseInt(form.amount,10)}) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ title:'Transaksi berhasil ditambahkan', type:'success' })
      qc.invalidateQueries({ queryKey:['wallets'] }); qc.invalidateQueries({ queryKey:['wallet-ledger'] }); onClose()
    } catch (err:any) { toast({ title:err.message||'Gagal', type:'error' })
    } finally { setLoading(false) }
  }

  return (
    <>
      {showAddCat && <AddCategoryModal onClose={() => setShowAddCat(false)} onCreated={name => { set('category', name); qc.invalidateQueries({ queryKey:['expense-categories'] }) }} />}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-white">Tambah Transaksi</h2>
            <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={18}/></button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Wallet</label>
              <select value={form.walletId} onChange={e => set('walletId', e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none">
                {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Tanggal</label>
              <input type="date" value={form.trxDate} onChange={e => set('trxDate', e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none [&::-webkit-calendar-picker-indicator]:invert-[0.6]" />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1 flex items-center">Tipe {selectedType && <Tooltip text={selectedType.tooltip}/>}</label>
              <select value={form.trxType} onChange={e => { set('trxType', e.target.value); set('category', '') }}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none">
                {TRX_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {form.trxType !== 'TRANSFER' && (
              <div>
                <label className="block text-xs text-zinc-500 mb-1 flex items-center">Kategori {form.trxType === 'EXPENSE' && <Tooltip text="Pilih kategori beban."/>}</label>
                {form.trxType === 'EXPENSE' ? (
                  <CategoryDropdown value={form.category} onChange={v => set('category', v)} grouped={grouped} allCategories={categories} onAddNew={() => setShowAddCat(true)} />
                ) : (
                  <input value={form.category} onChange={e => set('category', e.target.value)} placeholder="Kategori (opsional)"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none" />
                )}
              </div>
            )}
            <div>
              <label className="block text-xs text-zinc-500 mb-1 flex items-center">Jumlah (Rp) <Tooltip text="Masukkan nominal tanpa minus. Sistem otomatis menentukan arah."/></label>
              <input type="number" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0" min="1"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none" />
              {form.amount && <p className="text-[10px] text-zinc-600 mt-1">{['EXPENSE','PRIVE','INVESTASI','BAYAR_UTANG','PENGEMBALIAN_MODAL'].includes(form.trxType)?'← Keluar':'→ Masuk'} wallet · {formatRupiah(parseInt(form.amount)||0, true)}</p>}
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Catatan</label>
              <input type="text" value={form.note} onChange={e => set('note', e.target.value)} placeholder="Opsional"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none" />
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
              <button type="button" onClick={onClose} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg py-2 text-sm">Batal</button>
              <button type="submit" disabled={loading} className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-medium">
                {loading ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}

function ManageWalletsModal({ onClose, wallets }: { onClose: () => void; wallets: any[] }) {
  const qc = useQueryClient(); const { toast } = useToast()
  const [newWalletName, setNewWalletName] = useState('')
  const [loading, setLoading] = useState(false)

  const handleCreate = async () => {
    if (!newWalletName) return; setLoading(true)
    try {
      const res = await fetch('/api/wallet', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name:newWalletName}) })
      if (!res.ok) throw new Error((await res.json()).error)
      setNewWalletName(''); qc.invalidateQueries({ queryKey:['wallets'] }); toast({ title:'Wallet berhasil dibuat', type:'success' })
    } catch (err:any) { toast({ title:err.message||'Gagal', type:'error' })
    } finally { setLoading(false) }
  }

  const toggleActive = async (id: string, current: boolean) => {
    if (!confirm(`Yakin ${current?'menonaktifkan':'mengaktifkan'} wallet ini?`)) return; setLoading(true)
    try { await fetch(`/api/wallet/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({isActive:!current}) }); qc.invalidateQueries({ queryKey:['wallets'] }); toast({ title:'Status diperbarui', type:'success' }) }
    catch { toast({ title:'Gagal', type:'error' }) }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg p-6">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-base font-semibold text-white">Kelola Wallet</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={18}/></button>
        </div>
        <div className="flex gap-2 mb-4">
          <input value={newWalletName} onChange={e => setNewWalletName(e.target.value)} placeholder="Nama Wallet Baru"
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none" />
          <button onClick={handleCreate} disabled={loading||!newWalletName}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium">Tambah</button>
        </div>
        <div className="max-h-60 overflow-y-auto space-y-2 pr-1 mb-4">
          {wallets.map(w => (
            <div key={w.id} className="flex items-center justify-between bg-zinc-800/50 border border-zinc-700/50 p-3 rounded-lg">
              <div><p className="text-sm font-medium text-white">{w.name}</p><p className="text-xs text-zinc-500">{w.isActive?'Aktif':'Nonaktif'}</p></div>
              <button onClick={() => toggleActive(w.id, w.isActive)} disabled={loading}
                className={`text-xs px-2 py-1 rounded ${w.isActive?'bg-red-900/30 text-red-400 hover:bg-red-900/50':'bg-emerald-900/30 text-emerald-400 hover:bg-emerald-900/50'}`}>
                {w.isActive?'Nonaktifkan':'Aktifkan'}
              </button>
            </div>
          ))}
        </div>
        <button onClick={onClose} className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg py-2.5 text-sm font-medium">Tutup</button>
      </div>
    </div>
  )
}

export function WalletTab() {
  const [showModal, setShowModal]             = useState(false)
  const [showManageWallets, setShowManageWallets] = useState(false)
  const [walletFilter, setWalletFilter]       = useState('')
  const [typeFilter, setTypeFilter]           = useState('')
  const [page, setPage]                       = useState(1)
  const limit = 30

  const { data: wallets } = useQuery({ queryKey:['wallets'], queryFn: async () => fetch('/api/wallet').then(r=>r.json()).then(d=>d.data??[]) })
  const { data: ledgerData, isLoading } = useQuery({
    queryKey: ['wallet-ledger', walletFilter, typeFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({ walletId:walletFilter, trxType:typeFilter, page:String(page), limit:String(limit) })
      return fetch(`/api/wallet/ledger?${params}`).then(r=>r.json()).then(d=>d.data)
    },
  })

  const entries      = ledgerData?.entries ?? []
  const total        = ledgerData?.total ?? 0
  const totalPages   = Math.ceil(total / limit)
  const totalBalance = (wallets ?? []).reduce((s: number, w: any) => s + w.balance, 0)

  const handleExport = () => downloadCSV('wallet-ledger.csv', entries.map((e:any) => ({
    Tanggal:formatDate(e.trxDate), Wallet:e.wallet?.name, Tipe:e.trxType, Kategori:e.category, Amount:e.amount, 'Ref Order':e.refOrderNo, Catatan:e.note,
  })))

  return (
    <>
      {showModal && wallets && <AddTransactionModal onClose={() => setShowModal(false)} wallets={wallets} />}
      {showManageWallets && wallets && <ManageWalletsModal onClose={() => setShowManageWallets(false)} wallets={wallets} />}

      {/* Action bar */}
      <div className="flex justify-end gap-2 mb-4">
        <button onClick={() => setShowManageWallets(true)} className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-blue-400 rounded-lg px-3 py-2 text-sm border border-zinc-700">
          <Settings size={14}/>Kelola Wallet
        </button>
        <button onClick={handleExport} className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg px-3 py-2 text-sm border border-zinc-700">
          <Download size={14}/>Export
        </button>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg px-3 py-2 text-sm font-medium">
          <Plus size={14}/>Tambah Transaksi
        </button>
      </div>

      {/* Wallet Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {(wallets ?? []).map((w: any) => (
          <div key={w.id} className={`stat-card cursor-pointer transition-all ${walletFilter === w.id ? 'ring-2 ring-emerald-500/50' : ''}`}
            onClick={() => setWalletFilter(walletFilter === w.id ? '' : w.id)}>
            <p className="text-zinc-500 text-xs truncate mb-1">{w.name}</p>
            <p className={`font-bold text-sm ${w.balance >= 0 ? 'text-white' : 'text-red-400'}`}>{formatRupiah(w.balance, true)}</p>
          </div>
        ))}
        <div className="stat-card bg-emerald-900/20 border-emerald-800">
          <p className="text-zinc-500 text-xs mb-1">Total Saldo</p>
          <p className={`font-bold text-sm ${totalBalance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatRupiah(totalBalance, true)}</p>
        </div>
      </div>

      <div className="flex gap-3 mb-4 flex-wrap">
        <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1) }}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none">
          <option value="">Semua Tipe</option>
          {TRX_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        {walletFilter && <button onClick={() => setWalletFilter('')} className="text-xs text-zinc-500 hover:text-zinc-300">✕ Reset filter wallet</button>}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead><tr>
              <th className="w-28">Tanggal</th><th className="w-32">Wallet</th><th className="w-36">Tipe</th>
              <th>Kategori</th><th className="w-32 text-right">Jumlah</th><th>Catatan</th>
            </tr></thead>
            <tbody>
              {isLoading ? Array.from({length:8}).map((_,i) => (
                <tr key={i}>{Array.from({length:6}).map((_,j) => <td key={j}><div className="h-4 bg-zinc-800 rounded animate-pulse"/></td>)}</tr>
              )) : entries.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-10 text-zinc-600">Tidak ada transaksi</td></tr>
              ) : entries.map((e:any) => {
                const meta = TRX_TYPE_META[e.trxType]
                return (
                  <tr key={e.id}>
                    <td className="text-xs text-zinc-400">{formatDate(e.trxDate)}</td>
                    <td className="text-xs text-zinc-400">{e.wallet?.name}</td>
                    <td><span className={meta?.color||'badge-muted'}>{meta?.label||e.trxType}</span></td>
                    <td className="text-xs text-zinc-400">{e.category||'—'}</td>
                    <td className={`text-right text-sm font-medium ${e.amount>=0?'text-emerald-400':'text-red-400'}`}>
                      {e.amount>=0?'+':''}{formatRupiah(e.amount, true)}
                    </td>
                    <td className="text-xs text-zinc-500 max-w-xs truncate">{e.note||'—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800">
            <p className="text-xs text-zinc-500">{total} transaksi</p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p=>Math.max(1,p-1))} disabled={page===1} className="p-1.5 rounded bg-zinc-800 text-zinc-400 disabled:opacity-30"><ChevronLeft size={14}/></button>
              <span className="text-xs text-zinc-400 px-2">{page}/{totalPages}</span>
              <button onClick={() => setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages} className="p-1.5 rounded bg-zinc-800 text-zinc-400 disabled:opacity-30"><ChevronRight size={14}/></button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}


