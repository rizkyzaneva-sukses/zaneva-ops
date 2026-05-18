'use client'

import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'

/**
 * Section header dengan judul, ikon, deskripsi, dan slot tanggal/aksi di kanan.
 * Optional: collapsible dengan animasi.
 */
export function SectionHeader({
  icon: Icon,
  title,
  description,
  rangeLabel,
  right,
  collapsible = false,
  defaultOpen = true,
  storageKey,
  children,
}: {
  icon?: React.ElementType
  title: string
  description?: string
  rangeLabel?: string
  right?: React.ReactNode
  collapsible?: boolean
  defaultOpen?: boolean
  storageKey?: string
  children?: React.ReactNode
}) {
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined' || !storageKey) return defaultOpen
    const stored = window.localStorage.getItem(storageKey)
    if (stored === '0') return false
    if (stored === '1') return true
    return defaultOpen
  })

  const toggle = () => {
    setOpen((v) => {
      const next = !v
      if (typeof window !== 'undefined' && storageKey) {
        window.localStorage.setItem(storageKey, next ? '1' : '0')
      }
      return next
    })
  }

  return (
    <section className="mb-4">
      <header className="flex items-end justify-between gap-3 mb-2 px-0.5">
        <div className="flex items-start gap-2 min-w-0">
          {collapsible ? (
            <button
              onClick={toggle}
              className="mt-1 text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
              aria-label={open ? 'Tutup section' : 'Buka section'}
            >
              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : null}
          {Icon && <Icon size={14} className="text-zinc-500 mt-1 shrink-0" />}
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-zinc-200 leading-tight">{title}</h2>
            {description && <p className="text-[11px] text-zinc-600 mt-0.5">{description}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {rangeLabel && <span className="text-[10px] text-zinc-600">{rangeLabel}</span>}
          {right}
        </div>
      </header>
      {open && <div>{children}</div>}
    </section>
  )
}
