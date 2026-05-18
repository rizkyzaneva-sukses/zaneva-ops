'use client'

import { TrendingUp, TrendingDown } from 'lucide-react'

/**
 * Indikator perubahan persentase (delta) vs periode sebelumnya.
 * - invert=true  : naik = buruk (cancel rate, expense, ads)
 * - invert=false : naik = baik (omzet, profit)
 */
export function DeltaBadge({
  value,
  invert = false,
}: {
  value: number | null | undefined
  invert?: boolean
}) {
  if (value === null || value === undefined) {
    return <span className="text-[10px] text-zinc-600">—</span>
  }
  const positive = value >= 0
  const isGood = invert ? !positive : positive
  const Icon = positive ? TrendingUp : TrendingDown
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${
        isGood ? 'text-emerald-400' : 'text-red-400'
      }`}
    >
      <Icon size={10} />
      {Math.abs(value).toFixed(1)}%
    </span>
  )
}
