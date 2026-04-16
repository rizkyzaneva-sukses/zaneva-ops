'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { formatRupiah, formatDate } from '@/lib/utils'
import { BarChart3, TrendingUp, TrendingDown, Info, RefreshCw } from 'lucide-react'
import { useToast } from '@/components/ui/toaster'

function getDefaultRange() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone:'Asia/Jakarta' }))
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10),
    to: now.toISOString().slice(0,10),
  }
}

export function LaporanTab() {
  const def = getDefaultRange()
  const [dateFrom, setDateFrom] = useState(def.from)
  const [dateTo, setDateTo]     = useState(def.to)
  const [reportType, setReportType] = useState<'summary'|'pl'|'cashflow'|'balance-sheet'>('summary')
  const [syncingHpp, setSyncingHpp] = useState(false)
  const { toast } = useToast()
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['reports', dateFrom, dateTo, reportType],
    queryFn: () => {
      const p = new URLSearchParams({ dateFrom, dateTo, type:reportType, asOf:dateTo })
      let endpoint = `/api/reports?${p}`
      if (reportType==='pl')            endpoint = `/api/reports/pl?${p}`
      if (reportType==='cashflow')      endpoint = `/api/reports/cash-flow?${p}`
      if (reportType==='balance-sheet') endpoint = `/api/reports/balance-sheet?${p}`
      return fetch(endpoint).then(r=>r.json()).then(d=>d.data)
    },
  })

  const handleSyncHpp = async () => {
    if (!confirm('Sinkronkan HPP semua order dari Master Produk?\n\nProses ini update Order.hpp = 0 berdasarkan HPP terkini di master produk.')) return
    setSyncingHpp(true)
    try {
      const res = await fetch('/api/orders/backfill-hpp', { method: 'POST' })
      const json = await res.json()
      if (res.ok) {
        toast({ title: json.data.message, type: 'success' })
        qc.invalidateQueries({ queryKey: ['reports'] })
      } else {
        toast({ title: json.error || 'Gagal sinkron HPP', type: 'error' })
      }
    } catch (err: any) {
      toast({ title: err.message, type: 'error' })
    } finally { setSyncingHpp(false) }
  }

  const setRange = (preset: string) => {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone:'Asia/Jakarta' }))
    const today = now.toISOString().slice(0,10)
    if (preset==='month') { setDateFrom(new Date(now.getFullYear(),now.getMonth(),1).toISOString().slice(0,10)); setDateTo(today) }
    else if (preset==='lastmonth') { setDateFrom(new Date(now.getFullYear(),now.getMonth()-1,1).toISOString().slice(0,10)); setDateTo(new Date(now.getFullYear(),now.getMonth(),0).toISOString().slice(0,10)) }
    else if (preset==='quarter') { const q=Math.floor(now.getMonth()/3); setDateFrom(new Date(now.getFullYear(),q*3,1).toISOString().slice(0,10)); setDateTo(today) }
  }

  return (
    <>
      {/* Filter */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none [&::-webkit-calendar-picker-indicator]:invert-[0.6]"/>
          <span className="text-zinc-600 text-sm">—</span>
          <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none [&::-webkit-calendar-picker-indicator]:invert-[0.6]"/>
        </div>
        <div className="flex gap-1">
          {[{k:'month',l:'Bulan ini'},{k:'lastmonth',l:'Bulan lalu'},{k:'quarter',l:'Kuartal ini'}].map(p => (
            <button key={p.k} onClick={()=>setRange(p.k)}
              className="px-2.5 py-1.5 rounded-lg text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border border-zinc-700">{p.l}</button>
          ))}
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2 mb-6 border-b border-zinc-800 pb-2 overflow-x-auto">
        {[{id:'summary',label:'Ringkasan'},{id:'pl',label:'Laba Rugi (P&L)'},{id:'cashflow',label:'Arus Kas'},{id:'balance-sheet',label:'Neraca'}].map(t => (
          <button key={t.id} onClick={()=>setReportType(t.id as any)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${reportType===t.id?'bg-emerald-900/30 text-emerald-400':'text-zinc-400 hover:bg-zinc-800'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[1,2,3,4].map(i=><div key={i} className="stat-card h-24 animate-pulse"/>)}</div>
      ) : (
        <>
          {reportType==='summary' && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                {[
                  {label:'Total Real Omzet',value:formatRupiah(data?.omzet?.total??0),icon:TrendingUp,color:'text-emerald-400'},
                  {label:'Total HPP',value:formatRupiah(data?.omzet?.byPlatform?.reduce((s:number,p:any)=>s+p.hpp,0)??0),icon:TrendingDown,color:'text-red-400'},
                  {label:'Gross Profit',value:formatRupiah(data?.grossProfit??0),icon:TrendingUp,color:'text-blue-400'},
                  {label:'Gross Margin',value:`${data?.grossMargin??0}%`,icon:BarChart3,color:'text-purple-400'},
                ].map(c=>(
                  <div key={c.label} className="stat-card">
                    <p className="text-zinc-500 text-xs mb-1">{c.label}</p>
                    <p className={`text-lg font-bold ${c.color}`}>{c.value}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                  <p className="text-sm font-medium text-zinc-300 mb-4">Performa per Platform</p>
                  <table className="data-table w-full text-xs">
                    <thead><tr><th>Platform</th><th className="text-right">Orders</th><th className="text-right">Omzet</th><th className="text-right">HPP</th><th className="text-right">GP</th><th className="text-right">Margin</th></tr></thead>
                    <tbody>
                      {(data?.omzet?.byPlatform??[]).map((p:any)=>(
                        <tr key={p.platform}>
                          <td><span className={`font-medium ${p.platform==='TikTok'?'text-pink-400':p.platform==='Shopee'?'text-orange-400':'text-zinc-300'}`}>{p.platform}</span></td>
                          <td className="text-right text-zinc-400">{p.orders}</td>
                          <td className="text-right text-white">{formatRupiah(p.omzet,true)}</td>
                          <td className="text-right text-red-400">{formatRupiah(p.hpp,true)}</td>
                          <td className="text-right text-emerald-400">{formatRupiah(p.grossProfit,true)}</td>
                          <td className="text-right text-blue-400">{p.margin}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                  <p className="text-sm font-medium text-zinc-300 mb-4">Top 10 SKU by Omzet</p>
                  <div className="space-y-1.5 max-h-52 overflow-y-auto">
                    {(data?.topSkus??[]).map((s:any,i:number)=>(
                      <div key={s.sku} className="flex items-center gap-2 text-xs">
                        <span className="text-zinc-700 w-5 shrink-0">{i+1}</span>
                        <span className="font-mono text-zinc-400 flex-1 truncate">{s.sku}</span>
                        <span className="text-zinc-500 shrink-0">{s.qty} pcs</span>
                        <span className="text-emerald-400 font-medium shrink-0">{formatRupiah(s.omzet,true)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {data?.payout && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                  <p className="text-sm font-medium text-zinc-300 mb-4">Cashflow (Payout - Expense)</p>
                  <div className="grid grid-cols-3 gap-4">
                    <div><p className="text-xs text-zinc-500 mb-1">Total Payout Cair</p><p className="text-lg font-bold text-emerald-400">{formatRupiah(data.payout.totalIncome??0,true)}</p></div>
                    <div><p className="text-xs text-zinc-500 mb-1">Total Expense</p><p className="text-lg font-bold text-red-400">{formatRupiah(data.expense?.total??0,true)}</p></div>
                    <div><p className="text-xs text-zinc-500 mb-1">Net Cashflow</p><p className={`text-lg font-bold ${(data.netCashflow??0)>=0?'text-blue-400':'text-red-400'}`}>{formatRupiah(data.netCashflow??0,true)}</p></div>
                  </div>
                </div>
              )}
            </>
          )}

          {reportType==='pl' && data && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <h2 className="text-lg font-bold text-white mb-6 text-center">Laporan Laba Rugi<br/><span className="text-sm text-zinc-400 font-normal">{dateFrom} s/d {dateTo}</span></h2>
              <div className="space-y-4 max-w-3xl mx-auto text-sm">

                {/* Pendapatan Kotor */}
                <div className="border-b border-zinc-800 pb-3">
                  <div className="flex justify-between font-semibold text-emerald-400 text-base">
                    <span>Pendapatan Kotor (Omzet)</span>
                    <span>{formatRupiah(data.pendapatanKotor,true)}</span>
                  </div>
                  <p className="text-[11px] text-zinc-600 mt-0.5 flex items-center gap-1"><Info size={10}/>SUM real_omzet dari tabel Order (harga jual - diskon - 14% platform) per tanggal order</p>
                </div>

                {/* HPP */}
                <div>
                  <div className="flex justify-between pl-4 text-zinc-300">
                    <span>Harga Pokok Penjualan (HPP)</span>
                    <span className="text-red-400">({formatRupiah(data.hpp,true)})</span>
                  </div>
                  <p className="text-[11px] text-zinc-600 mt-0.5 pl-4 flex items-center gap-1"><Info size={10}/>SUM hpp dari tabel Order — diisi saat import order berdasarkan HPP di Master Produk</p>
                  {data.hpp === 0 && (
                    <div className="ml-4 mt-2 flex items-center gap-2 bg-amber-900/20 border border-amber-800/40 rounded-lg px-3 py-2">
                      <span className="text-[11px] text-amber-400">HPP = 0. Mungkin order diimport sebelum HPP diisi di Master Produk.</span>
                      <button onClick={handleSyncHpp} disabled={syncingHpp}
                        className="flex items-center gap-1 text-[11px] bg-amber-700/40 hover:bg-amber-700/70 disabled:opacity-50 text-amber-300 px-2 py-1 rounded-md transition-colors shrink-0">
                        {syncingHpp ? <RefreshCw size={10} className="animate-spin"/> : <RefreshCw size={10}/>}
                        Sinkron HPP
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex justify-between font-bold text-white border-y border-zinc-800 py-2"><span>Laba Kotor (Gross Profit)</span><span>{formatRupiah(data.labaKotor,true)}</span></div>

                {/* Fee Platform */}
                <div className="pt-2">
                  <div className="flex justify-between">
                    <span className="font-semibold text-zinc-200">Biaya Penjualan (Fee Platform)</span>
                    <span className="text-red-400">({formatRupiah(data.feePlatform,true)})</span>
                  </div>
                  <p className="text-[11px] text-zinc-600 mt-0.5 flex items-center gap-1"><Info size={10}/>SUM platformFee + amsFee + platformFeeOther dari tabel Payout per tanggal cair</p>
                  {data.feePlatformDetail && (
                    <div className="mt-2 space-y-1 pl-4">
                      {data.feePlatformDetail.feeShopee > 0 && <div className="flex justify-between text-xs text-zinc-400"><span>- Fee Shopee (komisi)</span><span>{formatRupiah(data.feePlatformDetail.feeShopee,true)}</span></div>}
                      {data.feePlatformDetail.feeTikTok > 0 && <div className="flex justify-between text-xs text-zinc-400"><span>- Fee TikTok (komisi)</span><span>{formatRupiah(data.feePlatformDetail.feeTikTok,true)}</span></div>}
                      {data.feePlatformDetail.feeAms > 0 && <div className="flex justify-between text-xs text-zinc-400"><span>- Fee AMS (iklan)</span><span>{formatRupiah(data.feePlatformDetail.feeAms,true)}</span></div>}
                      {data.feePlatformDetail.feeLainnya > 0 && <div className="flex justify-between text-xs text-zinc-400"><span>- Fee Lainnya</span><span>{formatRupiah(data.feePlatformDetail.feeLainnya,true)}</span></div>}
                    </div>
                  )}
                </div>

                {/* Beban Operasional */}
                <div className="pb-2">
                  <div className="flex justify-between font-semibold text-zinc-200"><span>Beban Operasional</span><span className="text-red-400">({formatRupiah(data.bebanOperasional,true)})</span></div>
                  {(data.expenseGroups||[]).map((g:any)=>(
                    <div key={g.group} className="flex justify-between pl-8 text-zinc-400 text-xs mt-1"><span>- {g.group}</span><span>{formatRupiah(g.amount,true)}</span></div>
                  ))}
                </div>

                <div className="flex justify-between pt-4 border-t border-zinc-800 font-bold text-lg text-blue-400"><span>Laba Bersih Operasional</span><span>{formatRupiah(data.labaBersihOperasional,true)}</span></div>
                <div className="flex justify-between text-zinc-300 pt-2"><span>Pendapatan / Beban Lain-lain</span><span className={data.otherIncome>=0?'text-emerald-400':'text-red-400'}>{data.otherIncome<0?`(${formatRupiah(Math.abs(data.otherIncome),true)})`:formatRupiah(data.otherIncome,true)}</span></div>
                <div className="flex justify-between py-3 border-y-2 border-zinc-700 font-bold text-xl text-white"><span>Laba Bersih (Net Profit)</span><span className={data.labaBersih>=0?'text-emerald-500':'text-red-500'}>{formatRupiah(data.labaBersih)}</span></div>

                {(data.bebanKerugianTikTok??0)>0 && (
                  <div className="mt-6 rounded-lg border border-amber-800/40 bg-amber-900/10 p-4">
                    <p className="text-xs font-semibold text-amber-400 mb-2 uppercase">ℹ️ Beban Kerugian TikTok</p>
                    <div className="flex justify-between text-sm text-amber-200/80"><span>Total order negatif TikTok</span><span className="font-semibold">{formatRupiah(data.bebanKerugianTikTok)}</span></div>
                  </div>
                )}
              </div>
            </div>
          )}

          {reportType==='cashflow' && data && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <h2 className="text-lg font-bold text-white mb-6 text-center">Laporan Arus Kas<br/><span className="text-sm text-zinc-400 font-normal">{dateFrom} s/d {dateTo}</span></h2>
              <div className="space-y-4 max-w-3xl mx-auto text-sm">
                <div className="font-semibold text-base text-zinc-200 border-b border-zinc-800 pb-2">Aktivitas Operasi</div>
                <div className="flex justify-between pl-4 text-zinc-300"><span>Arus Kas Masuk</span><span className="text-emerald-400">{formatRupiah(data.arusKasOperasiMasuk,true)}</span></div>
                <div className="flex justify-between pl-4 text-zinc-300"><span>Arus Kas Keluar</span><span className="text-red-400">({formatRupiah(data.arusKasOperasiKeluar,true)})</span></div>
                <div className="flex justify-between font-bold text-zinc-100 pl-4 py-2 border-b border-zinc-800"><span>Net Operasi</span><span>{formatRupiah(data.netOperasi,true)}</span></div>
                <div className="font-semibold text-base text-zinc-200 pt-4 border-b border-zinc-800 pb-2">Aktivitas Investasi</div>
                <div className="flex justify-between pl-4 text-zinc-300"><span>Pembelian Aset Tetap</span><span className="text-red-400">({formatRupiah(data.pembelianAsetTetap,true)})</span></div>
                <div className="flex justify-between font-bold text-zinc-100 pl-4 py-2 border-b border-zinc-800"><span>Net Investasi</span><span>{formatRupiah(data.netInvestasi,true)}</span></div>
                <div className="font-semibold text-base text-zinc-200 pt-4 border-b border-zinc-800 pb-2">Aktivitas Pendanaan</div>
                <div className="flex justify-between pl-4 text-zinc-300"><span>Suntikan Modal</span><span className="text-emerald-400">{formatRupiah(data.suntikanModal,true)}</span></div>
                <div className="flex justify-between pl-4 text-zinc-300"><span>Prive</span><span className="text-red-400">({formatRupiah(data.prive,true)})</span></div>
                <div className="flex justify-between font-bold text-zinc-100 pl-4 py-2 border-b border-zinc-800"><span>Net Pendanaan</span><span>{formatRupiah(data.netPendanaan,true)}</span></div>
                <div className="flex justify-between py-3 border-y-2 border-zinc-700 font-bold text-xl text-blue-400 mt-6"><span>Kenaikan (Penurunan) Kas Bersih</span><span>{formatRupiah(data.kenaikanKasBersih,true)}</span></div>
              </div>
            </div>
          )}

          {reportType==='balance-sheet' && data && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <h2 className="text-lg font-bold text-white mb-6 text-center">Neraca (Balance Sheet)<br/><span className="text-sm text-zinc-400 font-normal">Per {formatDate(data.asOf)}</span></h2>
              <div className="grid lg:grid-cols-2 gap-8 text-sm">
                <div>
                  <h3 className="font-bold text-base text-white border-b-2 border-zinc-700 pb-2 mb-3">ASET</h3>
                  <div className="font-semibold text-emerald-400 mb-2">Aset Lancar</div>
                  <div className="flex justify-between text-zinc-300 pl-2"><span>Kas & Bank</span><span>{formatRupiah(data.aset.lancar.totalKasBank,true)}</span></div>
                  {(data.aset.lancar.kas||[]).map((k:any)=>(<div key={k.walletId} className="flex justify-between pl-6 text-xs text-zinc-500"><span>- {k.name}</span><span>{formatRupiah(k.saldo,true)}</span></div>))}
                  <div className="flex justify-between text-zinc-300 pl-2 mt-1"><span>Piutang Usaha</span><span>{formatRupiah(data.aset.lancar.piutangUsaha,true)}</span></div>
                  <div className="flex justify-between text-zinc-300 pl-2 mt-1"><span>Persediaan Barang</span><span>{formatRupiah(data.aset.lancar.nilaiStok,true)}</span></div>
                  <div className="flex justify-between font-semibold text-zinc-200 mt-2 border-t border-zinc-800 pt-2 mb-4"><span>Total Aset Lancar</span><span>{formatRupiah(data.aset.lancar.total,true)}</span></div>
                  <div className="font-semibold text-blue-400 mb-2">Aset Tetap</div>
                  {(data.aset.tetap.items||[]).map((a:any)=>(<div key={a.id} className="flex justify-between text-zinc-300 pl-2 text-xs mb-1"><span>{a.namaAset}</span><span>{formatRupiah(a.nilaiBuku,true)}</span></div>))}
                  <div className="flex justify-between font-semibold text-zinc-200 mt-2 border-t border-zinc-800 pt-2 mb-4"><span>Total Aset Tetap</span><span>{formatRupiah(data.aset.tetap.total,true)}</span></div>
                  <div className="flex justify-between font-bold text-lg text-emerald-400 mt-6 border-t-2 border-emerald-900 pt-3"><span>TOTAL ASET</span><span>{formatRupiah(data.aset.total,true)}</span></div>
                </div>
                <div>
                  <h3 className="font-bold text-base text-white border-b-2 border-zinc-700 pb-2 mb-3">LIABILITAS & KEWAJIBAN</h3>
                  <div className="flex justify-between text-zinc-300 pl-2"><span>Utang Usaha (Vendor)</span><span>{formatRupiah(data.liabilitas.utangVendor,true)}</span></div>
                  <div className="flex justify-between text-zinc-300 pl-2 mt-1"><span>Utang Pinjaman Pokok</span><span>{formatRupiah(data.liabilitas.utangPinjaman,true)}</span></div>
                  <div className="flex justify-between font-semibold text-zinc-200 mt-2 border-t border-zinc-800 pt-2 mb-8"><span>Total Liabilitas</span><span>{formatRupiah(data.liabilitas.total,true)}</span></div>
                  <h3 className="font-bold text-base text-white border-b-2 border-zinc-700 pb-2 mb-3">EKUITAS</h3>
                  <div className="flex justify-between text-zinc-300 pl-2"><span>Modal Disetor</span><span>{formatRupiah(data.ekuitas.modalDisetor,true)}</span></div>
                  <div className="flex justify-between text-red-300 pl-2 mt-1"><span>Prive</span><span>({formatRupiah(Math.abs(data.ekuitas.prive),true)})</span></div>
                  <div className="flex justify-between text-zinc-300 pl-2 mt-1"><span>Laba Ditahan & Berjalan</span><span>{formatRupiah(data.ekuitas.labaDitahanDanBerjalan,true)}</span></div>
                  <div className="flex justify-between font-semibold text-zinc-200 mt-2 border-t border-zinc-800 pt-2 mb-4"><span>Total Ekuitas</span><span>{formatRupiah(data.ekuitas.total,true)}</span></div>
                  <div className="flex justify-between font-bold text-lg text-emerald-400 mt-6 border-t-2 border-emerald-900 pt-3"><span>TOTAL LIABILITAS & EKUITAS</span><span>{formatRupiah(data.totalLiabPlusEkuitas,true)}</span></div>
                </div>
              </div>
              <div className={`mt-8 text-center py-3 rounded-lg font-bold border ${data.isBalance?'bg-emerald-900/20 border-emerald-500/30 text-emerald-400':'bg-red-900/20 border-red-500/30 text-red-400'}`}>
                {data.isBalance?'SEIMBANG (BALANCED)':`TIDAK SEIMBANG! Selisih: ${formatRupiah(Math.abs(data.selisih),true)}`}
              </div>
            </div>
          )}
        </>
      )}
    </>
  )
}
