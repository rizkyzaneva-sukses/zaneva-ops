'use client'

import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/components/ui/toaster'
import { formatRupiah } from '@/lib/utils'
import { X, CreditCard, Info } from 'lucide-react'

interface PayVendorModalProps {
  /** Jika di-set, vendor di-lock (tidak bisa diubah) */
  prefillVendorId?: string
  /** Jika di-set, PO di-lock (tidak bisa diubah) */
  prefillPoId?: string
  onClose: () => void
  onSuccess?: () => void
}

export function PayVendorModal({ prefillVendorId, prefillPoId, onClose, onSuccess }: PayVendorModalProps) {
  const qc = useQueryClient()
  const { toast } = useToast()

  const isVendorLocked = !!prefillVendorId
  const isPoLocked = !!prefillPoId

  const [vendorId, setVendorId] = useState(prefillVendorId || '')
  const [poId, setPoId] = useState(prefillPoId || '')
  const [walletId, setWalletId] = useState('')
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10))
  const [amount, setAmount] = useState('')
  const [paymentType, setPaymentType] = useState<'DP' | 'PARTIAL' | 'PELUNASAN'>('PELUNASAN')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)

  // Fetch vendors
  const { data: vendors } = useQuery({
    queryKey: ['vendors-all'],
    queryFn: () => fetch('/api/vendors?all=true').then(r => r.json()).then(d => d.data ?? []),
  })

  // Fetch wallets
  const { data: wallets } = useQuery({
    queryKey: ['wallets-active'],
    queryFn: () => fetch('/api/wallet').then(r => r.json()).then(d => d.data ?? []),
  })

  // Fetch POs untuk vendor yang dipilih (hanya yang belum lunas)
  const { data: poList } = useQuery({
    queryKey: ['purchase-orders-for-vendor', vendorId],
    queryFn: () => fetch(`/api/purchase-orders?vendorId=${vendorId}&paymentStatus=UNPAID_OR_PARTIAL&limit=100`).then(r => r.json()).then(d => d.data?.purchaseOrders ?? []),
    enabled: !!vendorId && !isPoLocked,
  })

  // Fetch detail PO yang dipilih (untuk info sisa pembayaran)
  const { data: selectedPoDetail } = useQuery({
    queryKey: ['po-detail', poId],
    queryFn: () => fetch(`/api/purchase-orders/${poId}`).then(r => r.json()).then(d => d.data),
    enabled: !!poId,
  })

  // Jika prefillPoId berubah karena parent mele-set ulang
  useEffect(() => {
    if (prefillPoId) setPoId(prefillPoId)
  }, [prefillPoId])

  useEffect(() => {
    if (prefillVendorId) setVendorId(prefillVendorId)
  }, [prefillVendorId])

  // Nama vendor untuk display
  const vendorName = vendors?.find((v: any) => v.id === vendorId)?.namaVendor || ''

  // Sisa pembayaran untuk PO yang dipilih
  const poSisa = selectedPoDetail
    ? selectedPoDetail.totalAmount - selectedPoDetail.totalPaid
    : null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!vendorId)     { toast({ title: 'Pilih vendor', type: 'error' }); return }
    if (!walletId)     { toast({ title: 'Pilih wallet sumber', type: 'error' }); return }
    if (!amount || Number(amount) <= 0) { toast({ title: 'Masukkan jumlah pembayaran', type: 'error' }); return }
    if (!paymentDate)  { toast({ title: 'Pilih tanggal pembayaran', type: 'error' }); return }

    setLoading(true)
    try {
      const res = await fetch('/api/vendor-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId,
          poId: poId || null,
          walletId,
          paymentDate,
          amount: Number(amount),
          paymentType,
          note: note || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)

      toast({ title: `Pembayaran ${formatRupiah(Number(amount), true)} berhasil disimpan`, type: 'success' })
      qc.invalidateQueries({ queryKey: ['vendor-payments'] })
      qc.invalidateQueries({ queryKey: ['purchase-orders'] })
      qc.invalidateQueries({ queryKey: ['wallets-active'] })
      onSuccess?.()
      onClose()
    } catch (err: any) {
      toast({ title: err.message || 'Gagal menyimpan pembayaran', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const selectedVendorPos = !isPoLocked && poList
    ? (poList as any[]).filter((po: any) => ['UNPAID', 'PARTIAL_PAID'].includes(po.paymentStatus))
    : []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <CreditCard size={18} className="text-emerald-400" />
            <h2 className="text-base font-semibold text-white">Bayar Vendor</h2>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Vendor */}
          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">Vendor *</label>
            {isVendorLocked ? (
              <div className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-400">
                {vendors?.find((v: any) => v.id === vendorId)?.namaVendor || vendorId}
                <span className="ml-2 text-[10px] text-zinc-600">• ter-lock dari PO</span>
              </div>
            ) : (
              <select
                value={vendorId}
                onChange={e => { setVendorId(e.target.value); setPoId('') }}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              >
                <option value="">Pilih vendor</option>
                {(vendors ?? []).map((v: any) => (
                  <option key={v.id} value={v.id}>{v.namaVendor}</option>
                ))}
              </select>
            )}
          </div>

          {/* PO Terkait */}
          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">PO Terkait <span className="text-zinc-600">(opsional)</span></label>
            {isPoLocked ? (
              <div className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-400">
                {selectedPoDetail?.poNumber || poId}
                <span className="ml-2 text-[10px] text-zinc-600">• ter-lock</span>
              </div>
            ) : (
              <select
                value={poId}
                onChange={e => setPoId(e.target.value)}
                disabled={!vendorId}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 disabled:opacity-40"
              >
                <option value="">Tidak ada / pilih PO...</option>
                {selectedVendorPos.map((po: any) => {
                  const sisa = po.totalAmount - po.totalPaid
                  return (
                    <option key={po.id} value={po.id}>
                      {po.poNumber} — sisa {formatRupiah(sisa, true)}
                    </option>
                  )
                })}
              </select>
            )}
          </div>

          {/* Info PO card */}
          {selectedPoDetail && (
            <div className="bg-zinc-800/60 border border-zinc-700 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-1.5 mb-2">
                <Info size={13} className="text-emerald-400" />
                <span className="text-xs font-semibold text-zinc-300">{selectedPoDetail.poNumber}</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <p className="text-zinc-500 mb-0.5">Total PO</p>
                  <p className="text-zinc-200 font-medium">{formatRupiah(selectedPoDetail.totalAmount)}</p>
                </div>
                <div>
                  <p className="text-zinc-500 mb-0.5">Sudah Bayar</p>
                  <p className="text-emerald-400 font-medium">{formatRupiah(selectedPoDetail.totalPaid)}</p>
                </div>
                <div>
                  <p className="text-zinc-500 mb-0.5">Sisa</p>
                  <p className="text-amber-400 font-bold">{formatRupiah(poSisa ?? 0)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Wallet & Tanggal */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1.5">Wallet Sumber *</label>
              <select
                value={walletId}
                onChange={e => setWalletId(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              >
                <option value="">Pilih wallet</option>
                {(wallets ?? []).filter((w: any) => w.isActive !== false).map((w: any) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1.5">Tanggal Pembayaran *</label>
              <input
                type="date"
                value={paymentDate}
                onChange={e => setPaymentDate(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              />
            </div>
          </div>

          {/* Jumlah & Tipe */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1.5">Jumlah (Rp) *</label>
              <input
                type="number"
                min={1}
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              />
              {poSisa !== null && poSisa > 0 && (
                <button
                  type="button"
                  onClick={() => setAmount(String(poSisa))}
                  className="text-[10px] text-emerald-500 hover:text-emerald-400 mt-1"
                >
                  Isi sisa ({formatRupiah(poSisa, true)})
                </button>
              )}
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1.5">Tipe Pembayaran *</label>
              <select
                value={paymentType}
                onChange={e => setPaymentType(e.target.value as any)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              >
                <option value="DP">DP</option>
                <option value="PARTIAL">Partial</option>
                <option value="PELUNASAN">Pelunasan</option>
              </select>
            </div>
          </div>

          {/* Catatan */}
          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">Catatan <span className="text-zinc-600">(opsional)</span></label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={2}
              placeholder="Keterangan pembayaran..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none"
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg py-2.5 text-sm transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-medium transition-colors"
            >
              {loading ? 'Menyimpan...' : `Simpan Pembayaran${amount ? ` ${formatRupiah(Number(amount), true)}` : ''}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
