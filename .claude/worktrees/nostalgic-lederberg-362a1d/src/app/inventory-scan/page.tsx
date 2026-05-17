'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useToast } from '@/components/ui/toaster'
import { ScanLine, Plus, Minus, CheckCircle, Trash2, Upload, Search, X, AlertCircle } from 'lucide-react'
import Papa from 'papaparse'

type TabKey = 'masuk' | 'keluar' | 'endorsement' | 'retur' | 'retur_pembelian'

const SCAN_TABS: { key: TabKey; label: string; direction: 'IN' | 'OUT'; reason: string; badge?: string }[] = [
  { key: 'masuk',   label: 'Scan Masuk',   direction: 'IN',  reason: 'PURCHASE' },
  { key: 'keluar',  label: 'Scan Keluar',  direction: 'OUT', reason: 'SALES' },
  { key: 'endorsement', label: 'Endorsement', direction: 'OUT', reason: 'MARKETING', badge: 'Beban Sample' },
  { key: 'retur',   label: 'Scan Retur',   direction: 'IN',  reason: 'RETURN_SALES' },
  { key: 'retur_pembelian', label: 'Retur Pembelian', direction: 'OUT', reason: 'RETURN_PURCHASE' }
]

interface ScanItem { 
  sku: string; 
  productName: string; 
  qty: number;
  trxDate?: string;
  supplierName?: string;
  note?: string;
}

interface ReturOrder {
  orderId: string
  orderNo: string
  airwaybill: string
  status: string
  platform: string | null
  items: { sku: string; productName: string; qty: number }[]
}

type KondisiType = 'Baik' | 'Rusak' | 'Tidak Sesuai'

function beep(times = 1) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    for (let i = 0; i < times; i++) {
      setTimeout(() => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.frequency.value = times === 1 ? 880 : 220
        gain.gain.setValueAtTime(0.3, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2)
        osc.start(); osc.stop(ctx.currentTime + 0.2)
      }, i * 250)
    }
  } catch {}
}

// ─── Modal Konfirmasi Retur ──────────────────────────────────────
function ReturModal({
  order,
  allProducts,
  onConfirm,
  onClose,
}: {
  order: ReturOrder
  allProducts: any[]
  onConfirm: (payload: { sku: string; qtyRetur: number; kondisi: KondisiType; note: string }) => void
  onClose: () => void
}) {
  const defaultSku = order.items[0]?.sku ?? ''
  const defaultQty = order.items[0]?.qty ?? 1

  const [selectedSku, setSelectedSku] = useState(defaultSku)
  const [qtyRetur, setQtyRetur] = useState(defaultQty)
  const [kondisi, setKondisi] = useState<KondisiType>('Baik')
  const [note, setNote] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [suggestResults, setSuggestResults] = useState<any[]>([])
  const [suggestLoading, setSuggestLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const suggestDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const selectedProduct = allProducts.find(p => p.sku === selectedSku)
  const displayName = selectedProduct
    ? `${selectedProduct.sku} — ${selectedProduct.productName}`
    : selectedSku

  const fetchSuggest = useCallback((q: string) => {
    if (suggestDebounce.current) clearTimeout(suggestDebounce.current)
    if (!q || q.length < 2) { setSuggestResults([]); return }
    suggestDebounce.current = setTimeout(async () => {
      setSuggestLoading(true)
      try {
        const res = await fetch(`/api/products/search?q=${encodeURIComponent(q)}&limit=15`)
        const json = await res.json()
        setSuggestResults(json.data ?? [])
      } catch { setSuggestResults([]) }
      finally { setSuggestLoading(false) }
    }, 200)
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const kondisiOptions: KondisiType[] = ['Baik', 'Rusak', 'Tidak Sesuai']
  const kondisiColors: Record<KondisiType, string> = {
    'Baik': 'bg-emerald-700 text-white',
    'Rusak': 'bg-red-700 text-white',
    'Tidak Sesuai': 'bg-yellow-700 text-white',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div>
            <h2 className="text-base font-bold text-white">Konfirmasi Retur</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {order.orderNo} · {order.platform ?? '—'} ·{' '}
              <span className="text-orange-400">{order.status}</span>
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Produk dari order asli (info) */}
          {order.items.length > 0 && (
            <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-400">
              <p className="text-zinc-500 mb-1">Produk di order asli:</p>
              {order.items.map(i => (
                <p key={i.sku} className="font-mono">{i.sku} × {i.qty}</p>
              ))}
            </div>
          )}

          {/* Dropdown Produk yang Diretur */}
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5 font-medium">
              Produk yang Diretur
            </label>
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => { setShowDropdown(v => !v); setProductSearch('') }}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-left text-zinc-200 hover:border-zinc-600 transition-colors flex items-center justify-between"
              >
                <span className="truncate">{displayName || 'Pilih produk...'}</span>
                <Search size={12} className="text-zinc-500 shrink-0 ml-2" />
              </button>

              {showDropdown && (
                <div className="absolute z-10 w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl overflow-hidden">
                  <div className="p-2 border-b border-zinc-700">
                    <input
                      autoFocus
                      value={productSearch}
                      onChange={e => { setProductSearch(e.target.value); fetchSuggest(e.target.value) }}
                      placeholder="Cari SKU atau nama produk..."
                      className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                    />
                  </div>
                  <div className="max-h-52 overflow-y-auto divide-y divide-zinc-700/50 custom-scrollbar">
                    {suggestLoading && <p className="text-center py-3 text-xs text-zinc-500 animate-pulse">Mencari...</p>}
                    {!suggestLoading && productSearch.length < 2 && (
                      <p className="text-center py-3 text-xs text-zinc-500">Ketik min 2 huruf untuk mencari...</p>
                    )}
                    {!suggestLoading && suggestResults.map(p => (
                      <button
                        key={p.sku}
                        type="button"
                        onClick={() => {
                          setSelectedSku(p.sku)
                          setShowDropdown(false)
                          setProductSearch('')
                          setSuggestResults([])
                        }}
                        className={`w-full text-left px-3 py-2 text-xs hover:bg-zinc-700 transition-colors ${
                          selectedSku === p.sku ? 'bg-emerald-900/30 text-emerald-300' : 'text-zinc-300'
                        }`}
                      >
                        <span className="font-mono text-zinc-400">{p.sku}</span>
                        <span className="ml-2">{p.productName}</span>
                      </button>
                    ))}
                    {!suggestLoading && productSearch.length >= 2 && suggestResults.length === 0 && (
                      <p className="text-center py-3 text-xs text-zinc-500">Produk tidak ditemukan</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Qty Retur */}
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5 font-medium">Qty Retur</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQtyRetur(q => Math.max(1, q - 1))}
                className="w-8 h-8 rounded bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-700 flex items-center justify-center transition-colors"
              >
                <Minus size={12} />
              </button>
              <input
                type="number"
                min={1}
                value={qtyRetur}
                onChange={e => setQtyRetur(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-20 text-center bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm font-bold text-white focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
              />
              <button
                type="button"
                onClick={() => setQtyRetur(q => q + 1)}
                className="w-8 h-8 rounded bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-700 flex items-center justify-center transition-colors"
              >
                <Plus size={12} />
              </button>
              <span className="text-xs text-zinc-600 ml-1">unit</span>
            </div>
          </div>

          {/* Kondisi Produk */}
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5 font-medium">Kondisi Produk</label>
            <div className="flex gap-2">
              {kondisiOptions.map(k => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKondisi(k)}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all ${
                    kondisi === k
                      ? kondisiColors[k] + ' border-transparent'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                  }`}
                >
                  {kondisi === k ? '● ' : '○ '}{k}
                </button>
              ))}
            </div>
            {kondisi !== 'Baik' && (
              <p className="text-xs text-zinc-500 mt-1.5 flex items-center gap-1">
                <AlertCircle size={10} />
                Stok tetap bertambah meskipun kondisi {kondisi.toLowerCase()}
              </p>
            )}
          </div>

          {/* Catatan (Alasan Retur / Perbedaan Barang) */}
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5 font-medium">Catatan (Penting jika barang beda dari order)</label>
            <textarea
               value={note}
               onChange={e => setNote(e.target.value)}
               placeholder="Contoh: Salah kirim, barang aslinya size S bukan M"
               className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 resize-none h-16"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-sm text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors"
          >
            Batal
          </button>
          <button
            disabled={!selectedSku || qtyRetur < 1 || (selectedSku !== defaultSku && note.trim().length === 0)}
            onClick={() => onConfirm({ sku: selectedSku, qtyRetur, kondisi, note })}
            className="flex-1 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ✓ Konfirmasi Retur
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Tab Retur (scan by resi) ────────────────────────────────────
function TabRetur({ allProducts }: { allProducts: any[] }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)

  const [airwaybill, setAirwaybill] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [order, setOrder] = useState<ReturOrder | null>(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault()
    const val = airwaybill.trim()
    if (!val) return
    setLoading(true)
    setError('')
    setOrder(null)
    try {
      const res = await fetch(`/api/orders/by-resi?airwaybill=${encodeURIComponent(val)}`)
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Order tidak ditemukan')
        beep(3)
        return
      }
      beep(1)
      setOrder(json.data)
    } catch (err: any) {
      setError(err.message || 'Gagal fetch order')
      beep(3)
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = async (payload: { sku: string; qtyRetur: number; kondisi: KondisiType; note: string }) => {
    if (!order) return
    setConfirming(true)
    try {
      const res = await fetch('/api/scan/retur', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderNo: order.orderNo,
          airwaybill: order.airwaybill,
          items: [{ sku: payload.sku, qtyRetur: payload.qtyRetur, kondisi: payload.kondisi, note: payload.note }],
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)

      beep(1)
      toast({ title: json.data.message, type: 'success' })
      setOrder(null)
      setAirwaybill('')
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: ['orders'] })
      setTimeout(() => inputRef.current?.focus(), 100)
    } catch (err: any) {
      toast({ title: err.message || 'Retur gagal', type: 'error' })
      beep(3)
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div className="space-y-4 max-w-lg">
      {order && !confirming && (
        <ReturModal
          order={order}
          allProducts={allProducts}
          onConfirm={handleConfirm}
          onClose={() => { setOrder(null); setAirwaybill(''); inputRef.current?.focus() }}
        />
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <p className="text-sm font-medium text-zinc-400 mb-3">📦 Scan Retur — Input No. Resi</p>

        <form onSubmit={handleScan} className="flex gap-2">
          <div className="relative flex-1">
            <ScanLine size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              ref={inputRef}
              value={airwaybill}
              onChange={e => { setAirwaybill(e.target.value); setError('') }}
              placeholder="Scan / ketik no. resi..."
              className={`w-full bg-zinc-800 border rounded-lg pl-8 pr-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-2 transition-colors ${
                error ? 'border-red-700 focus:ring-red-500/50' : 'border-zinc-700 focus:ring-emerald-500/50'
              }`}
            />
          </div>
          <button
            type="submit"
            disabled={loading || !airwaybill.trim()}
            className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            {loading ? 'Cari...' : 'Cari'}
          </button>
        </form>

        {error && (
          <p className="text-red-400 text-xs mt-2 bg-red-900/20 border border-red-900 rounded px-3 py-2 flex items-center gap-1.5">
            <AlertCircle size={12} /> {error}
          </p>
        )}

        <p className="text-xs text-zinc-600 mt-3">
          Scan resi pesanan yang diretur. Bisa scan order TERKIRIM maupun DICAIRKAN.
        </p>
      </div>
    </div>
  )
}

// ─── Halaman Utama ───────────────────────────────────────────────
export default function InventoryScanPage() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<TabKey>('masuk')
  const [items, setItems] = useState<ScanItem[]>([])
  const [skuInput, setSkuInput] = useState('')
  const [lookupError, setLookupError] = useState('')
  const [showSuggest, setShowSuggest] = useState(false)
  const [suggestResults, setSuggestResults] = useState<any[]>([])
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [committed, setCommitted] = useState(false)
  const skuRef = useRef<HTMLInputElement>(null)
  const lockRef = useRef(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const suggestDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Form states specifically for Retur Pembelian manual input
  const [rpDate, setRpDate] = useState(new Date().toISOString().split('T')[0])
  const [rpSupplier, setRpSupplier] = useState('')
  const [rpReason, setRpReason] = useState('')
  const [rpNote, setRpNote] = useState('')
  const [rpQty, setRpQty] = useState(1)

  const tab = SCAN_TABS.find(t => t.key === activeTab)!

  const { data: productsData } = useQuery({
    queryKey: ['products-all'],
    queryFn: async () => {
      const res = await fetch('/api/products?limit=all&isActive=true')
      return res.json().then(d => d.data?.products ?? [])
    },
  })

  // Live search suggest via API
  const fetchSuggest = useCallback((q: string) => {
    if (suggestDebounce.current) clearTimeout(suggestDebounce.current)
    if (!q || q.length < 2) { setSuggestResults([]); return }
    suggestDebounce.current = setTimeout(async () => {
      setSuggestLoading(true)
      try {
        const res = await fetch(`/api/products/search?q=${encodeURIComponent(q)}&limit=15`)
        const json = await res.json()
        setSuggestResults(json.data ?? [])
      } catch { setSuggestResults([]) }
      finally { setSuggestLoading(false) }
    }, 200)
  }, [])

  const productMap = new Map(
    (productsData ?? []).map((p: any) => [p.sku.toLowerCase(), p])
  )
  const productByName = new Map(
    (productsData ?? []).map((p: any) => [p.productName.toLowerCase(), p])
  )

  const findProduct = (val: string): any => {
    const v = val.trim().toLowerCase()
    return productMap.get(v) || productByName.get(v)
  }

  const addItem = useCallback((sku: string) => {
    if (lockRef.current) return
    lockRef.current = true

    const product = findProduct(sku)
    if (!product) {
      lockRef.current = false   // reset lock immediately on error
      setLookupError(`"${sku}" tidak ditemukan`)
      beep(3)
      setTimeout(() => setLookupError(''), 2000)
      return
    }

    setLookupError('')
    setItems(prev => {
      if (activeTab === 'retur_pembelian') {
        beep(1)
        return [...prev, { 
          sku: product.sku, 
          productName: product.productName, 
          qty: rpQty,
          trxDate: rpDate,
          supplierName: rpSupplier,
          note: [rpReason, rpNote].filter(Boolean).join(' - ')
        }]
      }

      const existing = prev.find(i => i.sku === product.sku)
      if (existing) {
        beep(1)
        return prev.map(i => i.sku === product.sku ? { ...i, qty: i.qty + 1 } : i)
      }
      beep(1)
      return [...prev, { sku: product.sku, productName: product.productName, qty: 1 }]
    })
    setSkuInput('')
    setRpQty(1)
    setTimeout(() => { lockRef.current = false }, 400)  // reset lock after short debounce
  }, [productsData, activeTab, rpQty, rpDate, rpSupplier, rpReason, rpNote])

  const handleSkuSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (activeTab === 'retur_pembelian' && !rpDate) {
      setLookupError('Tanggal retur wajib diisi')
      return
    }
    if (skuInput.trim()) addItem(skuInput)
  }

  const updateQty = (sku: string, delta: number) => {
    setItems(prev =>
      prev.map(i => i.sku === sku ? { ...i, qty: Math.max(1, i.qty + delta) } : i)
    )
  }

  const removeItem = (sku: string) => setItems(prev => prev.filter(i => i.sku !== sku))

  // CSV upload
  const handleCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        let added = 0, failed = 0
        ;(results.data as Record<string, string>[]).forEach(row => {
          const prodVal = row['PRODUK'] || row['SKU'] || row['NAMA PRODUK'] || row['Produk'] || ''
          const qtyVal = row['QTY'] || row['QUANTITY'] || row['JUMLAH'] || row['Qty'] || '1'
          const qty = parseInt(qtyVal, 10)
          const product = findProduct(prodVal)

          let trxDate = ''
          if (activeTab === 'retur_pembelian') {
            const trxDateVal = (row['TANGGAL_RETUR'] || row['Tanggal Retur'] || row['TANGGAL RETUR'] || '').trim()
            if (!trxDateVal) { failed++; return }
            if (trxDateVal.includes('/')) {
              const parts = trxDateVal.split('/')
              if (parts[2] && parts[2].length === 4) {
                 trxDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
              }
            } else {
               trxDate = trxDateVal
            }
          }

          if (!product || isNaN(qty) || qty <= 0) { failed++; return }

          setItems(prev => {
            if (activeTab === 'retur_pembelian') {
               return [...prev, { sku: product.sku, productName: product.productName, qty, trxDate }]
            }
            const ex = prev.find(i => i.sku === product.sku)
            if (ex) return prev.map(i => i.sku === product.sku ? { ...i, qty: i.qty + qty } : i)
            return [...prev, { sku: product.sku, productName: product.productName, qty }]
          })
          added++
        })
        toast({ title: `${added} produk ditambahkan${failed ? `, ${failed} gagal` : ''}`, type: added > 0 ? 'success' : 'error' })
        if (fileRef.current) fileRef.current.value = ''
      },
    })
  }

  // Commit batch (Masuk / Keluar)
  const handleCommit = async () => {
    if (items.length === 0) return
    setCommitting(true)
    try {
      const batchRes = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          direction: tab.direction,
          reason: tab.reason,
          itemsWithDetails: items.map(i => ({ 
            sku: i.sku, 
            qty: i.qty, 
            trxDate: i.trxDate, 
            supplierName: i.supplierName, 
            note: i.note 
          })),
        }),
      })
      const batchData = await batchRes.json()
      if (!batchRes.ok) throw new Error(batchData.error)

      const commitRes = await fetch(`/api/scan/${batchData.data.id}/commit`, { method: 'POST' })
      const commitData = await commitRes.json()
      if (!commitRes.ok) throw new Error(commitData.error)

      setCommitted(true)
      beep(1)

      // Toast utama
      const bs = commitData.data?.bebanSample
      if (bs) {
        // Endorsement: tampilkan ringkasan beban sample
        const nominal = bs.totalAmount > 0
          ? ` — Beban Sample Rp${bs.totalAmount.toLocaleString('id-ID')} dibukukan ke Finance`
          : ''
        toast({
          title: `${items.length} SKU Endorsement di-commit${nominal}`,
          type: 'success',
        })
        if (bs.warning) {
          setTimeout(() => toast({ title: `⚠️ ${bs.warning}`, type: 'error' }), 800)
        }
      } else {
        toast({ title: `${items.length} SKU berhasil di-commit ke ledger`, type: 'success' })
      }

      setTimeout(() => {
        setItems([])
        setCommitted(false)
        qc.invalidateQueries({ queryKey: ['inventory'] })
        qc.invalidateQueries({ queryKey: ['wallets'] })
        qc.invalidateQueries({ queryKey: ['wallet-ledger'] })
      }, 2000)
    } catch (err: any) {
      toast({ title: err.message || 'Commit gagal', type: 'error' })
      beep(3)
    } finally {
      setCommitting(false)
    }
  }

  // Switch tab → reset items (tab Retur tidak punya items, tidak perlu confirm)
  const switchTab = (key: TabKey) => {
    if (activeTab !== 'retur' && items.length > 0 && !confirm('Ganti tab akan menghapus item saat ini. Lanjutkan?')) return
    setActiveTab(key)
    setItems([])
    setLookupError('')
    setTimeout(() => skuRef.current?.focus(), 100)
  }

  const isEndorsement = activeTab === 'endorsement'

  useEffect(() => { skuRef.current?.focus() }, [])

  const totalItems = items.reduce((s, i) => s + i.qty, 0)

  return (
    <AppLayout>
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2">
          <ScanLine size={22} className="text-emerald-400" />
          Scan Inventori
        </h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-zinc-900 border border-zinc-800 rounded-xl p-1 w-fit flex-wrap">
        {SCAN_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => switchTab(t.key)}
            className={`relative px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === t.key
                ? t.key === 'endorsement' ? 'bg-orange-700 text-white' : 'bg-emerald-700 text-white'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t.label}
            {t.badge && (
              <span className="ml-1.5 text-[9px] bg-orange-500/20 text-orange-300 border border-orange-600/40 px-1 py-0.5 rounded">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Retur — flow berbeda: scan resi, bukan SKU */}
      {activeTab === 'retur' ? (
        <TabRetur allProducts={productsData ?? []} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input panel */}
          <div className="space-y-4">
            <div className={`bg-zinc-900 border rounded-xl p-5 ${
              isEndorsement ? 'border-orange-800/60' : 'border-zinc-800'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-zinc-400">
                  {tab.direction === 'IN' ? '📥' : isEndorsement ? '🎁' : '📤'} {tab.label}
                </p>
                {isEndorsement && (
                  <span className="text-[10px] bg-orange-900/30 text-orange-300 border border-orange-700/50 px-2 py-1 rounded-lg">
                    ⚡ Stok keluar → Beban Sample
                  </span>
                )}
              </div>

              {/* Pilihan Form Input */}
              {activeTab === 'retur_pembelian' ? (
                <form onSubmit={handleSkuSubmit} className="space-y-3 mb-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs text-zinc-500 mb-1">SKU / Nama Produk</label>
                        <div className="relative">
                          <ScanLine size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                          <input
                            ref={skuRef}
                            value={skuInput}
                            onChange={e => { setSkuInput(e.target.value); setShowSuggest(true); fetchSuggest(e.target.value) }}
                            onBlur={() => setTimeout(() => setShowSuggest(false), 200)}
                            placeholder="Scan/ketik SKU..."
                            className={`w-full bg-zinc-800 border rounded-lg pl-8 pr-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-2 transition-colors ${
                              lookupError ? 'border-red-700 focus:ring-red-500/50' : 'border-zinc-700 focus:ring-emerald-500/50'
                            }`}
                          />
                          {showSuggest && skuInput.length >= 2 && (
                             <div className="absolute top-full left-0 z-20 w-full mt-1 max-h-48 overflow-y-auto bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl divide-y divide-zinc-700/50 custom-scrollbar">
                               {suggestLoading && <p className="text-center py-3 text-xs text-zinc-500 animate-pulse">Mencari...</p>}
                               {!suggestLoading && suggestResults.map((p: any) => (
                                 <button
                                   key={p.sku}
                                   type="button"
                                   onMouseDown={(e) => {
                                     e.preventDefault()
                                     setSkuInput(p.sku)
                                     setShowSuggest(false)
                                     setSuggestResults([])
                                   }}
                                   className="w-full text-left px-3 py-2.5 text-xs hover:bg-zinc-700 transition-colors flex flex-col justify-center"
                                 >
                                   <div className="truncate"><span className="font-mono text-emerald-400 mr-2">{p.sku}</span><span className="text-zinc-200">{p.productName}</span></div>
                                 </button>
                               ))}
                               {!suggestLoading && suggestResults.length === 0 && <p className="text-center py-3 text-xs text-zinc-500">Produk tidak ditemukan</p>}
                             </div>
                          )}
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs text-zinc-500 mb-1">QTY Retur</label>
                        <input
                          type="number" min={1}
                          value={rpQty}
                          onChange={e => setRpQty(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                        />
                    </div>
                  </div>
                  <div>
                      <label className="block text-xs text-zinc-500 mb-1">Tanggal Retur (Fisik) *</label>
                      <input
                          type="date"
                          value={rpDate}
                          onChange={e => setRpDate(e.target.value)}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                          required
                      />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                      <div>
                          <label className="block text-xs text-zinc-500 mb-1">Supplier (Opsional)</label>
                          <input
                            value={rpSupplier}
                            onChange={e => setRpSupplier(e.target.value)}
                            placeholder="Nama supplier..."
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                          />
                      </div>
                      <div>
                          <label className="block text-xs text-zinc-500 mb-1">Alasan Retur (Opsional)</label>
                          <select 
                            value={rpReason}
                            onChange={e => setRpReason(e.target.value)}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                          >
                           <option value="">-- Pilih --</option>
                           <option value="Cacat Produksi">Cacat Produksi</option>
                           <option value="Salah Kirim">Salah Kirim</option>
                           <option value="Expired">Expired</option>
                          </select>
                      </div>
                  </div>
                  <div>
                      <label className="block text-xs text-zinc-500 mb-1">Keterangan / Catatan Tambahan</label>
                      <input
                          value={rpNote}
                          onChange={e => setRpNote(e.target.value)}
                          placeholder="Nomor resi balik, dsb..."
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      />
                  </div>
                  <button type="submit" className="w-full bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors mt-2">
                    Tambah ke Daftar Retur
                  </button>
                </form>
              ) : (
                <form onSubmit={handleSkuSubmit} className="flex gap-2 mb-3">
                  <div className="relative flex-1">
                    <ScanLine size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input
                      ref={skuRef}
                      value={skuInput}
                      onChange={e => { setSkuInput(e.target.value); setShowSuggest(true); fetchSuggest(e.target.value) }}
                      onBlur={() => setTimeout(() => setShowSuggest(false), 200)}
                      placeholder="Scan / ketik SKU atau nama produk..."
                      className={`w-full bg-zinc-800 border rounded-lg pl-8 pr-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-2 transition-colors ${
                        lookupError ? 'border-red-700 focus:ring-red-500/50' : 'border-zinc-700 focus:ring-emerald-500/50'
                      }`}
                    />
                    {showSuggest && skuInput.length >= 2 && (
                       <div className="absolute top-full left-0 z-20 w-full mt-1 max-h-48 overflow-y-auto bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl divide-y divide-zinc-700/50 custom-scrollbar">
                         {suggestLoading && <p className="text-center py-3 text-xs text-zinc-500 animate-pulse">Mencari...</p>}
                         {!suggestLoading && suggestResults.map((p: any) => (
                           <button
                             key={p.sku}
                             type="button"
                             onMouseDown={(e) => {
                               e.preventDefault()
                               setSkuInput('')
                               setShowSuggest(false)
                               setSuggestResults([])
                               addItem(p.sku)
                             }}
                             className="w-full text-left px-3 py-2.5 text-xs hover:bg-zinc-700 transition-colors flex flex-col justify-center"
                           >
                             <div className="truncate"><span className="font-mono text-emerald-400 mr-2">{p.sku}</span><span className="text-zinc-200">{p.productName}</span></div>
                           </button>
                         ))}
                         {!suggestLoading && suggestResults.length === 0 && <p className="text-center py-3 text-xs text-zinc-500">Produk tidak ditemukan</p>}
                       </div>
                    )}
                  </div>
                  <button type="submit" className="bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors">
                    Tambah
                  </button>
                </form>
              )}

              {lookupError && (
                <p className="text-red-400 text-xs mb-2 bg-red-900/20 border border-red-900 rounded px-3 py-2">{lookupError}</p>
              )}

              {/* CSV Upload */}
              <div className="flex items-center gap-2">
                <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCSV} />
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <Upload size={12} /> Upload CSV
                </button>
                <span className="text-zinc-400 text-xs">Format: PRODUK, QTY{activeTab === 'retur_pembelian' && ', TANGGAL_RETUR'}</span>
              </div>
            </div>

            {/* Commit */}
            {items.length > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm text-zinc-400">{items.length} SKU · {totalItems} unit total</p>
                  <button onClick={() => setItems([])} className="text-zinc-600 hover:text-red-400 transition-colors text-xs flex items-center gap-1">
                    <Trash2 size={12} /> Reset
                  </button>
                </div>
                <button
                  onClick={handleCommit}
                  disabled={committing || committed}
                  className={`w-full py-3 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                    committed
                      ? 'bg-emerald-800 text-emerald-300'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  }`}
                >
                  {committed ? <><CheckCircle size={16} /> Berhasil!</> : committing ? 'Menyimpan...' : `✓ Commit ${tab.label}`}
                </button>
              </div>
            )}
          </div>

          {/* Item list */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
              <p className="text-sm font-medium text-zinc-400">Item Scan</p>
              <span className="text-xs text-zinc-600">{items.length} SKU</span>
            </div>
            {items.length === 0 ? (
              <div className="py-16 text-center">
                <ScanLine size={32} className="mx-auto mb-2 text-zinc-700" />
                <p className="text-zinc-600 text-sm">Belum ada item</p>
                <p className="text-zinc-700 text-xs mt-1">Scan atau ketik SKU untuk memulai</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-800 max-h-96 overflow-y-auto">
                {items.map(item => (
                  <div key={item.sku + (item.trxDate || '')} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-200 truncate" title={item.productName}>{item.productName}</p>
                      <p className="text-[10px] font-mono text-zinc-600">{item.sku}</p>
                      {activeTab === 'retur_pembelian' && (
                        <p className="text-[10px] text-zinc-500 mt-1">Tanggal: {item.trxDate} {item.supplierName ? `| Supplier: ${item.supplierName}` : ''}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => updateQty(item.sku, -1)} className="w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 flex items-center justify-center transition-colors">
                        <Minus size={10} />
                      </button>
                      <span className="w-8 text-center text-sm font-bold text-white">{item.qty}</span>
                      <button onClick={() => updateQty(item.sku, +1)} className="w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 flex items-center justify-center transition-colors">
                        <Plus size={10} />
                      </button>
                      <button onClick={() => removeItem(item.sku)} className="w-6 h-6 rounded hover:bg-red-900/30 text-zinc-600 hover:text-red-400 flex items-center justify-center transition-colors ml-1">
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </AppLayout>
  )
}
