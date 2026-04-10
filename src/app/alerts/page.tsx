'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { AlertTriangle, HardHat } from 'lucide-react'

export default function AlertsPage() {
  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto">
        <div className="page-header mb-6">
          <h1 className="page-title flex items-center gap-2">
            <AlertTriangle size={24} className="text-amber-400" />
            Sistem Alerts
          </h1>
          <p className="text-zinc-400 text-sm mt-1">Pusat notifikasi dan sistem peringatan</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 flex flex-col items-center justify-center text-center">
          <div className="bg-zinc-800/50 p-4 rounded-full mb-4 border border-zinc-700">
            <HardHat size={48} className="text-zinc-500" />
          </div>
          <h2 className="text-xl font-bold text-zinc-200 mb-2">Halaman Sedang Dalam Pengembangan</h2>
          <p className="text-zinc-400 max-w-md">
            Fitur notifikasi dan alert sistem sedang dibangun. Nantinya halaman ini akan menampilkan peringatan stok menipis, anomali pesanan, dan notifikasi penting lainnya.
          </p>
        </div>
      </div>
    </AppLayout>
  )
}
