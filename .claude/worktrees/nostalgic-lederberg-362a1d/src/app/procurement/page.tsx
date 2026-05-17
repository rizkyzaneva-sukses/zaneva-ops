'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'
import { Truck, FileText, Building2, CreditCard, BarChart3 } from 'lucide-react'
import { PurchaseOrdersTab } from './_tabs/purchase-orders'
import { VendorsTab }        from './_tabs/vendors'
import { VendorPaymentsTab } from './_tabs/vendor-payments'
import { MonitoringTab }     from './_tabs/monitoring'

const TABS = [
  { key: 'po',      label: 'Purchase Orders',   icon: FileText,  roles: ['OWNER','FINANCE'] },
  { key: 'vendor',  label: 'Vendor',             icon: Building2, roles: ['OWNER','FINANCE'] },
  { key: 'payment', label: 'Pembayaran Vendor',  icon: CreditCard,roles: ['OWNER','FINANCE'] },
  { key: 'monitor', label: 'Monitoring',         icon: BarChart3, roles: ['OWNER','FINANCE'] },
] as const

type TabKey = typeof TABS[number]['key']

function ProcurementContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const activeTab = (searchParams.get('tab') as TabKey) || 'po'

  const setTab = (key: TabKey) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', key)
    router.push(`/procurement?${params.toString()}`)
  }

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Truck size={22} className="text-emerald-400" />
            Procurement
          </h1>
          <p className="text-zinc-500 text-sm mt-0.5">Purchase orders, vendor, dan monitoring pembelian</p>
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

      {activeTab === 'po'      && <PurchaseOrdersTab />}
      {activeTab === 'vendor'  && <VendorsTab />}
      {activeTab === 'payment' && <VendorPaymentsTab />}
      {activeTab === 'monitor' && <MonitoringTab />}
    </AppLayout>
  )
}

export default function ProcurementPage() {
  return (
    <Suspense fallback={<AppLayout><div className="py-20 text-center text-zinc-600">Memuat...</div></AppLayout>}>
      <ProcurementContent />
    </Suspense>
  )
}
