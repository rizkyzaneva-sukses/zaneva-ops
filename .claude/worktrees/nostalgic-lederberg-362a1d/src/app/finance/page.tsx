'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'
import { Wallet, BarChart3, Package, Database, TrendingUp, CreditCard } from 'lucide-react'
import { WalletTab }    from './_tabs/wallet'
import { AsetTetapTab } from './_tabs/aset-tetap'
import { ModalAwalTab } from './_tabs/modal-awal'
import { PayoutTab }    from './_tabs/payout'
import { UtangTab }     from './_tabs/utang-piutang'
import { LaporanTab }   from './_tabs/laporan'

const TABS = [
  { key: 'wallet',  label: 'Wallet & Ledger', icon: Wallet,     roles: ['OWNER','FINANCE'] },
  { key: 'aset',    label: 'Aset Tetap',      icon: Package,    roles: ['OWNER','FINANCE'] },
  { key: 'modal',   label: 'Modal Awal',      icon: Database,   roles: ['OWNER'] },
  { key: 'payout',  label: 'Payout',          icon: TrendingUp, roles: ['OWNER','FINANCE'] },
  { key: 'utang',   label: 'Utang & Piutang', icon: CreditCard, roles: ['OWNER','FINANCE'] },
  { key: 'laporan', label: 'Laporan',         icon: BarChart3,  roles: ['OWNER','FINANCE'] },
] as const

type TabKey = typeof TABS[number]['key']

function FinanceContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const activeTab = (searchParams.get('tab') as TabKey) || 'wallet'

  const setTab = (key: TabKey) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', key)
    router.push(`/finance?${params.toString()}`)
  }

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Wallet size={22} className="text-emerald-400" />
            Finance Room
          </h1>
          <p className="text-zinc-500 text-sm mt-0.5">Kelola keuangan, laporan, dan aset perusahaan</p>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 mb-6 bg-zinc-900/60 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon
          const isActive = activeTab === t.key
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                isActive ? 'bg-emerald-700 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60'
              }`}>
              <Icon size={14} className="shrink-0" />{t.label}
            </button>
          )
        })}
      </div>

      {activeTab === 'wallet'  && <WalletTab />}
      {activeTab === 'aset'    && <AsetTetapTab />}
      {activeTab === 'modal'   && <ModalAwalTab />}
      {activeTab === 'payout'  && <PayoutTab />}
      {activeTab === 'utang'   && <UtangTab />}
      {activeTab === 'laporan' && <LaporanTab />}
    </AppLayout>
  )
}

export default function FinancePage() {
  return (
    <Suspense fallback={<AppLayout><div className="py-20 text-center text-zinc-600">Memuat...</div></AppLayout>}>
      <FinanceContent />
    </Suspense>
  )
}
