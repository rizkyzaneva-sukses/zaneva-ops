'use client'

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts'
import { formatRupiah } from '@/lib/utils'

const tooltipStyle = {
  backgroundColor: '#18181b',
  border: '1px solid #3f3f46',
  borderRadius: 8,
  fontSize: 11,
}
const labelStyle = { color: '#a1a1aa' }
const tickStyle = { fill: '#71717a', fontSize: 10 }

const tickFormatRupiah = (v: number) =>
  v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}jt` : v >= 1000 ? `${(v / 1000).toFixed(0)}rb` : `${v}`

/** Format DD/MM dari "YYYY-MM-DD" */
function shortDay(day: string): string {
  return day.slice(8, 10) + '/' + day.slice(5, 7)
}

/**
 * Trend Omzet & Gross Profit per hari (area chart).
 */
export function TrendChart({ trend }: { trend: any[] }) {
  if (!trend?.length) {
    return <p className="text-zinc-600 text-sm py-8 text-center">Belum ada data trend</p>
  }
  const data = trend.map((d) => ({ ...d, dayLabel: shortDay(d.day) }))
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="omzetGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gpGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
        <XAxis dataKey="dayLabel" tick={tickStyle} stroke="#3f3f46" />
        <YAxis tick={tickStyle} stroke="#3f3f46" tickFormatter={tickFormatRupiah} />
        <Tooltip
          contentStyle={tooltipStyle}
          labelStyle={labelStyle}
          formatter={(v: number, name: string) => {
            const labels: Record<string, string> = { omzet: 'Omzet', grossProfit: 'Gross Profit' }
            return [formatRupiah(v, true), labels[name] || name]
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11, color: '#a1a1aa' }} iconType="circle" />
        <Area type="monotone" dataKey="omzet" name="Omzet" stroke="#10b981" strokeWidth={2} fill="url(#omzetGrad)" />
        <Area type="monotone" dataKey="grossProfit" name="Gross Profit" stroke="#3b82f6" strokeWidth={2} fill="url(#gpGrad)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

/**
 * Trend order valid vs batal per hari (stacked bar).
 */
export function OrderTrendChart({ trend }: { trend: any[] }) {
  if (!trend?.length) {
    return <p className="text-zinc-600 text-sm py-8 text-center">Belum ada data trend</p>
  }
  const data = trend.map((d) => ({ ...d, dayLabel: shortDay(d.day) }))
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
        <XAxis dataKey="dayLabel" tick={tickStyle} stroke="#3f3f46" />
        <YAxis tick={tickStyle} stroke="#3f3f46" allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} labelStyle={labelStyle} />
        <Legend wrapperStyle={{ fontSize: 11, color: '#a1a1aa' }} iconType="circle" />
        <Bar dataKey="ordersValid" name="Valid" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
        <Bar dataKey="ordersBatal" name="Batal" stackId="a" fill="#ef4444" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/**
 * Margin trend harian (% margin, line chart).
 */
export function MarginTrendChart({ trend }: { trend: any[] }) {
  if (!trend?.length) {
    return <p className="text-zinc-600 text-sm py-8 text-center">Belum ada data margin</p>
  }
  const data = trend.map((d) => ({
    dayLabel: shortDay(d.day),
    margin: d.omzet > 0 ? Number(((d.grossProfit / d.omzet) * 100).toFixed(1)) : 0,
  }))
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
        <XAxis dataKey="dayLabel" tick={tickStyle} stroke="#3f3f46" />
        <YAxis
          tick={tickStyle}
          stroke="#3f3f46"
          domain={[0, (max: number) => Math.max(50, Math.ceil(max + 5))]}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          labelStyle={labelStyle}
          formatter={(v: number) => [`${v}%`, 'Gross Margin']}
        />
        <Line
          type="monotone"
          dataKey="margin"
          stroke="#a855f7"
          strokeWidth={2}
          dot={{ r: 2, fill: '#a855f7' }}
          activeDot={{ r: 4 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

/**
 * Daily cash flow (cash in vs cash out) — bar chart hijau/merah.
 */
export function DailyCashFlowChart({ trend }: { trend: any[] }) {
  if (!trend?.length) {
    return <p className="text-zinc-600 text-sm py-8 text-center">Belum ada data arus kas</p>
  }
  const data = trend.map((d) => ({ ...d, dayLabel: shortDay(d.day) }))
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
        <XAxis dataKey="dayLabel" tick={tickStyle} stroke="#3f3f46" />
        <YAxis tick={tickStyle} stroke="#3f3f46" tickFormatter={tickFormatRupiah} />
        <Tooltip
          contentStyle={tooltipStyle}
          labelStyle={labelStyle}
          formatter={(v: number, name: string) => {
            const labels: Record<string, string> = { cashIn: 'Masuk', cashOut: 'Keluar', net: 'Net' }
            return [formatRupiah(Math.abs(v), true), labels[name] || name]
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11, color: '#a1a1aa' }} iconType="circle" />
        <Bar dataKey="cashIn" name="Masuk" fill="#10b981" radius={[2, 2, 0, 0]} />
        <Bar dataKey="cashOut" name="Keluar" fill="#ef4444" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
