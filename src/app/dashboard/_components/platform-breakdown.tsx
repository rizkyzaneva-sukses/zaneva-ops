'use client'

import { formatRupiah } from '@/lib/utils'

/**
 * Breakdown omzet per platform: bar progress + omzet, count, GP, ads, ROAS.
 */
export function PlatformBreakdown({
  data,
  showGp = true,
}: {
  data: any[]
  showGp?: boolean
}) {
  if (!data?.length) return <p className="text-zinc-600 text-sm">Belum ada data</p>
  const total = data.reduce((s, p) => s + p.realOmzet, 0)
  return (
    <div className="space-y-2.5">
      {data.map((p: any) => (
        <div key={p.platform}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                  p.platform === 'TikTok'
                    ? 'bg-pink-900/40 text-pink-400'
                    : p.platform === 'Shopee'
                    ? 'bg-orange-900/40 text-orange-400'
                    : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {p.platform}
              </span>
              <span className="text-xs text-zinc-500">{p.count} order</span>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium text-white">{formatRupiah(p.realOmzet, true)}</p>
              {showGp && (
                <div className="flex flex-col items-end">
                  <p className="text-[10px] text-emerald-600">
                    GP: {formatRupiah(p.grossProfit, true)}
                  </p>
                  {p.adSpend > 0 && (
                    <p className="text-[10px] text-orange-400">
                      Ads: {formatRupiah(p.adSpend, true)} (ROAS: {p.roas})
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="bg-zinc-800 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full ${
                p.platform === 'TikTok'
                  ? 'bg-pink-500'
                  : p.platform === 'Shopee'
                  ? 'bg-orange-500'
                  : 'bg-emerald-500'
              }`}
              style={{ width: total > 0 ? `${(p.realOmzet / total) * 100}%` : '0%' }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
