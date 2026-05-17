'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'
import { Package, FileText, ScanLine, ClipboardCheck, Database } from 'lucide-react'

// ── Tab imports (lazy via dynamic is overkill for this scale) ──
import { StokOverviewTab } from './_tabs/stok-overview'
import { LedgerTab }       from './_tabs/ledger'
import { ScanTab }          from './_tabs/scan'
import { OpnameTab }        from './_tabs/opname'
import { MasterProdukTab }  from './_tabs/master-produk'

const TABS = [
  { key: 'overview',  label: 'Stok Overview',    icon: Package,       roles: ['OWNER','FINANCE','STAFF'] },
  { key: 'ledger',    label: 'Inventory Ledger',  icon: FileText,      roles: ['OWNER','FINANCE','STAFF'] },
  { key: 'scan',      label: 'Scan Masuk/Keluar', icon: ScanLine,      roles: ['OWNER','FINANCE','STAFF'] },
  { key: 'opname',    label: 'Stock Opname',      icon: ClipboardCheck,roles: ['OWNER','FINANCE'] },
  { key: 'master',    label: 'Master Produk',     icon: Database,      roles: ['OWNER','FINANCE'] },
] as const

type TabKey = typeof TABS[number]['key']

function InventoriContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const activeTab = (searchParams.get('tab') as TabKey) || 'overview'

  const setTab = (key: TabKey) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', key)
    router.push(`/inventory?${params.toString()}`)
  }

  return (
    <AppLayout>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Package size={22} className="text-emerald-400" />
            Inventori
          </h1>
          <p className="text-zinc-500 text-sm mt-0.5">Master produk, stock movement, dan opname</p>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 mb-6 bg-zinc-900/60 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon
          const isActive = activeTab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-emerald-700 text-white shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60'
              }`}
            >
              <Icon size={14} className="shrink-0" />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && <StokOverviewTab />}
      {activeTab === 'ledger'   && <LedgerTab />}
      {activeTab === 'scan'     && <ScanTab />}
      {activeTab === 'opname'   && <OpnameTab />}
      {activeTab === 'master'   && <MasterProdukTab />}
    </AppLayout>
  )
}

export default function InventoriPage() {
  return (
    <Suspense fallback={<AppLayout><div className="py-20 text-center text-zinc-600">Memuat...</div></AppLayout>}>
      <InventoriContent />
    </Suspense>
  )
}
