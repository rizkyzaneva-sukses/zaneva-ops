'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useToast } from '@/components/ui/toaster'
import { ScanLine, Plus, Minus, RotateCcw, Package, CheckCircle, Trash2, Upload } from 'lucide-react'
import Papa from 'papaparse'

type TabKey = 'masuk' | 'keluar' | 'retur'

const TABS: { key: TabKey; label: string; direction: 'IN' | 'OUT'; reason: string }[] = [
  { key: 'masuk',   label: 'Scan Masuk',   direction: 'IN',  reason: 'PURCHASE' },
  { key: 'keluar',  label: 'Scan Keluar',  direction: 'OUT', reason: 'SALES' },
  { key: 'retur',   label: 'Scan Retur',   direction: 'IN',  reason: 'RETURN_SALES' },
]

interface ScanItem { sku: string; productName: string; qty: number }

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

export default function InventoryScanPage() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<TabKey>('masuk')
  const [items, setItems] = useState<ScanItem[]>([])
  const [skuInput, setSkuInput] = useState('')
  const [lookupError, setLookupError] = useState('')
  const [committing, setCommitting] = useState(false)
  const [committed, setCommitted] = useState(false)
  const skuRef = useRef<HTMLInputElement>(null)
  const lockRef = useRef(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const tab = TABS.find(t => t.key === activeTab)!

  // Load all products for lookup
  const { data: productsData } = useQuery({
    queryKey: ['products-all'],
    queryFn: async () => {
      const res = await fetch('/api/products?limit=500&isActive=true')
      return res.json().then(d => d.data?.products ?? [])
    },
  })

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
    setTimeout(() => { lockRef.current = false }, 1500)

    const product = findProduct(sku)
    if (!product) {
      setLookupError(`"${sku}" tidak ditemukan`)
      beep(3)
      setTimeout(() => setLookupError(''), 2000)
      return
    }

    setLookupError('')
    setItems(prev => {
      const existing = prev.find(i => i.sku === product.sku)
      if (existing) {
        beep(1)
        return prev.map(i => i.sku === product.sku ? { ...i, qty: i.qty + 1 } : i)
      }
      beep(1)
      return [...prev, { sku: product.sku, productName: product.productName, qty: 1 }]
    })
    setSkuInput('')
  }, [productsData])

  const handleSkuSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (skuInput.trim()) addItem(skuInput)
  }

  const updateQty = (sku: string, delta: number) => {
    setItems(prev => prev
      .map(i => i.sku === sku ? { ...i, qty: Math.max(1, i.qty + delta) } : i)
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
          if (!product || isNaN(qty) || qty <= 0) { failed++; return }
          setItems(prev => {
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

  // Commit batch
  const handleCommit = async () => {
    if (items.length === 0) return
    setCommitting(true)
    try {
      // Create batch
      const batchRes = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          direction: tab.direction,
          reason: tab.reason,
          items: Object.fromEntries(items.map(i => [i.sku, i.qty])),
        }),
      })
      const batchData = await batchRes.json()
      if (!batchRes.ok) throw new Error(batchData.error)

      // Commit it
      const commitRes = await fetch(`/api/scan/${batchData.data.id}/commit`, { method: 'POST' })
      const commitData = await commitRes.json()
      if (!commitRes.ok) throw new Error(commitData.error)

      setCommitted(true)
      beep(1)
      toast({ title: `${items.length} SKU berhasil di-commit ke ledger`, type: 'success' })
      setTimeout(() => {
        setItems([])
        setCommitted(false)
        qc.invalidateQueries({ queryKey: ['inventory'] })
      }, 2000)
    } catch (err: any) {
      toast({ title: err.message || 'Commit gagal', type: 'error' })
      beep(3)
    } finally {
      setCommitting(false)
    }
  }

  // Switch tab → reset items
  const switchTab = (key: TabKey) => {
    if (items.length > 0 && !confirm('Ganti tab akan menghapus item saat ini. Lanjutkan?')) return
    setActiveTab(key)
    setItems([])
    setLookupError('')
    setTimeout(() => skuRef.current?.focus(), 100)
  }

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
      <div className="flex gap-1 mb-6 bg-zinc-900 border border-zinc-800 rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => switchTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === t.key
                ? 'bg-emerald-700 text-white'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input panel */}
        <div className="space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <p className="text-sm font-medium text-zinc-400 mb-3">
              {tab.direction === 'IN' ? '📥' : '📤'} {tab.label}
            </p>

            {/* SKU Input */}
            <form onSubmit={handleSkuSubmit} className="flex gap-2 mb-3">
              <div className="relative flex-1">
                <ScanLine size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  ref={skuRef}
                  value={skuInput}
                  onChange={e => setSkuInput(e.target.value)}
                  placeholder="Scan / ketik SKU atau nama produk..."
                  className={`w-full bg-zinc-800 border rounded-lg pl-8 pr-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-2 transition-colors ${
                    lookupError ? 'border-red-700 focus:ring-red-500/50' : 'border-zinc-700 focus:ring-emerald-500/50'
                  }`}
                />
              </div>
              <button type="submit" className="bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors">
                Tambah
              </button>
            </form>

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
              <span className="text-zinc-700 text-xs">Format: PRODUK, QTY</span>
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
                <div key={item.sku} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-200 truncate">{item.productName}</p>
                    <p className="text-[10px] font-mono text-zinc-600">{item.sku}</p>
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
    </AppLayout>
  )
}
