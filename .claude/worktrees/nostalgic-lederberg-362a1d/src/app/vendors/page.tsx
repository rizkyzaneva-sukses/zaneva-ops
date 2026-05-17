'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useToast } from '@/components/ui/toaster'
import { Building2, Plus, Search, Edit2 } from 'lucide-react'

function VendorModal({ vendor, onClose }: { vendor?: any; onClose: () => void }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const isEdit = !!vendor
  const [form, setForm] = useState({
    vendorCode: vendor?.vendorCode ?? '',
    namaVendor: vendor?.namaVendor ?? '',
    kontak: vendor?.kontak ?? '',
    email: vendor?.email ?? '',
    alamat: vendor?.alamat ?? '',
    rekening: vendor?.rekening ?? '',
    bank: vendor?.bank ?? '',
    termPayment: vendor?.termPayment ?? 0,
    isActive: vendor?.isActive ?? true,
  })
  const [loading, setLoading] = useState(false)
  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const url = isEdit ? `/api/vendors/${vendor.id}` : '/api/vendors'
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ title: isEdit ? 'Vendor diperbarui' : 'Vendor ditambahkan', type: 'success' })
      qc.invalidateQueries({ queryKey: ['vendors'] })
      qc.invalidateQueries({ queryKey: ['vendors-all'] })
      onClose()
    } catch (err: any) {
      toast({ title: err.message, type: 'error' })
    } finally { setLoading(false) }
  }

  const fields = [
    { label: 'Kode Vendor *', key: 'vendorCode', disabled: isEdit },
    { label: 'Nama Vendor *', key: 'namaVendor' },
    { label: 'Kontak', key: 'kontak' },
    { label: 'Email', key: 'email' },
    { label: 'Rekening', key: 'rekening' },
    { label: 'Bank', key: 'bank' },
    { label: 'Alamat', key: 'alamat' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-base font-semibold text-white mb-4">{isEdit ? 'Edit Vendor' : 'Tambah Vendor'}</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          {fields.map(f => (
            <div key={f.key}>
              <label className="block text-xs text-zinc-500 mb-1">{f.label}</label>
              <input value={(form as any)[f.key]} onChange={e => set(f.key, e.target.value)}
                disabled={f.disabled}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none disabled:opacity-50"/>
            </div>
          ))}
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Term Payment (hari, 0=COD)</label>
            <input type="number" min={0} value={form.termPayment} onChange={e => set('termPayment', Number(e.target.value))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none"/>
          </div>
          {isEdit && (
            <div className="flex items-center gap-2">
              <input type="checkbox" id="va" checked={form.isActive} onChange={e => set('isActive', e.target.checked)} className="rounded"/>
              <label htmlFor="va" className="text-xs text-zinc-400">Aktif</label>
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

export default function VendorsPage() {
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [selected, setSelected] = useState<any>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['vendors', search],
    queryFn: () => {
      const p = new URLSearchParams({ search, limit: '50' })
      return fetch(`/api/vendors?${p}`).then(r => r.json()).then(d => d.data)
    },
  })

  const vendors = data?.vendors ?? []

  return (
    <AppLayout>
      {modal && <VendorModal vendor={modal === 'edit' ? selected : undefined} onClose={() => { setModal(null); setSelected(null) }} />}
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2"><Building2 size={22} className="text-emerald-400"/>Vendor</h1>
        <button onClick={() => setModal('add')} className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors">
          <Plus size={14}/> Tambah Vendor
        </button>
      </div>
      <div className="relative mb-4 max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"/>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari vendor..."
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"/>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="data-table w-full">
          <thead>
            <tr>
              <th className="w-24">Kode</th><th>Nama Vendor</th><th className="w-28">Kontak</th>
              <th className="w-24">Bank</th><th className="w-20 text-center">Term</th>
              <th className="w-20">Status</th><th className="w-16"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? Array.from({length:5}).map((_,i)=>(
              <tr key={i}>{Array.from({length:7}).map((_,j)=><td key={j}><div className="h-4 bg-zinc-800 rounded animate-pulse"/></td>)}</tr>
            )) : vendors.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-10 text-zinc-600">Belum ada vendor</td></tr>
            ) : vendors.map((v: any) => (
              <tr key={v.id}>
                <td><span className="font-mono text-xs text-zinc-400">{v.vendorCode}</span></td>
                <td><p className="text-sm text-zinc-200">{v.namaVendor}</p></td>
                <td className="text-xs text-zinc-400">{v.kontak || '—'}</td>
                <td className="text-xs text-zinc-400">{v.bank || '—'}</td>
                <td className="text-center text-xs text-zinc-400">{v.termPayment === 0 ? 'COD' : `${v.termPayment}h`}</td>
                <td>{v.isActive ? <span className="badge-success">Aktif</span> : <span className="badge-muted">Nonaktif</span>}</td>
                <td>
                  <button onClick={() => { setSelected(v); setModal('edit') }} className="p-1.5 rounded hover:bg-zinc-800 text-zinc-600 hover:text-zinc-300 transition-colors">
                    <Edit2 size={12}/>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppLayout>
  )
}
