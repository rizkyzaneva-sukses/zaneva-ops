'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { BarChart3 } from 'lucide-react'

export default function ProcurementMonitoringPage() {
  return (
    <AppLayout>
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2">
          <BarChart3 size={22} className="text-emerald-400" />
          Monitoring Procurement
        </h1>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
        <BarChart3 size={48} className="mx-auto mb-4 text-zinc-700" />
        <h2 className="text-lg font-bold text-white mb-2">Halaman Sedang Dalam Pengembangan</h2>
        <p className="text-zinc-500 text-sm max-w-md mx-auto">
          Fitur monitoring dan statistik procurement (analisa pembelian) akan segera hadir di sini.
        </p>
      </div>
    </AppLayout>
  )
}
