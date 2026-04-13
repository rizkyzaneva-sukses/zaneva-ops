'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useRef, useCallback } from 'react'
import { formatRupiah, formatDate } from '@/lib/utils'
import { useToast } from '@/components/ui/toaster'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { useAuth } from '@/components/providers'
import {
  TrendingUp, Upload, Loader2, ChevronLeft, ChevronRight,
  X, ShoppingBag, Music2, CalendarRange, AlertTriangle, Trash
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────
interface UploadResult {
  platform: string
  periodeFrom: string
  periodeTo: string
  normal: number
  retur: number
  bebanOngkir: number
  duplikat: number
  totalMasuk: number
  totalBeban: number
  detailBebanOngkir: { orderNo: string; amount: number }[]
  detailDuplikat: string[]
}

interface PlatformStats {
  omzet: number
  totalCair: number
  feePlatform: number
  feeAms: number
  feeLainnya: number
}

interface SummaryData {
  shopee: PlatformStats
  tiktok: PlatformStats
  bebanOngkir: { shopee: number; tiktok: number; total: number }
  total: PlatformStats
}

// ─── Date presets ─────────────────────────────────────
function getPreset(preset: 'this_month' | 'last_month' | 'all') {
  const now = new Date()
  if (preset === 'all') return { from: '', to: '' }
  if (preset === 'this_month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1)
    const to   = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return {
      from: from.toISOString().slice(0, 10),
      to:   to.toISOString().slice(0, 10),
    }
  }
  // last_month
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const to   = new Date(now.getFullYear(), now.getMonth(), 0)
  return {
    from: from.toISOString().slice(0, 10),
    to:   to.toISOString().slice(0, 10),
  }
}

// ─── Sub-component: Platform breakdown row ────────────
function BreakdownRow({ shopeeVal, tiktokVal }: { shopeeVal: number; tiktokVal: number }) {
  return (
    <div className="flex items-center gap-3 mt-1.5">
      <span className="flex items-center gap-1 text-[10px] text-orange-300">
        <ShoppingBag size={9} /> {formatRupiah(shopeeVal, true)}
      </span>
      <span className="text-zinc-700 text-[10px]">|</span>
      <span className="flex items-center gap-1 text-[10px] text-pink-300">
        <Music2 size={9} /> {formatRupiah(tiktokVal, true)}
      </span>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────
export default function PayoutsPage() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { user } = useAuth()

  // File refs
  const csvRef    = useRef<HTMLInputElement>(null)
  const shopeeRef = useRef<HTMLInputElement>(null)
  const tiktokRef = useRef<HTMLInputElement>(null)

  // State
  const [walletId,   setWalletId]   = useState('')
  const [dateFrom,   setDateFrom]   = useState('')
  const [dateTo,     setDateTo]     = useState('')
  const [platform,   setPlatform]   = useState('')
  const [page,       setPage]       = useState(1)
  const [importing,  setImporting]  = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)

  // Modal states
  const [shopeeModal,   setShopeeModal]   = useState(false)
  const [tiktokModal,   setTiktokModal]   = useState(false)
  const [modalWallet,   setModalWallet]   = useState('')
  const [uploadResult,  setUploadResult]  = useState<UploadResult | null>(null)

  const limit = 50

  // ── Queries ──────────────────────────────────────────
  const { data: wallets } = useQuery({
    queryKey: ['wallets'],
    queryFn: () => fetch('/api/wallet').then(r => r.json()).then(d => d.data ?? []),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['payouts', walletId, dateFrom, dateTo, platform, page],
    queryFn: () => {
      const p = new URLSearchParams({
        walletId, dateFrom, dateTo, platform,
        page: String(page), limit: String(limit),
      })
      return fetch(`/api/payouts?${p}`).then(r => r.json()).then(d => d.data)
    },
  })

  const { data: summaryData } = useQuery<SummaryData>({
    queryKey: ['payouts-summary', walletId, dateFrom, dateTo],
    queryFn: () => {
      const p = new URLSearchParams({ walletId, dateFrom, dateTo })
      return fetch(`/api/payouts/summary?${p}`).then(r => r.json()).then(d => d.data)
    },
  })

  const payouts    = data?.payouts ?? []
  const total      = data?.total ?? 0
  const totalPages = Math.ceil(total / limit)
  const summary    = summaryData ?? null

  // Reset page on filter change
  const resetPage = () => { setPage(1); setSelectedIds([]) }

  const handleDeleteSelected = async () => {
    if (!confirm(`Yakin menghapus ${selectedIds.length} payout terpilih?`)) return
    setDeleting(true)
    try {
      const res = await fetch('/api/payouts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      })
      const json = await res.json()
      if (res.ok) {
        toast({ title: json.data.message, type: 'success' })
        setSelectedIds([])
        qc.invalidateQueries({ queryKey: ['payouts'] })
        qc.invalidateQueries({ queryKey: ['payouts-summary'] })
        qc.invalidateQueries({ queryKey: ['wallets'] })
      } else {
        toast({ title: json.error || 'Gagal hapus', type: 'error' })
      }
    } catch (err: any) {
      toast({ title: `Error: ${err.message}`, type: 'error' })
    } finally {
      setDeleting(false)
    }
  }

  // ── Handlers ─────────────────────────────────────────

  // CSV Manual (legacy)
  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !walletId) {
      toast({ title: 'Pilih wallet terlebih dahulu', type: 'error' }); return
    }
    setImporting(true)
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: async (results) => {
        try {
          const res = await fetch('/api/payouts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ payouts: results.data, walletId, source: 'manual_csv' }),
          })
          const json = await res.json()
          if (res.ok) {
            toast({ title: `${json.data.inserted} payout diimport, ${json.data.skipped} duplikat`, type: 'success' })
            qc.invalidateQueries({ queryKey: ['payouts'] })
            qc.invalidateQueries({ queryKey: ['payouts-summary'] })
            qc.invalidateQueries({ queryKey: ['wallets'] })
          } else {
            toast({ title: json.error, type: 'error' })
          }
        } catch { toast({ title: 'Gagal upload', type: 'error' }) }
        finally { setImporting(false); if (csvRef.current) csvRef.current.value = '' }
      },
    })
  }

  // Parse & upload Shopee
  const handleShopeeFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !modalWallet) return
    setImporting(true)
    setShopeeModal(false)
    try {
      const buffer = await file.arrayBuffer()
      const wb     = XLSX.read(buffer, { type: 'array' })
      const ws     = wb.Sheets['Income']
      if (!ws) { toast({ title: 'Sheet "Income" tidak ditemukan', type: 'error' }); return }

      const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: 0 }) as unknown[][]
      const periodeFrom = String((raw[1] as unknown[])[1] ?? '')
      const periodeTo   = String((raw[1] as unknown[])[2] ?? '')
      const headers     = raw[5] as string[]
      const dataRows    = raw.slice(6)
      const rows = dataRows.map(r =>
        Object.fromEntries(headers.map((h, i) => [h, (r as unknown[])[i] ?? 0]))
      )

      const res = await fetch('/api/payouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'shopee_income',
          rawRows: rows,
          walletId: modalWallet,
          periodeFrom,
          periodeTo,
        }),
      })
      const json = await res.json()
      if (res.ok) {
        setUploadResult(json.data as UploadResult)
        qc.invalidateQueries({ queryKey: ['payouts'] })
        qc.invalidateQueries({ queryKey: ['payouts-summary'] })
        qc.invalidateQueries({ queryKey: ['wallets'] })
      } else {
        toast({ title: json.error ?? 'Gagal upload', type: 'error' })
      }
    } catch (err) {
      toast({ title: `Error: ${err instanceof Error ? err.message : 'Gagal baca file'}`, type: 'error' })
    } finally {
      setImporting(false)
      if (shopeeRef.current) shopeeRef.current.value = ''
      setModalWallet('')
    }
  }, [modalWallet, qc, toast])

  // Parse & upload TikTok
  const handleTiktokFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !modalWallet) return
    setImporting(true)
    setTiktokModal(false)
    try {
      const buffer = await file.arrayBuffer()
      const wb     = XLSX.read(buffer, { type: 'array' })

      // Read periode from Reports sheet
      const wsRep   = wb.Sheets['Reports']
      let periodeFrom = '', periodeTo = ''
      if (wsRep) {
        const repData = XLSX.utils.sheet_to_json<unknown[]>(wsRep, { header: 1, defval: '' }) as unknown[][]
        const periodeStr = String((repData[1] as unknown[])[1] ?? '')
        // Format: "2026/02/01-2026/03/31"
        const parts = periodeStr.split('-')
        if (parts.length >= 2) {
          periodeFrom = parts[0].trim().replace(/\//g, '-')
          periodeTo   = parts[1].trim().replace(/\//g, '-')
        }
      }

      const ws = wb.Sheets['Order details']
      if (!ws) { toast({ title: 'Sheet "Order details" tidak ditemukan', type: 'error' }); return }
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: 0 })

      const res = await fetch('/api/payouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'tiktok_income',
          rawRows: rows,
          walletId: modalWallet,
          periodeFrom,
          periodeTo,
        }),
      })
      const json = await res.json()
      if (res.ok) {
        setUploadResult(json.data as UploadResult)
        qc.invalidateQueries({ queryKey: ['payouts'] })
        qc.invalidateQueries({ queryKey: ['payouts-summary'] })
        qc.invalidateQueries({ queryKey: ['wallets'] })
      } else {
        toast({ title: json.error ?? 'Gagal upload', type: 'error' })
      }
    } catch (err) {
      toast({ title: `Error: ${err instanceof Error ? err.message : 'Gagal baca file'}`, type: 'error' })
    } finally {
      setImporting(false)
      if (tiktokRef.current) tiktokRef.current.value = ''
      setModalWallet('')
    }
  }, [modalWallet, qc, toast])

  // ── Render ───────────────────────────────────────────
  return (
    <AppLayout>
      {/* ── Page Header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <TrendingUp size={22} className="text-emerald-400" /> Payout
          </h1>
          <p className="text-zinc-500 text-sm mt-0.5">{total.toLocaleString('id')} record</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          {/* Wallet filter */}
          <select
            id="wallet-filter"
            value={walletId}
            onChange={e => { setWalletId(e.target.value); resetPage() }}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none"
          >
            <option value="">Semua Wallet</option>
            {(wallets ?? []).map((w: { id: string; name: string }) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>

          {/* Hidden file inputs */}
          <input ref={csvRef}    type="file" accept=".csv"  className="hidden" onChange={handleCsvUpload} />
          <input ref={shopeeRef} type="file" accept=".xlsx" className="hidden" onChange={handleShopeeFile} />
          <input ref={tiktokRef} type="file" accept=".xlsx" className="hidden" onChange={handleTiktokFile} />

          {/* CSV Manual */}
          <button
            id="btn-upload-csv"
            onClick={() => { if (!walletId) { toast({ title: 'Pilih wallet dulu', type: 'error' }); return }; csvRef.current?.click() }}
            disabled={importing}
            className="flex items-center gap-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors"
          >
            {importing ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            CSV Manual
          </button>

          {/* Upload Shopee */}
          <button
            id="btn-upload-shopee"
            onClick={() => { setModalWallet(''); setShopeeModal(true) }}
            disabled={importing}
            className="flex items-center gap-1.5 bg-orange-700 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors"
          >
            <ShoppingBag size={13} />
            Upload Shopee
          </button>

          {/* Upload TikTok */}
          <button
            id="btn-upload-tiktok"
            onClick={() => { setModalWallet(''); setTiktokModal(true) }}
            disabled={importing}
            className="flex items-center gap-1.5 bg-pink-700 hover:bg-pink-600 disabled:opacity-50 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors"
          >
            <Music2 size={13} />
            Upload TikTok
          </button>
        </div>
      </div>

      {/* ── Date Range Filter ── */}
      <div className="flex flex-wrap items-center gap-2 mb-5 bg-zinc-900/60 border border-zinc-800 rounded-xl px-4 py-3">
        <CalendarRange size={15} className="text-zinc-500" />
        <span className="text-xs text-zinc-500">Filter:</span>
        <input
          type="date" value={dateFrom}
          onChange={e => { setDateFrom(e.target.value); resetPage() }}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-emerald-600"
        />
        <span className="text-zinc-600 text-xs">s/d</span>
        <input
          type="date" value={dateTo}
          onChange={e => { setDateTo(e.target.value); resetPage() }}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-emerald-600"
        />
        <div className="flex gap-1 ml-1">
          {(['this_month', 'last_month', 'all'] as const).map(preset => (
            <button
              key={preset}
              onClick={() => {
                const { from, to } = getPreset(preset)
                setDateFrom(from); setDateTo(to); resetPage()
              }}
              className="px-2.5 py-1 text-[11px] rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors border border-zinc-700"
            >
              {preset === 'this_month' ? 'Bulan ini' : preset === 'last_month' ? 'Bulan lalu' : 'Semua'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 mb-6">
        {/* Total Omzet */}
        <div className="stat-card">
          <p className="text-zinc-500 text-xs mb-0.5">Total Omzet</p>
          <p className="text-lg font-bold text-white">{formatRupiah(summary?.total.omzet ?? 0, true)}</p>
          <BreakdownRow shopeeVal={summary?.shopee.omzet ?? 0} tiktokVal={summary?.tiktok.omzet ?? 0} />
        </div>

        {/* Total Cair */}
        <div className="stat-card">
          <p className="text-zinc-500 text-xs mb-0.5">Total Cair</p>
          <p className="text-lg font-bold text-emerald-400">{formatRupiah(summary?.total.totalCair ?? 0, true)}</p>
          <BreakdownRow shopeeVal={summary?.shopee.totalCair ?? 0} tiktokVal={summary?.tiktok.totalCair ?? 0} />
        </div>

        {/* Fee Platform */}
        <div className="stat-card">
          <p className="text-zinc-500 text-xs mb-0.5">Fee Platform</p>
          <p className="text-lg font-bold text-red-400">{formatRupiah(summary?.total.feePlatform ?? 0, true)}</p>
          <BreakdownRow shopeeVal={summary?.shopee.feePlatform ?? 0} tiktokVal={summary?.tiktok.feePlatform ?? 0} />
        </div>

        {/* Fee AMS */}
        <div className="stat-card">
          <p className="text-zinc-500 text-xs mb-0.5">Fee AMS</p>
          <p className="text-lg font-bold text-orange-400">{formatRupiah(summary?.total.feeAms ?? 0, true)}</p>
          <BreakdownRow shopeeVal={summary?.shopee.feeAms ?? 0} tiktokVal={summary?.tiktok.feeAms ?? 0} />
        </div>

        {/* Beban Kerugian Ongkir */}
        <div className="stat-card border-red-900/40 bg-red-950/20">
          <p className="text-zinc-500 text-xs mb-0.5 flex items-center gap-1">
            <AlertTriangle size={10} className="text-red-500" /> Beban Ongkir
          </p>
          <p className="text-lg font-bold text-red-400">
            -{formatRupiah(summary?.bebanOngkir.total ?? 0, true)}
          </p>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="flex items-center gap-1 text-[10px] text-orange-300">
              <ShoppingBag size={9} /> -{formatRupiah(summary?.bebanOngkir.shopee ?? 0, true)}
            </span>
            <span className="text-zinc-700 text-[10px]">|</span>
            <span className="flex items-center gap-1 text-[10px] text-pink-300">
              <Music2 size={9} /> -{formatRupiah(summary?.bebanOngkir.tiktok ?? 0, true)}
            </span>
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        {/* Table filters */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
          <span className="text-xs text-zinc-500">Platform:</span>
          <div className="flex gap-1">
            {[
              { val: '', label: 'Semua' },
              { val: 'Shopee', label: '🛒 Shopee' },
              { val: 'TikTok', label: '🎵 TikTok' },
            ].map(opt => (
              <button
                key={opt.val}
                onClick={() => { setPlatform(opt.val); resetPage() }}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors border ${
                  platform === opt.val
                    ? 'bg-emerald-700 border-emerald-600 text-white'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Bulk action bar */}
        {selectedIds.length > 0 && user?.userRole === 'OWNER' && (
          <div className="bg-emerald-900/30 border-b border-zinc-800 px-4 py-2 flex items-center justify-between">
            <p className="text-sm text-emerald-300 font-medium">{selectedIds.length} payout terpilih</p>
            <div className="flex gap-2">
              <button onClick={() => setSelectedIds([])} className="text-xs text-zinc-400 hover:text-zinc-200 px-3 py-1.5">Batal</button>
              <button 
                onClick={handleDeleteSelected} 
                disabled={deleting}
                className="flex items-center gap-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
               >
                {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash size={12} />}
                Hapus
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                {user?.userRole === 'OWNER' && (
                  <th className="w-10">
                    <input 
                      type="checkbox" 
                      className="rounded border-zinc-700 bg-zinc-800 accent-emerald-500 w-3.5 h-3.5"
                      checked={payouts.length > 0 && selectedIds.length === payouts.length}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedIds(payouts.map((p: any) => p.id))
                        else setSelectedIds([])
                      }}
                    />
                  </th>
                )}
                <th>No. Order</th>
                <th className="w-24">Platform</th>
                <th className="w-28">Tgl Cair</th>
                <th className="w-28 text-right">Omzet</th>
                <th className="w-24 text-right">Fee Platform</th>
                <th className="w-24 text-right">Fee AMS</th>
                <th className="w-28 text-right">Total Cair</th>
                <th className="w-28">Wallet</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: user?.userRole === 'OWNER' ? 9 : 8 }).map((_, j) => (
                    <td key={j}><div className="h-4 bg-zinc-800 rounded animate-pulse" /></td>
                  ))}
                </tr>
              )) : payouts.length === 0 ? (
                <tr>
                  <td colSpan={user?.userRole === 'OWNER' ? 9 : 8} className="text-center py-10 text-zinc-600">
                    Belum ada data payout
                  </td>
                </tr>
              ) : payouts.map((p: {
                id: string; orderNo: string; platform?: string; releasedDate: string
                omzet: number; platformFee: number; amsFee: number; totalIncome: number
                wallet?: { name: string }
              }) => (
                <tr key={p.id} className={selectedIds.includes(p.id) ? 'bg-zinc-800/50' : ''}>
                  {user?.userRole === 'OWNER' && (
                    <td>
                      <input 
                        type="checkbox" 
                        className="rounded border-zinc-700 bg-zinc-800 accent-emerald-500 w-3.5 h-3.5"
                        checked={selectedIds.includes(p.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedIds(prev => [...prev, p.id])
                          else setSelectedIds(prev => prev.filter(id => id !== p.id))
                        }}
                      />
                    </td>
                  )}
                  <td><span className="font-mono text-xs text-zinc-400">{p.orderNo}</span></td>
                  <td>
                    {p.platform ? (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        p.platform === 'Shopee'
                          ? 'bg-orange-900/40 text-orange-300'
                          : p.platform === 'TikTok'
                          ? 'bg-pink-900/40 text-pink-300'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}>
                        {p.platform}
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-600">—</span>
                    )}
                  </td>
                  <td className="text-xs text-zinc-400">{formatDate(p.releasedDate)}</td>
                  <td className="text-right text-xs text-zinc-300">{formatRupiah(p.omzet, true)}</td>
                  <td className="text-right text-xs text-red-400">{formatRupiah(p.platformFee, true)}</td>
                  <td className="text-right text-xs text-orange-400">{formatRupiah(p.amsFee, true)}</td>
                  <td className="text-right text-sm font-medium text-emerald-400">{formatRupiah(p.totalIncome, true)}</td>
                  <td className="text-xs text-zinc-500">{p.wallet?.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800">
            <p className="text-xs text-zinc-500">{total} record</p>
            <div className="flex gap-1 items-center">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded bg-zinc-800 text-zinc-400 disabled:opacity-30"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs text-zinc-400 px-2">{page}/{totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded bg-zinc-800 text-zinc-400 disabled:opacity-30"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════
          MODAL: Pilih Wallet Shopee
      ══════════════════════════════════════════ */}
      {shopeeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <ShoppingBag size={15} className="text-orange-400" />
                Upload Payout Shopee
              </h3>
              <button onClick={() => setShopeeModal(false)} className="text-zinc-500 hover:text-zinc-300">
                <X size={16} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-xs text-zinc-400">Pilih wallet tujuan payout:</p>
              <select
                value={modalWallet}
                onChange={e => setModalWallet(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none"
              >
                <option value="">-- Pilih Wallet --</option>
                {(wallets ?? [])
                  .filter((w: { isActive: boolean }) => w.isActive)
                  .map((w: { id: string; name: string }) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
              </select>
              <p className="text-[11px] text-zinc-600">Format: Excel (.xlsx) Income Shopee · Sheet "Income"</p>
            </div>
            <div className="px-5 py-4 flex justify-end gap-2 border-t border-zinc-800">
              <button onClick={() => setShopeeModal(false)}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">
                Batal
              </button>
              <button
                disabled={!modalWallet}
                onClick={() => shopeeRef.current?.click()}
                className="px-4 py-2 text-sm font-medium bg-orange-700 hover:bg-orange-600 disabled:opacity-40 text-white rounded-lg transition-colors"
              >
                Lanjut Upload →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          MODAL: Pilih Wallet TikTok
      ══════════════════════════════════════════ */}
      {tiktokModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Music2 size={15} className="text-pink-400" />
                Upload Payout TikTok
              </h3>
              <button onClick={() => setTiktokModal(false)} className="text-zinc-500 hover:text-zinc-300">
                <X size={16} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-xs text-zinc-400">Pilih wallet tujuan payout:</p>
              <select
                value={modalWallet}
                onChange={e => setModalWallet(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none"
              >
                <option value="">-- Pilih Wallet --</option>
                {(wallets ?? [])
                  .filter((w: { isActive: boolean }) => w.isActive)
                  .map((w: { id: string; name: string }) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
              </select>
              <p className="text-[11px] text-zinc-600">Format: Excel (.xlsx) TikTok Seller Center · Sheet "Order details"</p>
            </div>
            <div className="px-5 py-4 flex justify-end gap-2 border-t border-zinc-800">
              <button onClick={() => setTiktokModal(false)}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">
                Batal
              </button>
              <button
                disabled={!modalWallet}
                onClick={() => tiktokRef.current?.click()}
                className="px-4 py-2 text-sm font-medium bg-pink-700 hover:bg-pink-600 disabled:opacity-40 text-white rounded-lg transition-colors"
              >
                Lanjut Upload →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          MODAL: Hasil Upload
      ══════════════════════════════════════════ */}
      {uploadResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <h3 className="text-sm font-semibold text-white">
                Hasil Upload Payout {uploadResult.platform}
              </h3>
              <button onClick={() => setUploadResult(null)} className="text-zinc-500 hover:text-zinc-300">
                <X size={16} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Periode */}
              {uploadResult.periodeFrom && (
                <p className="text-xs text-zinc-500">
                  Periode: <span className="text-zinc-300">{uploadResult.periodeFrom}</span>
                  {' – '}
                  <span className="text-zinc-300">{uploadResult.periodeTo}</span>
                </p>
              )}

              {/* Counts */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-zinc-800/60 rounded-lg px-3 py-2.5">
                  <p className="text-[10px] text-zinc-500 mb-0.5">✓ Payout Normal</p>
                  <p className="text-base font-bold text-emerald-400">{uploadResult.normal} order</p>
                </div>
                <div className="bg-zinc-800/60 rounded-lg px-3 py-2.5">
                  <p className="text-[10px] text-zinc-500 mb-0.5">↩ Retur (dilewati)</p>
                  <p className="text-base font-bold text-zinc-400">{uploadResult.retur} order</p>
                </div>
                <div className="bg-zinc-800/60 rounded-lg px-3 py-2.5">
                  <p className="text-[10px] text-zinc-500 mb-0.5">⚠ Beban Ongkir</p>
                  <p className="text-base font-bold text-red-400">{uploadResult.bebanOngkir} order</p>
                </div>
                <div className="bg-zinc-800/60 rounded-lg px-3 py-2.5">
                  <p className="text-[10px] text-zinc-500 mb-0.5">⊘ Duplikat</p>
                  <p className="text-base font-bold text-yellow-400">{uploadResult.duplikat} order</p>
                </div>
              </div>

              {/* Totals */}
              <div className="border border-zinc-800 rounded-xl overflow-hidden">
                <div className="flex justify-between items-center px-4 py-2.5 border-b border-zinc-800">
                  <span className="text-xs text-zinc-500">Total Masuk</span>
                  <span className="text-sm font-semibold text-emerald-400">
                    +{formatRupiah(uploadResult.totalMasuk)}
                  </span>
                </div>
                <div className="flex justify-between items-center px-4 py-2.5">
                  <span className="text-xs text-zinc-500">Total Beban</span>
                  <span className="text-sm font-semibold text-red-400">
                    {formatRupiah(uploadResult.totalBeban)}
                  </span>
                </div>
              </div>

              {/* Detail Beban Ongkir */}
              {uploadResult.detailBebanOngkir.length > 0 && (
                <div>
                  <p className="text-xs text-zinc-500 mb-2">Detail Beban Ongkir:</p>
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {uploadResult.detailBebanOngkir.map(d => (
                      <div key={d.orderNo} className="flex justify-between items-center text-xs px-3 py-1.5 bg-red-950/30 rounded-lg">
                        <span className="font-mono text-zinc-400">{d.orderNo}</span>
                        <span className="text-red-400">{formatRupiah(d.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Detail Duplikat */}
              {uploadResult.detailDuplikat.length > 0 && (
                <div>
                  <p className="text-xs text-zinc-500 mb-2">Duplikat dilewati ({uploadResult.detailDuplikat.length}):</p>
                  <div className="text-[11px] text-zinc-600 font-mono bg-zinc-800/50 rounded-lg px-3 py-2 max-h-24 overflow-y-auto">
                    {uploadResult.detailDuplikat.join(', ')}
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-zinc-800 flex justify-end">
              <button
                onClick={() => setUploadResult(null)}
                className="px-5 py-2 text-sm font-medium bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
