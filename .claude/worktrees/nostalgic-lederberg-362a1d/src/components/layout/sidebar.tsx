'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth, usePermission } from '@/components/providers'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, ShoppingCart, CreditCard, BarChart3,
  Package, ScanLine, ClipboardCheck, Building2, Wallet,
  Users, BookOpen, Database, Shield, Download, AlertTriangle,
  Store, TrendingUp, FileText, LogOut, ChevronDown, ChevronRight,
  Truck, X, Menu, MessageSquarePlus, GitMerge, Sparkles
} from 'lucide-react'
import { useState } from 'react'

interface NavItem {
  href: string
  label: string
  icon: React.ElementType
  roles?: string[]
  children?: NavItem[]
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['OWNER', 'FINANCE', 'STAFF'] },
  { href: '/orders', label: 'Pesanan', icon: ShoppingCart, roles: ['OWNER', 'FINANCE', 'STAFF'] },
  { href: '/scan-order', label: 'Scan Resi', icon: ScanLine, roles: ['OWNER', 'FINANCE', 'STAFF'] },
  { href: '/inventory',        label: 'Inventori',        icon: Package,   roles: ['OWNER', 'FINANCE', 'STAFF'] },
  { href: '/produk-gabungan',  label: 'Produk Gabungan',  icon: GitMerge,  roles: ['OWNER', 'FINANCE'] },
  { href: '/procurement',      label: 'Procurement',      icon: Truck,     roles: ['OWNER', 'FINANCE'] },
  { href: '/finance',     label: 'Finance Room', icon: Wallet,  roles: ['OWNER', 'FINANCE'] },
  { href: '/crm', label: 'CRM', icon: Users, roles: ['OWNER', 'FINANCE'] },
  { href: '/alerts', label: 'Alerts', icon: AlertTriangle, roles: ['OWNER', 'FINANCE'] },
  { href: '/ai-insights', label: 'AI Insights', icon: Sparkles, roles: ['OWNER'] },
  {
    href: '/owner-room',
    label: 'Owner Room',
    icon: Shield,
    roles: ['OWNER'],
  },
  { href: '/suggest-revision', label: 'Suggest Revision', icon: MessageSquarePlus },
  { href: '/documentation', label: 'Dokumentasi', icon: BookOpen },
]

function NavItemComponent({ item, level = 0 }: { item: NavItem; level?: number }) {
  const pathname = usePathname()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)

  // Check role access
  if (item.roles && user && !item.roles.includes(user.userRole)) return null

  // Support ?tab= URLs: strip query for path comparison
  const itemPath = item.href.split('?')[0]
  const isActive = pathname === itemPath || pathname.startsWith(itemPath + '/')
  const hasChildren = item.children && item.children.length > 0
  const Icon = item.icon

  if (hasChildren) {
    const isChildActive = item.children!.some(c => { const cp = c.href.split('?')[0]; return pathname === cp || pathname.startsWith(cp + '/') })
    const isExpanded = open || isChildActive

    return (
      <div>
        <button
          onClick={() => setOpen(!isExpanded)}
          className={cn(
            'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left',
            isChildActive
              ? 'bg-emerald-900/30 text-emerald-400'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
          )}
        >
          <Icon size={16} className="shrink-0" />
          <span className="flex-1">{item.label}</span>
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        {isExpanded && (
          <div className="ml-4 mt-0.5 space-y-0.5 border-l border-zinc-800 pl-2">
            {item.children!.map(child => (
              <NavItemComponent key={child.href} item={child} level={level + 1} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
        isActive
          ? 'bg-emerald-900/40 text-emerald-400 font-medium'
          : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
      )}
    >
      <Icon size={16} className="shrink-0" />
      <span>{item.label}</span>
    </Link>
  )
}

interface SidebarProps {
  mobileOpen?: boolean
  onMobileClose?: () => void
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const { user, logout } = useAuth()

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <span className="text-sm font-bold text-emerald-400">E</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-white">ELYASR</p>
            <p className="text-[10px] text-zinc-500">Management System</p>
          </div>
        </div>
        {onMobileClose && (
          <button onClick={onMobileClose} className="text-zinc-500 hover:text-zinc-300 lg:hidden">
            <X size={18} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {NAV_ITEMS.map(item => (
          <NavItemComponent key={item.href} item={item} />
        ))}
      </nav>

      {/* User */}
      <div className="border-t border-zinc-800 p-3">
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg mb-1">
          <div className="w-7 h-7 rounded-full bg-emerald-900/50 border border-emerald-800 flex items-center justify-center">
            <span className="text-xs font-bold text-emerald-400">
              {user?.username?.[0]?.toUpperCase() ?? 'U'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-zinc-200 truncate">{user?.fullName || user?.username}</p>
            <p className="text-[10px] text-zinc-500">{user?.userRole}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-500 hover:text-red-400 hover:bg-red-900/20 transition-colors"
        >
          <LogOut size={14} />
          <span>Keluar</span>
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-56 shrink-0 bg-zinc-900 border-r border-zinc-800 h-screen sticky top-0">
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onMobileClose}
          />
          <aside className="relative w-64 bg-zinc-900 border-r border-zinc-800 h-full z-10">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  )
}

// Mobile header with hamburger
export function MobileHeader({ onMenuOpen }: { onMenuOpen: () => void }) {
  return (
    <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-zinc-900 border-b border-zinc-800 sticky top-0 z-40">
      <button onClick={onMenuOpen} className="text-zinc-400 hover:text-white">
        <Menu size={20} />
      </button>
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
          <span className="text-xs font-bold text-emerald-400">E</span>
        </div>
        <span className="text-sm font-semibold text-white">ELYASR</span>
      </div>
    </header>
  )
}
