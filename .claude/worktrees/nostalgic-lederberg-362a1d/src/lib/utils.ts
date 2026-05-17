import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ── Format currency (IDR) ──────────────────────────────
// Parameter `short` dipertahankan agar tidak perlu ubah semua call site,
// tapi mode singkat DINONAKTIFKAN — semua angka selalu ditampilkan penuh
// (misal: Rp172.000.000, bukan Rp172jt) sesuai permintaan tim.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function formatRupiah(amount: number, short = false): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

// ── Format date ────────────────────────────────────────
export function formatDate(date: Date | string | null | undefined, format: 'short' | 'long' | 'datetime' = 'short'): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '-'

  if (format === 'datetime') {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(d)
  }
  if (format === 'long') {
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric', month: 'long', year: 'numeric',
    }).format(d)
  }
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(d)
}

// ── PO Number Generator ────────────────────────────────
export function generatePONumber(poDate: Date, existingPONumbers: string[]): string {
  const dateStr = poDate.toISOString().slice(0, 10).replace(/-/g, '')
  const prefix = `PO-${dateStr}-`
  const existing = existingPONumbers
    .filter(n => n.startsWith(prefix))
    .map(n => parseInt(n.replace(prefix, ''), 10))
    .filter(n => !isNaN(n))
  const next = existing.length > 0 ? Math.max(...existing) + 1 : 1
  return `${prefix}${next.toString().padStart(2, '0')}`
}

// ── SOH Calculator ─────────────────────────────────────
export interface LedgerEntry {
  sku: string
  direction: 'IN' | 'OUT'
  qty: number
  trxDate: Date | string
}

export function calculateSOH(
  stokAwal: number,
  lastOpnameDate: Date | string | null | undefined,
  ledgerEntries: LedgerEntry[]
): number {
  const cutoff = lastOpnameDate ? new Date(lastOpnameDate) : null
  const relevant = cutoff
    ? ledgerEntries.filter(e => new Date(e.trxDate) >= cutoff)
    : ledgerEntries

  const inQty = relevant.filter(e => e.direction === 'IN').reduce((s, e) => s + e.qty, 0)
  const outQty = relevant.filter(e => e.direction === 'OUT').reduce((s, e) => s + e.qty, 0)
  return stokAwal + inQty - outQty
}

// ── API Response helpers ───────────────────────────────
export function apiSuccess<T>(data: T, status = 200) {
  return Response.json({ success: true, data }, { status })
}

export function apiError(message: string, status = 400) {
  return Response.json({ success: false, error: message }, { status })
}

// ── Paginate ───────────────────────────────────────────
export interface PaginationParams {
  page?: number
  limit?: number
}

export function getPagination(params: PaginationParams) {
  const page = Math.max(1, params.page ?? 1)
  const limit = Math.min(100, Math.max(1, params.limit ?? 20))
  const skip = (page - 1) * limit
  return { page, limit, skip, take: limit }
}

// ── CSV Download helper ────────────────────────────────
export function downloadCSV(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const csv = [
    headers.join(','),
    ...rows.map(row =>
      headers
        .map(h => {
          const val = row[h]
          const str = val === null || val === undefined ? '' : String(val)
          return str.includes(',') || str.includes('"') || str.includes('\n')
            ? `"${str.replace(/"/g, '""')}"`
            : str
        })
        .join(',')
    ),
  ].join('\n')

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

// ── Number parse ───────────────────────────────────────
export function safeInt(value: unknown, fallback = 0): number {
  const n = parseInt(String(value), 10)
  return isNaN(n) ? fallback : n
}

export function safeFloat(value: unknown, fallback = 0): number {
  const n = parseFloat(String(value))
  return isNaN(n) ? fallback : n
}
