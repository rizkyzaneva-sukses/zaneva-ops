'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useState, useRef, useEffect } from 'react'
import { useToast } from '@/components/ui/toaster'
import { ScanLine, CheckCircle, XCircle, Upload, Download, Camera, Keyboard, Zap, ZapOff } from 'lucide-react'

function nowWIB(): string {
  return new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }) + ' WIB'
}

type ScanStatusType = 'success' | 'duplicate' | 'error'

interface ScanResult {
  success: boolean
  statusType?: ScanStatusType
  orderNo?: string
  airwaybill?: string
  status?: string
  receiverName?: string
  productName?: string
  items?: { sku: string; qty: number; productName: string }[]
  updatedCount?: number
  error?: string
  scannedAt?: string
  scannedBy?: string
}

function beep(type: ScanStatusType) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    let times = 1; let freq = 880;
    if (type === 'duplicate') { times = 2; freq = 440; }
    if (type === 'error') { times = 3; freq = 220; }
    
    for (let i = 0; i < times; i++) {
      setTimeout(() => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0.3, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2)
        osc.start(); osc.stop(ctx.currentTime + 0.2)
      }, i * 250)
    }
  } catch {}
}

function getKresekInfo(items: { sku: string; qty: number; productName: string }[] = []) {
  if (items.length === 0) return null

  let kresekQty = 0

  items.forEach(item => {
    const name = (item.productName || '').toLowerCase()
    const sku = (item.sku || '').toLowerCase()
    if (!name.includes('miki hat') && !name.includes('peci uas') && !sku.includes('miki hat') && !sku.includes('peci uas')) {
      kresekQty += item.qty
    }
  })

  let kresekName = '⚪ Putih/Hitam'
  if (kresekQty <= 1) kresekName = '🟡 Silver'
  else if (kresekQty === 2) kresekName = '🟡 Kuning'

  return { totalQty: kresekQty, kresekName }
}

function OrderItemsInfo({ items, receiverName }: { items?: {sku: string, qty: number, productName: string}[], receiverName?: string }) {
  if (!items || items.length === 0) return null;
  const kresek = getKresekInfo(items);
  
  return (
    <div className="mt-3 bg-black/20 p-3 rounded-xl border border-white/5 text-left w-full sm:max-w-sm">
       <div className="font-semibold text-zinc-100 text-base mb-2">{receiverName}</div>
       <table className="w-full text-sm text-zinc-300 border border-zinc-700/50 rounded-lg overflow-hidden mb-3">
         <thead className="bg-zinc-800/70 text-xs">
           <tr>
             <th className="px-3 py-1.5 text-left font-medium">SKU</th>
             <th className="px-3 py-1.5 text-right font-medium w-16">QTY</th>
           </tr>
         </thead>
         <tbody className="divide-y divide-zinc-800/50">
            {items.map((it, i) => (
              <tr key={i} className="hover:bg-zinc-800/40">
                <td className="px-3 py-1.5 font-mono text-[11px] truncate max-w-[180px]" title={it.productName}>{it.sku || '-'}</td>
                <td className="px-3 py-1.5 text-right font-bold text-white">{it.qty}</td>
              </tr>
            ))}
         </tbody>
       </table>
       {kresek && (
         <div className="text-sm bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-700/50 shadow-inner">
           <div className="flex justify-between mb-1 items-center">
             <span className="text-zinc-400 text-xs font-medium">Total QTY</span>
             <span className="font-bold text-zinc-200 text-base bg-black/40 px-2 rounded">{kresek.totalQty}</span>
           </div>
           <div className="flex justify-between items-center">
             <span className="text-zinc-400 text-xs font-medium">Kresek</span>
             <span className="font-semibold tracking-wide drop-shadow-sm">{kresek.kresekName}</span>
           </div>
         </div>
       )}
    </div>
  )
}


export default function ScanOrderPage() {
  const { toast } = useToast()
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [lastResult, setLastResult] = useState<ScanResult | null>(null)
  const [scanHistory, setScanHistory] = useState<ScanResult[]>([])
  
  const [uploadLoading, setUploadLoading] = useState(false)
  const [bulkResult, setBulkResult] = useState<{ success: number, duplicate: number, notFound: string[] } | null>(null)
  
  const [cameraMode, setCameraMode] = useState(false)
  const [cameraOverlay, setCameraOverlay] = useState<ScanStatusType | null>(null)
  const [dailyScanCount, setDailyScanCount] = useState(0)
  const [flashEnabled, setFlashEnabled] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const lockRef = useRef(false)
  const html5QrCode = useRef<any>(null)

  useEffect(() => {
    if (!cameraMode) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [cameraMode])

  useEffect(() => {
    if (!cameraMode && lastResult && (lastResult.statusType === 'success' || lastResult.statusType === 'error')) {
      const timer = setTimeout(() => {
        setLastResult(null)
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [lastResult, cameraMode])

  useEffect(() => {
    if (cameraMode) {
      startCamera()
    } else {
      stopCamera()
    }
    return () => { stopCamera() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraMode])

  const startCamera = async () => {
    if (typeof window !== 'undefined') {
      try {
        const { Html5Qrcode } = require('html5-qrcode')
        html5QrCode.current = new Html5Qrcode("reader")
        await html5QrCode.current.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 150 } },
          (decodedText: string) => {
            if (!lockRef.current) handleScan(decodedText, false)
          },
          () => {}
        )
      } catch (err) {
        console.error("Failed to start camera", err)
      }
    }
  }

  const stopCamera = () => {
    if (html5QrCode.current) {
      try {
        if (html5QrCode.current.isScanning) {
          html5QrCode.current.stop().then(() => {
            try { html5QrCode.current.clear() } catch {}
          }).catch(() => {})
        } else {
          try { html5QrCode.current.clear() } catch {}
        }
      } catch (err) {
        // Abaikan string error dari library html5qrcode yang berpotensi crash React transitions
        console.warn('html5qrcode cleanup warning', err)
      }
    }
  }

  const toggleFlash = async () => {
    if (!html5QrCode.current || !html5QrCode.current.isScanning) return
    try {
      const track = html5QrCode.current.getRunningTrackCameraCapabilities()
      if (track && 'torch' in track) {
        await html5QrCode.current.applyVideoConstraints({
          advanced: [{ torch: !flashEnabled }]
        })
        setFlashEnabled(!flashEnabled)
      } else {
        toast({ title: 'Flash tidak didukung', description: 'Perangkat ini tidak mendukung fitur flash pada browser.', type: 'error' })
      }
    } catch {
      toast({ title: 'Gagal', description: 'Gagal menyalakan flash', type: 'error' })
    }
  }

  const handleScan = async (awb: string, isKetikMode: boolean) => {
    if (!awb.trim() || lockRef.current) return
    lockRef.current = true
    setLoading(true)

    try {
      const getRes = await fetch(`/api/scan/order?airwaybill=${awb.trim()}`)
      const getJson = await getRes.json()

      if (!getJson.data) {
        beep('error')
        const resInfo: ScanResult = { success: false, airwaybill: awb, statusType: 'error', error: 'Tidak Ditemukan', scannedAt: nowWIB() }
        setLastResult(resInfo)
        setScanHistory(prev => [resInfo, ...prev].slice(0, 20))
        if (!isKetikMode) {
          setCameraOverlay('error')
        } else {
          setTimeout(() => { lockRef.current = false; inputRef.current?.focus() }, 1500)
        }
      } else if (getJson.data.found) {
        beep('duplicate')
        const resInfo: ScanResult = { 
          success: true, 
          airwaybill: awb, 
          orderNo: getJson.data.orderNo,
          receiverName: getJson.data.receiverName,
          statusType: 'duplicate',
          scannedAt: getJson.data.scannedAt,
          scannedBy: getJson.data.scannedBy
        }
        setLastResult(resInfo)
        setScanHistory(prev => [resInfo, ...prev].slice(0, 20))
        if (!isKetikMode) {
          setCameraOverlay('duplicate')
        } else {
          setTimeout(() => { lockRef.current = false; inputRef.current?.focus() }, 1500)
        }
      } else {
        await executePost(awb, isKetikMode)
      }
    } catch {
      beep('error')
      lockRef.current = false
    } finally {
      setLoading(false)
      setInput('')
    }
  }

  const executePost = async (awb: string, isKetikMode: boolean) => {
    const res = await fetch('/api/scan/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ airwaybill: awb.trim() }),
    })
    const json = await res.json()
    if (res.ok) {
      beep('success')
      const result: ScanResult = { success: true, statusType: 'success', ...json.data, scannedAt: nowWIB() }
      setLastResult(result)
      setScanHistory(prev => [result, ...prev].slice(0, 20))
      setDailyScanCount(c => c + 1)
      
      if (!isKetikMode) {
        setCameraOverlay('success')
        setTimeout(() => {
          setCameraOverlay(null)
          lockRef.current = false
        }, 2000)
      } else {
        setTimeout(() => {
          lockRef.current = false
          inputRef.current?.focus()
        }, 1500)
      }
    } else {
      beep('error')
      const result: ScanResult = { success: false, statusType: 'error', error: json.error, airwaybill: awb, scannedAt: nowWIB() }
      setLastResult(result)
      if (!isKetikMode) {
        setCameraOverlay('error')
      } else {
        setTimeout(() => { lockRef.current = false; inputRef.current?.focus() }, 1500)
      }
    }
  }

  const processDuplicate = () => {
    if (!lastResult?.airwaybill) return
    setCameraOverlay(null)
    executePost(lastResult.airwaybill, !cameraMode)
  }

  const closeOverlay = () => {
    setCameraOverlay(null)
    lockRef.current = false
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleScan(input, true)
  }

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadLoading(true)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/scan/bulk', { method: 'POST', body: formData })
      const json = await res.json()
      if (res.ok) {
        setBulkResult({
           success: json.data.success,
           duplicate: json.data.duplicateSkipped,
           notFound: json.data.notFound
        })
        toast({ title: 'Upload berhasil!', description: `${json.data.success} resi diproses.` })
      } else {
        toast({ title: 'Upload gagal', description: json.error, type: 'error' })
      }
    } catch {
      toast({ title: 'Error', description: 'Gagal menghubungi server', type: 'error' })
    } finally {
      setUploadLoading(false)
      if (e.target) e.target.value = ''
    }
  }

  const downloadTemplate = () => {
    const csvContent = "No. Resi,Tanggal\n"
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.setAttribute("download", "template_scan_resi.csv")
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto pb-10">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2 text-white">
              <ScanLine size={24} className="text-emerald-400" />
              Scan Resi Kirim
            </h1>
            <p className="text-sm text-zinc-400 mt-1">Ter-scan hari ini: {dailyScanCount} | Riwayat: {scanHistory.length}</p>
          </div>
          
          <div className="bg-zinc-800/80 p-1.5 rounded-xl flex border border-zinc-700/50 backdrop-blur-md">
             <button 
                onClick={() => setCameraMode(false)}
                className={`py-2 px-4 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ${!cameraMode ? 'bg-zinc-700 text-white shadow-md' : 'text-zinc-400 hover:text-white hover:bg-zinc-700/50'}`}
             >
                <Keyboard size={18}/> Ketik
             </button>
             <button 
                onClick={() => setCameraMode(true)}
                className={`py-2 px-4 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ${cameraMode ? 'bg-zinc-700 text-white shadow-md' : 'text-zinc-400 hover:text-white hover:bg-zinc-700/50'}`}
             >
                <Camera size={18}/> Kamera
             </button>
          </div>
        </div>

        {cameraMode && (
          <div className="relative overflow-hidden w-full bg-black rounded-3xl mb-6 shadow-2xl border border-zinc-800" style={{ height: '480px' }}>
             <div id="reader" className="w-full h-full object-cover"></div>
             {!cameraOverlay && (
                <>
                   <div className="absolute inset-0 pointer-events-none border-[40px] border-black/40"></div>
                   <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 border-2 border-emerald-500 rounded-2xl pointer-events-none shadow-[0_0_0_4000px_rgba(0,0,0,0.3)]">
                     <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg"></div>
                     <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg"></div>
                     <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg"></div>
                     <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br-lg"></div>
                     <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-emerald-500/50 -translate-y-1/2 shadow-[0_0_8px_2px_rgba(16,185,129,0.4)] animate-pulse"></div>
                   </div>
                   <div className="absolute top-4 left-4 bg-black/60 px-4 py-2 rounded-full text-white text-xs backdrop-blur-md font-medium border border-white/10 flex items-center gap-2">
                    <CheckCircle size={14} className="text-emerald-400"/> {dailyScanCount} resi ter-scan
                   </div>
                   <button onClick={toggleFlash} className="absolute top-4 right-4 bg-black/60 p-2.5 rounded-full text-white backdrop-blur-md border border-white/10 hover:bg-zinc-800 transition-colors">
                     {flashEnabled ? <Zap size={18} className="text-yellow-400 fill-yellow-400" /> : <ZapOff size={18} />}
                   </button>
                   <button onClick={() => setCameraMode(false)} className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-red-600/90 hover:bg-red-500 text-white font-bold px-6 py-3 rounded-2xl backdrop-blur-md shadow-xl transition-all border border-red-500/50">
                     Tutup Kamera
                   </button>
                </>
             )}

             {cameraOverlay === 'success' && (() => {
               const kInfo = lastResult ? getKresekInfo(lastResult.items) : null;
               const isSilver = kInfo?.kresekName.includes('Silver');
               const isKuning = kInfo?.kresekName.includes('Kuning');
               const bgClass = isSilver ? 'bg-zinc-600/95' : isKuning ? 'bg-amber-600/95' : kInfo ? 'bg-slate-700/95' : 'bg-emerald-600/95';
               const shadowClass = isSilver ? 'shadow-zinc-900/50' : isKuning ? 'shadow-amber-900/50' : kInfo ? 'shadow-slate-900/50' : 'shadow-emerald-900/50';
               return (
                <div className={`absolute inset-0 flex flex-col items-center justify-center text-white z-10 transition-all text-center p-6 backdrop-blur-md animate-in fade-in duration-200 ${bgClass}`}>
                   <div className={`rounded-full bg-white/20 p-5 mb-5 shadow-lg ${shadowClass}`}>
                     <CheckCircle size={56} className="text-white"/>
                   </div>
                   <div className="text-4xl font-black tracking-tight mb-3 drop-shadow-md">TERKIRIM</div>
                   <div className="text-2xl font-mono bg-black/20 px-5 py-2.5 rounded-xl mb-3 shadow-inner">{lastResult?.orderNo}</div>
                   <OrderItemsInfo items={lastResult?.items} receiverName={lastResult?.receiverName} />
                </div>
               );
             })()}

             {cameraOverlay === 'duplicate' && (
                <div className="absolute inset-0 bg-amber-500/95 flex flex-col items-center justify-center text-black z-10 p-6 text-center backdrop-blur-md animate-in fade-in duration-200">
                   <div className="rounded-full bg-black/10 p-5 mb-5 shadow-lg shadow-amber-900/20">
                     <ScanLine size={56} className="text-black"/>
                   </div>
                   <div className="font-black text-3xl mb-3 drop-shadow-sm">⚠ Sudah Di-scan</div>
                   <p className="text-lg mb-8 max-w-sm font-medium drop-shadow-sm">Resi ini sudah di-scan pada <br/><span className="font-bold text-xl bg-black/10 px-2 py-0.5 rounded inline-block mt-2">{lastResult?.scannedAt}</span><br/><span className="mt-2 inline-block">oleh <span className="font-bold">{lastResult?.scannedBy}</span></span></p>
                   <div className="flex gap-4 w-full max-w-sm">
                       <button onClick={closeOverlay} className="flex-1 bg-black/10 hover:bg-black/20 text-black font-bold py-3.5 rounded-xl transition-all border border-black/20">Lewati</button>
                       <button onClick={processDuplicate} className="flex-1 bg-black hover:bg-zinc-900 text-amber-400 font-bold py-3.5 rounded-xl transition-all shadow-xl">Proses Lagi</button>
                   </div>
                </div>
             )}

             {cameraOverlay === 'error' && (
                <div className="absolute inset-0 bg-red-600/95 flex flex-col items-center justify-center text-white z-10 p-6 text-center backdrop-blur-md animate-in fade-in duration-200">
                   <div className="rounded-full bg-black/20 p-5 mb-5 shadow-lg shadow-red-900/30">
                     <XCircle size={56} className="text-white"/>
                   </div>
                   <div className="font-black text-3xl mb-3 drop-shadow-md">✗ Tidak Ditemukan</div>
                   <div className="text-2xl font-mono bg-black/20 px-5 py-2.5 rounded-xl mb-6 shadow-inner">{lastResult?.airwaybill}</div>
                   <p className="text-lg font-medium mb-8 max-w-xs drop-shadow-sm">Pastikan resi sudah diinput ke sistem atau periksa nomornya.</p>
                   <button onClick={closeOverlay} className="w-full max-w-sm bg-white text-red-600 hover:bg-red-50 hover:scale-[1.02] active:scale-[0.98] font-bold py-4 rounded-xl transition-all shadow-xl border-2 border-white/50">OK, Mengerti</button>
                </div>
             )}
          </div>
        )}

        {!cameraMode && (
          <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-3xl p-6 mb-6 shadow-lg backdrop-blur-xl">
            <div className="flex flex-col sm:flex-row gap-4 items-center mb-6 pb-6 border-b border-zinc-800">
               <div className="w-full flex-1 flex gap-3">
                 <input type="file" accept=".csv" className="hidden" id="csv-upload" onChange={handleBulkUpload} />
                 <label htmlFor="csv-upload" className="bg-zinc-800 hover:bg-zinc-700 text-zinc-100 px-5 py-3 rounded-xl text-sm font-semibold cursor-pointer flex items-center justify-center gap-2 flex-1 sm:flex-none transition-all shadow-md border border-zinc-700/50">
                   {uploadLoading ? 'Memproses...' : <><Upload size={18} /> Upload CSV</>}
                 </label>
                 <button type="button" onClick={downloadTemplate} className="bg-transparent hover:bg-zinc-800 text-zinc-400 hover:text-white px-5 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all border border-zinc-800 hover:border-zinc-700">
                   <Download size={18} /> Template
                 </button>
               </div>
            </div>
            
            <form onSubmit={handleSubmit} className="flex gap-4">
               <div className="relative flex-1">
                <ScanLine size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="Ketik atau scan barcode no. resi ..."
                  disabled={loading}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-12 pr-4 py-4 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 text-base transition-all shadow-inner"
                  autoComplete="off"
                />
               </div>
               <button
                type="submit"
                disabled={loading || !input.trim()}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:hover:bg-emerald-600 text-white rounded-xl px-8 py-4 text-base font-bold transition-all shadow-lg hover:shadow-emerald-900/20"
               >
                {loading ? '...' : 'Scan'}
               </button>
            </form>
          </div>
        )}

        {bulkResult && (
           <div className="bg-zinc-900/90 border border-emerald-900/50 rounded-3xl p-6 mb-6 shadow-xl backdrop-blur-md animate-in slide-in-from-bottom-4 duration-300">
              <h3 className="text-emerald-400 font-bold text-lg mb-4 flex items-center gap-2"><CheckCircle size={22}/> Ringkasan Upload CSV</h3>
              <div className="flex gap-4 mb-5">
                 <div className="bg-zinc-950 px-5 py-4 rounded-2xl flex-1 border border-zinc-800 shadow-inner">
                    <div className="text-sm font-medium text-zinc-400 mb-1">Berhasil</div>
                    <div className="text-3xl font-black text-emerald-400">{bulkResult.success}</div>
                 </div>
                 <div className="bg-zinc-950 px-5 py-4 rounded-2xl flex-1 border border-zinc-800 shadow-inner">
                    <div className="text-sm font-medium text-zinc-400 mb-1">Duplikat Dilewati</div>
                    <div className="text-3xl font-black text-amber-500">{bulkResult.duplicate}</div>
                 </div>
              </div>
              {bulkResult.notFound.length > 0 && (
                 <div className="mt-2">
                    <div className="text-sm font-bold text-red-400 mb-3 flex items-center gap-2"><XCircle size={16}/> Tidak ditemukan ({bulkResult.notFound.length})</div>
                    <div className="bg-red-950/20 border border-red-900/30 p-4 rounded-xl text-sm text-zinc-300 font-mono flex flex-wrap gap-2 max-h-40 overflow-y-auto custom-scrollbar">
                       {bulkResult.notFound.map((awb, i) => <span key={i} className="bg-black/60 px-2.5 py-1.5 rounded-lg border border-red-900/30">{awb}</span>)}
                    </div>
                 </div>
              )}
              <button className="mt-5 w-full bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-3 rounded-xl transition-all" onClick={() => setBulkResult(null)}>Tutup Ringkasan</button>
           </div>
        )}

        {!cameraMode && lastResult && !uploadLoading && !bulkResult && (() => {
          const kInfo = lastResult.statusType === 'success' ? getKresekInfo(lastResult.items) : null;
          const isSilver = kInfo?.kresekName.includes('Silver');
          const isKuning = kInfo?.kresekName.includes('Kuning');
          const isPutih = kInfo && !isSilver && !isKuning;
          
          let cardBg = lastResult.statusType === 'success' ? (isSilver ? 'bg-zinc-800/80 border-zinc-500/50' : isKuning ? 'bg-amber-950/40 border-amber-600/50' : isPutih ? 'bg-slate-800/80 border-slate-400/50' : 'bg-emerald-950/40 border-emerald-800/50') : lastResult.statusType === 'duplicate' ? 'bg-amber-950/40 border-amber-800/50' : 'bg-red-950/40 border-red-800/50';

          let iconBg = lastResult.statusType === 'success' ? (isSilver ? 'bg-zinc-700/50' : isKuning ? 'bg-amber-900/50' : isPutih ? 'bg-slate-700/50' : 'bg-emerald-900/50') : lastResult.statusType === 'duplicate' ? 'bg-amber-900/50' : 'bg-red-900/50';

          let iconColor = lastResult.statusType === 'success' ? (isSilver ? 'text-zinc-300' : isKuning ? 'text-amber-400' : isPutih ? 'text-slate-200' : 'text-emerald-400') : lastResult.statusType === 'duplicate' ? 'text-amber-400' : 'text-red-400';

          let textColor = lastResult.statusType === 'success' ? (isSilver ? 'text-zinc-200' : isKuning ? 'text-amber-300' : isPutih ? 'text-slate-100' : 'text-emerald-300') : '';

          let badgeColor = isSilver ? 'text-zinc-300 bg-zinc-800' : isKuning ? 'text-amber-400 bg-amber-950' : isPutih ? 'text-slate-200 bg-slate-800' : 'text-emerald-400 bg-emerald-950';

          return (
          <div className={`rounded-3xl p-6 mb-6 border transition-all shadow-xl animate-in fade-in duration-200 ${cardBg}`}>
            <div className="flex items-start gap-5">
              <div className={`p-3 rounded-2xl ${iconBg}`}>
                {lastResult.statusType === 'success'
                  ? <CheckCircle size={32} className={iconColor} />
                  : lastResult.statusType === 'duplicate'
                  ? <ScanLine size={32} className={iconColor} />
                  : <XCircle size={32} className={iconColor} />
                }
              </div>
              <div className="flex-1 mt-1">
                {lastResult.statusType === 'success' ? (
                  <>
                    <p className={`font-bold text-xl ${textColor}`}>Berhasil!</p>
                    <p className="text-base text-zinc-300 mt-1.5 flex items-center gap-2 flex-wrap">
                      Order <span className="text-white font-mono bg-black/30 px-2 py-0.5 rounded-md font-medium border border-white/5">{lastResult.orderNo}</span> → <span className={`font-bold px-2 py-0.5 rounded-md ${badgeColor}`}>TERKIRIM</span>
                    </p>
                    <OrderItemsInfo items={lastResult.items} receiverName={lastResult.receiverName} />
                  </>
                ) : lastResult.statusType === 'duplicate' ? (
                  <>
                    <p className="font-bold text-amber-400 text-xl">Sudah Di-scan</p>
                    <p className="text-base text-zinc-300 mt-2 leading-relaxed">Resi <span className="font-mono text-white font-medium bg-black/20 px-1.5 py-0.5 rounded">{lastResult.airwaybill}</span> sudah di-scan pada <span className="text-amber-300 font-medium">{lastResult.scannedAt}</span> oleh <span className="font-semibold text-amber-300">{lastResult.scannedBy}</span></p>
                    <div className="mt-4">
                       <button onClick={processDuplicate} className="text-sm bg-amber-600 hover:bg-amber-500 text-white font-semibold px-5 py-2.5 rounded-xl transition-all shadow-lg hover:shadow-amber-900/20 active:scale-95">Proses Lagi (Update DB)</button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="font-bold text-red-400 text-xl">Tidak Ditemukan</p>
                    <p className="text-base text-zinc-300 mt-1.5">{lastResult.error}</p>
                    <div className="mt-3">
                       <span className="text-sm font-mono font-medium text-red-200 bg-red-950/50 px-3 py-1.5 rounded-lg border border-red-900/50 shadow-inner">{lastResult.airwaybill}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          );
        })()}

        {scanHistory.length > 0 && (
          <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-3xl overflow-hidden shadow-lg backdrop-blur-md">
            <div className="px-6 py-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-950/30">
              <p className="text-sm font-bold text-zinc-300 uppercase tracking-wide">Riwayat Scan Terbaru</p>
              <div className="bg-zinc-800 px-3 py-1 rounded-full text-xs font-medium text-zinc-400 border border-zinc-700">{scanHistory.length} Total</div>
            </div>
            <div className="divide-y divide-zinc-800/60 max-h-[400px] overflow-y-auto custom-scrollbar">
              {scanHistory.map((r, i) => (
                <div key={i} className="flex items-center gap-4 px-6 py-4 hover:bg-zinc-800/40 transition-colors group">
                  <div className={`p-2 rounded-xl shrink-0 border transition-all ${
                        r.statusType === 'success' ? 'bg-emerald-950/40 border-emerald-900/50 group-hover:bg-emerald-900/50' : 
                        r.statusType === 'duplicate' ? 'bg-amber-950/40 border-amber-900/50 group-hover:bg-amber-900/50' : 
                        'bg-red-950/40 border-red-900/50 group-hover:bg-red-900/50'
                  }`}>
                     {r.statusType === 'success'
                       ? <CheckCircle size={18} className="text-emerald-400" />
                       : r.statusType === 'duplicate'
                       ? <ScanLine size={18} className="text-amber-400" />
                       : <XCircle size={18} className="text-red-400" />
                     }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                       <p className="text-base font-semibold text-zinc-200 font-mono truncate">{r.orderNo || r.airwaybill}</p>
                       <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md uppercase tracking-wider ${
                           r.statusType === 'success' ? 'bg-emerald-950 text-emerald-400 border border-emerald-900/50' : 
                           r.statusType === 'duplicate' ? 'bg-amber-950 text-amber-400 border border-amber-900/50' : 
                           'bg-red-950 text-red-400 border border-red-900/50'
                       }`}>
                           {r.statusType === 'success' ? 'Berhasil' : r.statusType === 'duplicate' ? 'Duplikat' : 'Gagal'}
                       </span>
                    </div>
                    <div className="flex items-center gap-2">
                       {r.scannedAt && <p className="text-xs font-medium text-zinc-500">{r.scannedAt}</p>}
                       {r.receiverName && <><span className="text-zinc-700 text-[10px]">●</span><p className="text-xs text-zinc-400 truncate max-w-[150px] sm:max-w-xs">{r.receiverName}</p></>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
