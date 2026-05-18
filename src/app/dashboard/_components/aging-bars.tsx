'use client'

/**
 * Aging bars horizontal — visualisasi distribusi item per bucket umur.
 * Dipakai untuk: backlog order, aging piutang, aging utang.
 */
export function AgingBars({
  aging,
  warningIndex = 2,
  dangerIndex = 3,
}: {
  aging: { label: string; count: number }[]
  warningIndex?: number
  dangerIndex?: number
}) {
  const max = Math.max(...aging.map((a) => a.count), 1)
  const colors = ['bg-emerald-500', 'bg-yellow-500', 'bg-orange-500', 'bg-red-500']
  return (
    <div className="space-y-2">
      {aging.map((a, i) => (
        <div key={a.label} className="flex items-center gap-3">
          <span className="text-xs text-zinc-500 w-20 shrink-0 truncate">{a.label}</span>
          <div className="flex-1 bg-zinc-800 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${colors[Math.min(i, colors.length - 1)]}`}
              style={{ width: `${(a.count / max) * 100}%` }}
            />
          </div>
          <span
            className={`text-sm font-bold w-8 text-right ${
              i >= dangerIndex
                ? 'text-red-400'
                : i >= warningIndex
                ? 'text-orange-400'
                : 'text-zinc-300'
            }`}
          >
            {a.count}
          </span>
        </div>
      ))}
    </div>
  )
}
