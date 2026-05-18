'use client'

import { LineChart, Line, ResponsiveContainer } from 'recharts'
import { DeltaBadge } from './delta-badge'

/**
 * Sparkline mini-chart untuk KPI card.
 * Menampilkan trend 14 hari terakhir tanpa axis/grid, hanya garis.
 */
function Sparkline({
  data,
  color,
}: {
  data: number[]
  color: string
}) {
  if (!data?.length) return null
  const series = data.map((v, i) => ({ i, v }))
  return (
    <ResponsiveContainer width="100%" height={28}>
      <LineChart data={series} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
        <Line
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

const SPARKLINE_COLORS: Record<string, string> = {
  emerald: '#10b981',
  yellow: '#eab308',
  red: '#ef4444',
  blue: '#3b82f6',
  purple: '#a855f7',
  orange: '#f97316',
  cyan: '#06b6d4',
  pink: '#ec4899',
}

/**
 * KPI card dengan ikon, delta badge, sub label, dan sparkline opsional.
 */
export function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  color = 'emerald',
  delta,
  deltaInvert,
  spark,
}: {
  label: string
  value: string
  sub?: string
  icon: React.ElementType
  color?: string
  delta?: number | null
  deltaInvert?: boolean
  spark?: number[]
}) {
  const colors: Record<string, string> = {
    emerald: 'text-emerald-400 bg-emerald-900/20 border-emerald-800/40',
    yellow: 'text-yellow-400 bg-yellow-900/20 border-yellow-800/40',
    red: 'text-red-400 bg-red-900/20 border-red-800/40',
    blue: 'text-blue-400 bg-blue-900/20 border-blue-800/40',
    purple: 'text-purple-400 bg-purple-900/20 border-purple-800/40',
    orange: 'text-orange-400 bg-orange-900/20 border-orange-800/40',
    cyan: 'text-cyan-400 bg-cyan-900/20 border-cyan-800/40',
    pink: 'text-pink-400 bg-pink-900/20 border-pink-800/40',
  }
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-zinc-500 text-xs mb-1">{label}</p>
          <p className="text-xl font-bold text-white truncate">{value}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            {delta !== undefined && <DeltaBadge value={delta} invert={deltaInvert} />}
            {sub && <p className="text-zinc-600 text-[10px]">{sub}</p>}
          </div>
        </div>
        <div className={`p-2 rounded-lg border shrink-0 ${colors[color]}`}>
          <Icon size={16} />
        </div>
      </div>
      {spark && spark.length > 1 && (
        <div className="mt-2 -mx-1">
          <Sparkline data={spark} color={SPARKLINE_COLORS[color] ?? '#10b981'} />
        </div>
      )}
    </div>
  )
}
