'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useAuth } from '@/components/providers'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatRupiah } from '@/lib/utils'
import { useState } from 'react'
import {
  Sparkles, RefreshCw, Clock, TrendingUp, AlertTriangle,
  Package, BarChart3, MapPin, Loader2, ChevronDown, ChevronUp,
  Brain, Zap
} from 'lucide-react'

// ── Format tanggal lokal ──
function formatWIB(dateStr: string | Date) {
  return new Date(dateStr).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'long',
    timeStyle: 'short',
  })
}

// ── Render teks AI dengan format markdown sederhana ──
function AIContent({ text }: { text: string }) {
  return (
    <div className="text-sm text-zinc-300 leading-relaxed space-y-3">
      {text.split('\n').map((line, i) => {
        if (!line.trim()) return null
        // Header (##)
        if (line.startsWith('## ')) {
          return (
            <h3 key={i} className="text-base font-semibold text-white mt-4 mb-1 flex items-center gap-1.5">
              {line.replace('## ', '')}
            </h3>
          )
        }
        // Bullet points
        if (line.startsWith('- ') || line.startsWith('• ') || /^\d+\./.test(line.trim())) {
          return (
            <div key={i} className="flex items-start gap-2 pl-2">
              <span className="text-emerald-500 mt-0.5 shrink-0">›</span>
              <span>{line.replace(/^[-•]\s|^\d+\.\s/, '')}</span>
            </div>
          )
        }
        // Bold text (**text**)
        const withBold = line.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>')
        return (
          <p
            key={i}
            dangerouslySetInnerHTML={{ __html: withBold }}
            className="text-zinc-300"
          />
        )
      })}
    </div>
  )
}

// ── Data snapshot card ──
function DataCard({ icon: Icon, label, value, sub, color = 'emerald' }: {
  icon: React.ElementType; label: string; value: string; sub?: string; color?: string
}) {
  const colors: Record<string, string> = {
    emerald: 'text-emerald-400 bg-emerald-900/20 border-emerald-800/40',
    yellow:  'text-yellow-400 bg-yellow-900/20 border-yellow-800/40',
    red:     'text-red-400 bg-red-900/20 border-red-800/40',
    blue:    'text-blue-400 bg-blue-900/20 border-blue-800/40',
  }
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
      <div className="flex items-center gap-2 mb-1">
        <div className={`p-1.5 rounded-lg border ${colors[color]}`}>
          <Icon size={12} />
        </div>
        <p className="text-[10px] text-zinc-500">{label}</p>
      </div>
      <p className="text-sm font-bold text-white truncate">{value}</p>
      {sub && <p className="text-[10px] text-zinc-600 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function AiInsightsPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [showData, setShowData] = useState(false)
  const [showConfirm, setShowConfirm] = useState<'monthly' | 'weekly' | null>(null)

  // Ambil insight terakhir
  const { data: insightRes, isLoading } = useQuery({
    queryKey: ['ai-insights'],
    queryFn: async () => {
      const res = await fetch('/api/ai/insights')
      return res.json().then(d => d.data)
    },
    staleTime: 60_000,
  })

  const insight = insightRes?.insight

  // Generate baru
  const { mutate: generate, isPending: isGenerating } = useMutation({
    mutationFn: async (type: 'monthly' | 'weekly') => {
      const res = await fetch(`/api/ai/insights?type=${type}`, { method: 'POST' })
      let json;
      try {
        json = await res.json()
      } catch (e) {
        const text = await res.text().catch(() => '')
        throw new Error(`Server Error (${res.status}): Terjadi kesalahan sistem. (Response: ${text.slice(0, 50)})`)
      }
      if (!res.ok) throw new Error(json.error || 'Gagal generate')
      return json.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-insights'] })
      setShowConfirm(null)
    },
    onError: (err: any) => {
      alert(err.message)
      setShowConfirm(null)
    },
  })

  if (user?.userRole !== 'OWNER') {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-zinc-600">Fitur ini hanya tersedia untuk Owner.</p>
        </div>
      </AppLayout>
    )
  }

  const snapshot = insight?.dataSnapshot as any

  return (
    <AppLayout>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Brain size={20} className="text-purple-400" />
            AI Business Insights
          </h1>
          <p className="text-zinc-500 text-sm mt-0.5">
            Analisis & rekomendasi dari AI berdasarkan data performa Elyasr
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setShowConfirm('weekly')}
            disabled={isGenerating}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-700 to-cyan-700 hover:from-blue-600 hover:to-cyan-600 disabled:opacity-50 text-white rounded-xl px-4 py-2.5 text-sm font-medium transition-all shadow-lg shadow-blue-900/30"
          >
            {isGenerating && showConfirm === 'weekly'
              ? <><Loader2 size={14} className="animate-spin" /> ...</>
              : <><Sparkles size={14} /> Review Mingguan</>
            }
          </button>
          <button
            onClick={() => setShowConfirm('monthly')}
            disabled={isGenerating}
            className="flex items-center gap-2 bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-600 hover:to-indigo-600 disabled:opacity-50 text-white rounded-xl px-4 py-2.5 text-sm font-medium transition-all shadow-lg shadow-purple-900/30"
          >
            {isGenerating && showConfirm === 'monthly'
              ? <><Loader2 size={14} className="animate-spin" /> ...</>
              : <><Sparkles size={14} /> Review Bulanan</>
            }
          </button>
        </div>
      </div>

      {/* Confirm dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-purple-900/30 border border-purple-800/50">
                <Zap size={16} className="text-purple-400" />
              </div>
              <h3 className="text-base font-semibold text-white">Generate Review {showConfirm === 'weekly' ? 'Mingguan' : 'Bulanan'}?</h3>
            </div>
            <p className="text-sm text-zinc-400 mb-4">
              Ini akan menggunakan SumoPod API untuk menganalisis data {showConfirm === 'weekly' ? 'minggu ini' : '30 hari terakhir'}.
              Proses memakan waktu ~5-10 detik.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowConfirm(null)}
                className="flex-1 py-2 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 text-sm transition-colors"
              >
                Batal
              </button>
              <button
                onClick={() => generate(showConfirm)}
                disabled={isGenerating}
                className="flex-1 py-2 rounded-lg bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                {isGenerating ? <Loader2 size={14} className="animate-spin" /> : null}
                {isGenerating ? 'Memproses...' : 'Ya, Analisis'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center h-48 gap-3 text-zinc-600">
          <Loader2 size={18} className="animate-spin" />
          <span>Memuat insights...</span>
        </div>
      )}

      {/* Belum ada insights */}
      {!isLoading && !insight && (
        <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-purple-900/20 border border-purple-800/40 flex items-center justify-center">
            <Brain size={28} className="text-purple-400 opacity-60" />
          </div>
          <div>
            <p className="text-zinc-300 font-medium">Belum ada analisis</p>
            <p className="text-zinc-600 text-sm mt-1">Klik "Analisis Sekarang" untuk memulai</p>
          </div>
        </div>
      )}

      {/* Insight result */}
      {!isLoading && insight && (
        <div className="space-y-4">

          {/* Meta info */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <Clock size={12} />
              Terakhir dianalisis: {formatWIB(insight.createdAt)}
              {insight.generatedBy && <span className="text-zinc-700">· oleh {insight.generatedBy}</span>}
            </div>
            <span className="text-[10px] bg-purple-900/30 text-purple-400 border border-purple-800/40 px-2 py-0.5 rounded-full">
              {insight.modelUsed}
            </span>
          </div>

          {/* Snapshot data cards */}
          {snapshot && (
            <div>
              <button
                onClick={() => setShowData(!showData)}
                className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 mb-3 transition-colors"
              >
                {showData ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                Data yang digunakan AI
              </button>
              {showData && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                  <DataCard
                    icon={TrendingUp}
                    label={`Omzet ${snapshot.periodLabel || '30 Hari'}`}
                    value={formatRupiah(snapshot.omzetTotal ?? snapshot.omzet30 ?? 0, true)}
                    sub={`GP: ${formatRupiah(snapshot.gpTotal ?? snapshot.gp30 ?? 0, true)}`}
                    color="emerald"
                  />
                  <DataCard
                    icon={BarChart3}
                    label="Total Order"
                    value={`${snapshot.orderCountTotal ?? snapshot.orderCount30 ?? 0} order`}
                    sub={`~${snapshot.avgOrderPerDay ?? 0}/hari`}
                    color="blue"
                  />
                  <DataCard
                    icon={AlertTriangle}
                    label="Stok Kritis"
                    value={`${snapshot.stokKritis ?? 0} SKU`}
                    sub="perlu restock"
                    color="red"
                  />
                  <DataCard
                    icon={Package}
                    label="Aging Backlog"
                    value={`${snapshot.agingBacklog?.total ?? 0} order`}
                    sub={`>48 jam: ${snapshot.agingBacklog?.['>48 Jam'] ?? 0}`}
                    color="yellow"
                  />
                </div>
              )}
            </div>
          )}

          {/* AI Content Card */}
          <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
            {/* Glow header */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-purple-500/50 to-transparent" />
            <div className="px-5 py-4 border-b border-zinc-800/50 flex items-center gap-3">
              <div className="p-1.5 rounded-lg bg-purple-900/30 border border-purple-800/40">
                <Sparkles size={14} className="text-purple-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Analisis Performa Elyasr</p>
                <p className="text-[10px] text-zinc-500">Periode: {insight.period} · Powered by SumoPod</p>
              </div>
            </div>
            <div className="p-5">
              <AIContent text={insight.content} />
            </div>
          </div>

          {/* Top provinsi dari snapshot */}
          {snapshot?.topProvinces?.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-xs font-medium text-zinc-400 mb-3 flex items-center gap-1.5">
                <MapPin size={12} />
                Top Provinsi (30 hari terakhir)
              </p>
              <div className="space-y-1.5">
                {snapshot.topProvinces.map((p: any, i: number) => (
                  <div key={p.province} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-zinc-700 w-4">{i + 1}</span>
                      <span className="text-xs text-zinc-400">{p.province}</span>
                    </div>
                    <span className="text-xs font-medium text-zinc-300">{p.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </AppLayout>
  )
}
