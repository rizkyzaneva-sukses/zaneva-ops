'use client'

import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X, Target, Save, Trash2 } from 'lucide-react'
import { formatRupiah } from '@/lib/utils'

interface TargetData {
  ym: string
  omzet: number | null
  netProfit: number | null
}

function ymToLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
    'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
  ]
  return `${months[m - 1]} ${y}`
}

export function TargetEditorModal({
  ym,
  open,
  onClose,
  canEdit,
}: {
  ym: string
  open: boolean
  onClose: () => void
  canEdit: boolean
}) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery<TargetData>({
    queryKey: ['settings', 'targets', ym],
    queryFn: async () => {
      const res = await fetch(`/api/settings/targets?ym=${ym}`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed')
      return json.data
    },
    enabled: open,
    staleTime: 30_000,
  })

  const [omzet, setOmzet] = useState<string>('')
  const [netProfit, setNetProfit] = useState<string>('')

  useEffect(() => {
    if (data) {
      setOmzet(data.omzet ? String(data.omzet) : '')
      setNetProfit(data.netProfit ? String(data.netProfit) : '')
    }
  }, [data])

  const save = useMutation({
    mutationFn: async (payload: { omzet?: number | null; netProfit?: number | null }) => {
      const res = await fetch('/api/settings/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ym, ...payload }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'Gagal simpan target')
      return json.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'targets'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      onClose()
    },
  })

  if (!open) return null

  const handleSave = () => {
    const o = omzet.trim() ? Number(omzet) : null
    const n = netProfit.trim() ? Number(netProfit) : null
    save.mutate({ omzet: o, netProfit: n })
  }

  const handleClear = () => {
    if (!confirm(`Hapus target ${ymToLabel(ym)}?`)) return
    save.mutate({ omzet: null, netProfit: null })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Target size={16} className="text-emerald-400" />
            <h3 className="text-base font-semibold text-zinc-100">
              Target {ymToLabel(ym)}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300"
            aria-label="Tutup"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              <div className="h-16 bg-zinc-800/40 rounded-lg animate-pulse" />
              <div className="h-16 bg-zinc-800/40 rounded-lg animate-pulse" />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Target Omzet (Rp)
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={omzet}
                  onChange={(e) => setOmzet(e.target.value)}
                  disabled={!canEdit}
                  placeholder="cth: 500000000"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100 text-sm focus:outline-none focus:border-emerald-700 disabled:opacity-60"
                />
                {omzet && (
                  <p className="text-[11px] text-zinc-500 mt-1">
                    = {formatRupiah(Number(omzet) || 0)}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Target Net Profit (Rp)
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={netProfit}
                  onChange={(e) => setNetProfit(e.target.value)}
                  disabled={!canEdit}
                  placeholder="cth: 80000000"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100 text-sm focus:outline-none focus:border-emerald-700 disabled:opacity-60"
                />
                {netProfit && (
                  <p className="text-[11px] text-zinc-500 mt-1">
                    = {formatRupiah(Number(netProfit) || 0)}
                  </p>
                )}
              </div>

              {!canEdit && (
                <p className="text-[11px] text-yellow-500/80 bg-yellow-500/10 border border-yellow-500/20 rounded-md px-2 py-1.5">
                  Hanya Owner yang bisa mengubah target.
                </p>
              )}

              {save.error && (
                <p className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-2 py-1.5">
                  {(save.error as Error).message}
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 p-4 border-t border-zinc-800">
          {canEdit && (data?.omzet || data?.netProfit) ? (
            <button
              onClick={handleClear}
              disabled={save.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
            >
              <Trash2 size={12} />
              Hapus
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Batal
            </button>
            {canEdit && (
              <button
                onClick={handleSave}
                disabled={save.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-colors"
              >
                <Save size={12} />
                {save.isPending ? 'Menyimpan…' : 'Simpan'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
