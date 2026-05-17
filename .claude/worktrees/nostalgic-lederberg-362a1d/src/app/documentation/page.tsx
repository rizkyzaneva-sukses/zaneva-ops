'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useState } from 'react'
import {
  BookOpen, LayoutDashboard, ShoppingCart, Package, Truck,
  Wallet, Users, Shield, ScanLine, ClipboardCheck, Building2,
  CreditCard, BarChart3, TrendingUp, AlertTriangle, FileText,
  ChevronRight, Database, Store, Search, X, ExternalLink,
  GitMerge, MessageSquarePlus
} from 'lucide-react'

interface DocSection {
  id: string
  title: string
  icon: React.ElementType
  color: string
  overview: string
  features: string[]
  access: string[]
  path: string
}

const DOC_SECTIONS: DocSection[] = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    icon: LayoutDashboard,
    color: 'text-emerald-400',
    path: '/dashboard',
    overview: 'Halaman utama yang menyajikan ringkasan performa operasional bisnis secara real-time. Menampilkan KPI kunci, grafik penjualan, status stok, dan notifikasi penting.',
    features: [
      'Kartu KPI: Total Omzet, Gross Profit, Stok Kritis, dan Backlog real-time',
      'ROAS per platform (Shopee/TikTok) — otomatis dihitung dari pengeluaran Iklan & Biaya Ongkir Sample',
      'Breakdown omzet dan GP per platform beserta indikator Ad Spend',
      'Aging Backlog: visual order pending per kelompok waktu (0-12, 12-24, 24-48, >48 jam)',
      'Saldo Wallet dan daftar payout terkini',
      'Top Provinsi dan Top Kota berdasarkan jumlah order',
      'Filter rentang tanggal fleksibel (Hari ini, Kemarin, Minggu ini, Bulan ini, Bulan lalu)',
    ],
    access: ['OWNER', 'FINANCE', 'STAFF'],
  },
  {
    id: 'orders',
    title: 'Pesanan (Orders)',
    icon: ShoppingCart,
    color: 'text-blue-400',
    path: '/orders',
    overview: 'Modul manajemen pesanan penjualan. Menangani seluruh siklus hidup pesanan dari pencatatan hingga pengiriman, termasuk upload bukti bayar, No. Resi, dan bulk aksi.',
    features: [
      'Daftar pesanan dengan filter status, pencarian, dan paginasi',
      'Tambah pesanan baru dengan multi-item produk',
      'Upload bukti bayar (preview sebelum submit)',
      'Input No. Resi pengiriman per pesanan',
      'Edit pesanan (khusus OWNER)',
      'Hapus pesanan / bulk delete (khusus OWNER)',
      'Export data pesanan ke CSV',
      'Filter berdasarkan tanggal, status pembayaran, status pengiriman',
    ],
    access: ['OWNER', 'FINANCE', 'STAFF'],
  },
  {
    id: 'scan-order',
    title: 'Scan Resi',
    icon: ScanLine,
    color: 'text-cyan-400',
    path: '/scan-order',
    overview: 'Fitur verifikasi pengiriman berbasis scan barcode atau input manual No. Resi. Memudahkan staff gudang memperbarui status pengiriman pesanan secara cepat.',
    features: [
      'Input atau scan No. Resi untuk mencari pesanan',
      'Tampilan detail pesanan yang cocok',
      'Update status pengiriman menjadi "Terkirim"',
      'Riwayat scan dalam sesi aktif',
      'Notifikasi sukses/gagal verifikasi',
    ],
    access: ['OWNER', 'FINANCE', 'STAFF'],
  },
  {
    id: 'inventory',
    title: 'Inventori — Stok Overview',
    icon: Package,
    color: 'text-yellow-400',
    path: '/inventory',
    overview: 'Panel utama manajemen stok produk. Menampilkan kondisi stok semua SKU aktif beserta indikator kritis.',
    features: [
      'Ringkasan jumlah stok habis, stok kritis, dan stok aman',
      'Tabel stok dengan kolom SOH (Stock on Hand), ROP (Reorder Point), HPP',
      'Filter per kategori dan pencarian SKU/nama produk',
      'Indikator warna status stok (Aman/Kritis/Habis)',
      'Modal riwayat ledger per SKU (mutasi masuk/keluar)',
      'Export data stok ke CSV',
    ],
    access: ['OWNER', 'FINANCE', 'STAFF'],
  },
  {
    id: 'external-inventory',
    title: 'Inventori — External Inventory',
    icon: Store,
    color: 'text-yellow-400',
    path: '/external-inventory',
    overview: 'Halaman stok read-only untuk user EXTERNAL. Menampilkan produk yang masih tersedia beserta jumlah stok saat ini tanpa membuka modul internal lain.',
    features: [
      'Pencarian SKU atau nama produk',
      'Hanya menampilkan produk dengan stok tersedia',
      'Tampilan sederhana untuk akses partner/mitra eksternal',
      'Akses otomatis diarahkan ke halaman ini untuk role EXTERNAL',
    ],
    access: ['EXTERNAL'],
  },
  {
    id: 'inventory-ledger',
    title: 'Inventori — Global Ledger',
    icon: FileText,
    color: 'text-yellow-400',
    path: '/inventory-ledger',
    overview: 'Laporan buku besar stok global — menampilkan semua mutasi stok (IN/OUT) dari seluruh SKU secara kronologis dengan filter tanggal dan paginasi.',
    features: [
      'Riwayat lengkap semua transaksi mutasi stok',
      'Filter berdasarkan rentang tanggal',
      'Kolom: Waktu, SKU, Nama Produk, Tipe (IN/OUT), Qty, Kategori Transaksi, Catatan, PIC',
      'Paginasi 50 record per halaman',
      'Kode warna untuk transaksi Masuk (hijau) dan Keluar (merah)',
    ],
    access: ['OWNER', 'FINANCE', 'STAFF'],
  },
  {
    id: 'inventory-scan',
    title: 'Inventori — Scan Masuk/Keluar',
    icon: ScanLine,
    color: 'text-yellow-400',
    path: '/inventory-scan',
    overview: 'Modul pencatatan mutasi stok secara cepat melalui scan barcode SKU. Digunakan untuk penerimaan barang masuk, pengeluaran barang dari gudang, maupun pencatatan barang keluar untuk endorsement (Beban Sample).',
    features: [
      'Tab Scan Masuk — catat penerimaan barang dari supplier (reason: PURCHASE)',
      'Tab Scan Keluar — catat barang keluar karena penjualan (reason: SALES)',
      'Tab Endorsement — catat barang keluar untuk keperluan endorsement/KOL, dicatat sebagai Beban Sample (reason: MARKETING)',
      'Tab Scan Retur — retur penjualan berdasarkan scan No. Resi',
      'Tab Retur Pembelian — retur barang ke supplier',
      'Upload CSV batch (format: PRODUK, QTY)',
      'Commit batch: semua item dikunci ke inventory ledger sekaligus',
    ],
    access: ['OWNER', 'FINANCE', 'STAFF'],
  },
  {
    id: 'stock-opname',
    title: 'Inventori — Stock Opname',
    icon: ClipboardCheck,
    color: 'text-yellow-400',
    path: '/stock-opname',
    overview: 'Modul untuk melakukan pengecekan fisik stok dan penyesuaian (adjustment) jika terdapat selisih antara stok sistem dan stok aktual di gudang.',
    features: [
      'Buat sesi stock opname baru',
      'Input hasil hitung fisik per SKU',
      'Kalkulasi selisih otomatis (sistem vs fisik)',
      'Konfirmasi dan finalisasi opname untuk menyesuaikan stok',
      'Riwayat sesi opname sebelumnya',
    ],
    access: ['OWNER', 'FINANCE'],
  },
  {
    id: 'master-products',
    title: 'Inventori — Master Produk',
    icon: Database,
    color: 'text-yellow-400',
    path: '/master-products',
    overview: 'Manajemen data master produk (SKU). Tempat mendaftarkan, mengedit, dan menonaktifkan produk beserta atribut seperti ROP, HPP, dan kategori.',
    features: [
      'Daftar semua produk aktif dan nonaktif',
      'Tambah produk baru dengan detail SKU, nama, kategori, unit, ROP, HPP',
      'Edit detail produk',
      'Nonaktifkan produk yang sudah tidak digunakan',
      'Filter dan pencarian berdasarkan SKU/nama/kategori',
    ],
    access: ['OWNER', 'FINANCE'],
  },
  {
    id: 'produk-gabungan',
    title: 'Inventori — Produk Gabungan',
    icon: GitMerge,
    color: 'text-yellow-400',
    path: '/produk-gabungan',
    overview: 'Database mapping SKU gabungan marketplace ke SKU individual internal. Dipakai saat import order agar bundle atau produk kombinasi bisa dipecah ke SKU database yang benar.',
    features: [
      'Tambah dan edit mapping SKU marketplace ke SKU database',
      'Import massal mapping dari file Excel template',
      'Preview hasil split SKU berdasarkan tanda +',
      'Bulk pilih dan hapus mapping yang tidak dipakai',
      'Dipakai langsung oleh proses upload order Shopee/TikTok',
    ],
    access: ['OWNER', 'FINANCE'],
  },
  {
    id: 'purchase-orders',
    title: 'Procurement — Purchase Orders',
    icon: FileText,
    color: 'text-orange-400',
    path: '/procurement?tab=po',
    overview: 'Modul pembuatan dan pengelolaan Purchase Order (PO) ke vendor. Melacak penerimaan barang, pembayaran, dan dokumen print resmi untuk setiap PO.',
    features: [
      'Buat PO baru dengan pilih vendor, tanggal, dan list item SKU',
      'Auto split PO berdasarkan kategori item saat diperlukan',
      'Tabel PO dengan status penerimaan dan pembayaran',
      'Lihat detail PO termasuk breakdown item, qty order vs received',
      'Bayar vendor langsung dari daftar PO',
      'Download CSV detail PO',
      'Cetak/Print PO dengan layout dokumen resmi dan tabel otomatis 2 kolom saat item banyak',
      'Finance dapat request delete, OWNER dapat edit/hapus langsung',
      'Filter berdasarkan status PO (Open/Partial/Completed/Cancelled)',
    ],
    access: ['OWNER', 'FINANCE'],
  },
  {
    id: 'vendors',
    title: 'Procurement — Vendor',
    icon: Building2,
    color: 'text-orange-400',
    path: '/procurement?tab=vendor',
    overview: 'Manajemen data vendor/pemasok. Menyimpan informasi kontak, rekening bank, dan riwayat transaksi dengan setiap vendor.',
    features: [
      'Daftar vendor aktif dan nonaktif',
      'Tambah dan edit data vendor (nama, kontak, alamat, bank)',
      'Melihat riwayat PO per vendor',
      'Status aktif/nonaktif vendor',
    ],
    access: ['OWNER', 'FINANCE'],
  },
  {
    id: 'vendor-payments',
    title: 'Procurement — Pembayaran Vendor',
    icon: CreditCard,
    color: 'text-orange-400',
    path: '/procurement?tab=payment',
    overview: 'Modul pencatatan pembayaran kepada vendor. Merekam setiap transaksi pelunasan atau cicilan pembayaran PO.',
    features: [
      'Daftar pembayaran ke vendor dengan filter tanggal',
      'Tambah catatan pembayaran baru (link ke PO)',
      'Input jumlah dibayar, metode bayar, bukti transfer',
      'Otomatis mengupdate status pembayaran PO terkait',
      'Export data pembayaran',
    ],
    access: ['OWNER', 'FINANCE'],
  },
  {
    id: 'procurement',
    title: 'Procurement — Monitoring',
    icon: BarChart3,
    color: 'text-orange-400',
    path: '/procurement?tab=monitor',
    overview: 'Tab monitoring di Procurement untuk memantau performa pembelian, outstanding PO, dan statistik vendor dari satu tempat.',
    features: [
      'Ringkasan total PO aktif dan nilai pembelian',
      'Grafik tren pembelian per periode',
      'PO yang sudah jatuh tempo atau overdue',
      'Top vendor berdasarkan volume pembelian',
      'Terintegrasi dengan tab Purchase Orders, Vendor, dan Pembayaran Vendor',
    ],
    access: ['OWNER', 'FINANCE'],
  },
  {
    id: 'finance',
    title: 'Keuangan — Wallet & Ledger',
    icon: Wallet,
    color: 'text-violet-400',
    path: '/finance',
    overview: 'Buku besar keuangan operasional. Mencatat semua transaksi pemasukan dan pengeluaran kas/bank perusahaan dengan kategori yang dapat dikustom.',
    features: [
      'Saldo wallet (kas/bank) real-time',
      'Tambah transaksi Beban/Pendapatan/Transfer/Modal dengan berbagai tipe',
      'Kategori transaksi dapat dicari dan dipilih dari dropdown (dapat ditambah custom)',
      'Kategori pemasaran yang dikenali sistem ROAS: Iklan Shopee, Iklan TikTok, Biaya Ongkir Sample, dll.',
      'Filter ledger berdasarkan tipe transaksi dan wallet',
      'Export data ledger ke CSV',
    ],
    access: ['OWNER', 'FINANCE'],
  },
  {
    id: 'payouts',
    title: 'Keuangan — Payout',
    icon: TrendingUp,
    color: 'text-violet-400',
    path: '/payouts',
    overview: 'Pencatatan distribusi profit atau payout kepada pemilik/investor. Merekam riwayat pembagian hasil usaha.',
    features: [
      'Daftar payout yang telah dilakukan',
      'Tambah payout baru dengan nominal dan deskripsi',
      'Riwayat lengkap distribusi profit',
    ],
    access: ['OWNER', 'FINANCE'],
  },
  {
    id: 'utang-piutang',
    title: 'Keuangan — Utang & Piutang',
    icon: CreditCard,
    color: 'text-violet-400',
    path: '/utang-piutang',
    overview: 'Manajemen hutang (kewajiban bayar) dan piutang (tagihan ke pelanggan). Melacak outstanding dan status pelunasan.',
    features: [
      'Daftar utang belum terbayar dengan detail vendor/pihak ketiga',
      'Daftar piutang dari pelanggan dengan due date',
      'Rekam pelunasan sebagian maupun penuh',
      'Filter berdasarkan tipe (Utang/Piutang) dan status',
      'Update status otomatis saat dilunasi',
    ],
    access: ['OWNER', 'FINANCE'],
  },
  {
    id: 'reports',
    title: 'Keuangan — Laporan',
    icon: BarChart3,
    color: 'text-violet-400',
    path: '/reports',
    overview: 'Laporan keuangan dan operasional untuk analisis bisnis. Menyediakan ringkasan P&L sederhana dan rekap transaksi per periode.',
    features: [
      'Laporan laba rugi periode tertentu',
      'Rekap pendapatan vs pengeluaran',
      'Grafik arus kas',
      'Export laporan ke PDF/CSV',
    ],
    access: ['OWNER', 'FINANCE'],
  },
  {
    id: 'crm',
    title: 'CRM (Customer)',
    icon: Users,
    color: 'text-pink-400',
    path: '/crm',
    overview: 'Manajemen data pelanggan. Menyimpan informasi kontak, riwayat pembelian, dan segmentasi pelanggan untuk keperluan follow-up.',
    features: [
      'Daftar pelanggan dengan pencarian',
      'Detail pelanggan: kontak, alamat, total pembelian',
      'Tambah dan edit data pelanggan',
      'Riwayat pesanan per pelanggan',
    ],
    access: ['OWNER', 'FINANCE'],
  },
  {
    id: 'suggest-revision',
    title: 'Suggest Revision',
    icon: MessageSquarePlus,
    color: 'text-pink-400',
    path: '/suggest-revision',
    overview: 'Papan masukan internal untuk mencatat bug, ide revisi, dan request improvement. Mendukung lampiran screenshot langsung dari clipboard.',
    features: [
      'Tambah saran revisi dengan judul dan deskripsi',
      'Paste screenshot langsung ke form dengan CTRL+V',
      'Tandai revisi sebagai pending atau completed',
      'Preview gambar dalam lightbox',
      'Hapus item revisi yang sudah tidak relevan',
    ],
    access: ['OWNER', 'FINANCE', 'STAFF', 'EXTERNAL'],
  },
  {
    id: 'alerts',
    title: 'Alerts',
    icon: AlertTriangle,
    color: 'text-red-400',
    path: '/alerts',
    overview: 'Pusat notifikasi dan peringatan sistem. Menampilkan peringatan stok kritis, PO overdue, piutang jatuh tempo, dan anomali lainnya.',
    features: [
      'Daftar semua alert aktif yang belum ditangani',
      'Kategori alert: Stok, Keuangan, Pengiriman, Sistem',
      'Tandai alert sebagai selesai/diabaikan',
      'Filter berdasarkan kategori dan prioritas',
    ],
    access: ['OWNER', 'FINANCE'],
  },
  {
    id: 'owner-room',
    title: 'Owner Room',
    icon: Shield,
    color: 'text-emerald-400',
    path: '/owner-room',
    overview: 'Area eksklusif OWNER untuk administrasi sistem. Mengelola akun pengguna, melihat audit log aktivitas, dan melakukan backup data.',
    features: [
      'Tab Users: Tambah, edit, aktifkan/nonaktifkan user, ganti role',
      'Tab Audit Log: Riwayat semua aksi yang dilakukan di sistem (filter per entity)',
      'Tab Backup Data: Download backup JSON untuk berbagai entity data',
      'Role yang didukung: OWNER, FINANCE, STAFF, EXTERNAL',
    ],
    access: ['OWNER'],
  },
]

const ROLE_COLORS: Record<string, string> = {
  OWNER: 'bg-emerald-900/40 text-emerald-400 border-emerald-800',
  FINANCE: 'bg-blue-900/40 text-blue-400 border-blue-800',
  STAFF: 'bg-zinc-800 text-zinc-400 border-zinc-700',
  EXTERNAL: 'bg-purple-900/40 text-purple-400 border-purple-800',
}

const CATEGORY_GROUPS = [
  { label: 'Umum', ids: ['dashboard', 'orders', 'scan-order', 'crm', 'alerts', 'suggest-revision'] },
  { label: 'Inventori', ids: ['inventory', 'external-inventory', 'inventory-ledger', 'inventory-scan', 'stock-opname', 'master-products', 'produk-gabungan'] },
  { label: 'Procurement', ids: ['purchase-orders', 'vendors', 'vendor-payments', 'procurement'] },
  { label: 'Keuangan', ids: ['finance', 'payouts', 'utang-piutang', 'reports'] },
  { label: 'Administrasi', ids: ['owner-room'] },
]

export default function DocumentationPage() {
  const [search, setSearch] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)

  const filtered = search.trim()
    ? DOC_SECTIONS.filter(s =>
        s.title.toLowerCase().includes(search.toLowerCase()) ||
        s.overview.toLowerCase().includes(search.toLowerCase()) ||
        s.features.some(f => f.toLowerCase().includes(search.toLowerCase()))
      )
    : DOC_SECTIONS

  const activeSection = activeId ? DOC_SECTIONS.find(s => s.id === activeId) : null

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <BookOpen size={22} className="text-emerald-400" />
            Dokumentasi Sistem
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Panduan lengkap penggunaan ELYASR Management System
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md mb-6">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Cari fitur atau modul..."
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-9 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Detail Modal */}
      {activeSection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setActiveId(null)}>
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between px-6 py-5 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
                  <activeSection.icon size={20} className={activeSection.color} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">{activeSection.title}</h2>
                  <code className="text-[11px] text-zinc-500 font-mono">{activeSection.path}</code>
                </div>
              </div>
              <button onClick={() => setActiveId(null)} className="text-zinc-500 hover:text-white p-1">
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-5">
              {/* Overview */}
              <div>
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Deskripsi</h3>
                <p className="text-sm text-zinc-300 leading-relaxed">{activeSection.overview}</p>
              </div>

              {/* Access */}
              <div>
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Akses Role</h3>
                <div className="flex flex-wrap gap-2">
                  {activeSection.access.map(role => (
                    <span key={role} className={`text-xs font-medium px-2.5 py-1 rounded-full border ${ROLE_COLORS[role] || 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>
                      {role}
                    </span>
                  ))}
                </div>
              </div>

              {/* Features */}
              <div>
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Fitur & Fungsi</h3>
                <ul className="space-y-2">
                  {activeSection.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <ChevronRight size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                      <span className="text-sm text-zinc-300">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Navigate */}
              <div className="pt-2 border-t border-zinc-800">
                <a
                  href={activeSection.path}
                  className="inline-flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  <ExternalLink size={14} />
                  Buka halaman {activeSection.title}
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {search.trim() ? (
        // Search results flat list
        <div>
          <p className="text-xs text-zinc-500 mb-4">{filtered.length} hasil untuk &ldquo;{search}&rdquo;</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filtered.map(section => (
              <DocCard key={section.id} section={section} onClick={() => setActiveId(section.id)} />
            ))}
          </div>
          {filtered.length === 0 && (
            <div className="text-center py-16 text-zinc-600">
              <BookOpen size={40} className="mx-auto mb-3 opacity-30" />
              <p>Tidak ada hasil ditemukan.</p>
            </div>
          )}
        </div>
      ) : (
        // Grouped by category
        <div className="space-y-8">
          {CATEGORY_GROUPS.map(group => {
            const sections = DOC_SECTIONS.filter(s => group.ids.includes(s.id))
            return (
              <section key={group.label}>
                <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3 px-1">
                  {group.label}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {sections.map(section => (
                    <DocCard key={section.id} section={section} onClick={() => setActiveId(section.id)} />
                  ))}
                </div>
              </section>
            )
          })}

          {/* Role legend */}
          <section>
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3 px-1">
              Informasi Role Akses
            </h2>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { role: 'OWNER', desc: 'Akses penuh ke semua modul termasuk Owner Room, manajemen user, hapus data, dan laporan keuangan.' },
                  { role: 'FINANCE', desc: 'Akses ke procurement, finance room, inventori internal, CRM, alerts, dan laporan. Tidak bisa akses Owner Room.' },
                  { role: 'STAFF', desc: 'Akses terbatas ke dashboard, pesanan, scan resi, inventori operasional, dan suggest revision.' },
                  { role: 'EXTERNAL', desc: 'Saat login akan diarahkan ke halaman external inventory read-only, namun tetap bisa membuka suggest revision bila dibutuhkan.' },
                ].map(({ role, desc }) => (
                  <div key={role} className="flex items-start gap-3">
                    <span className={`text-xs font-bold px-2 py-1 rounded border shrink-0 ${ROLE_COLORS[role]}`}>{role}</span>
                    <p className="text-xs text-zinc-400 leading-relaxed">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Version info */}
          <div className="text-center py-4 border-t border-zinc-800">
            <p className="text-xs text-zinc-600">ELYASR Management System • Dokumentasi diselaraskan Mei 2026</p>
          </div>
        </div>
      )}
    </AppLayout>
  )
}

function DocCard({ section, onClick }: { section: DocSection; onClick: () => void }) {
  const Icon = section.icon
  return (
    <button
      onClick={onClick}
      className="text-left bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 hover:bg-zinc-800/50 transition-all group"
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="w-9 h-9 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 group-hover:border-zinc-600 transition-colors">
          <Icon size={18} className={section.color} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-zinc-200 group-hover:text-white transition-colors">{section.title}</p>
          <code className="text-[10px] text-zinc-600 font-mono">{section.path}</code>
        </div>
        <ChevronRight size={14} className="text-zinc-700 group-hover:text-zinc-400 transition-colors shrink-0 mt-0.5" />
      </div>
      <p className="text-xs text-zinc-500 line-clamp-2 leading-relaxed">{section.overview}</p>
      <div className="flex flex-wrap gap-1 mt-3">
        {section.access.map(role => (
          <span key={role} className={`text-[9px] font-medium px-1.5 py-0.5 rounded border ${ROLE_COLORS[role] || 'bg-zinc-800 text-zinc-500 border-zinc-700'}`}>
            {role}
          </span>
        ))}
      </div>
    </button>
  )
}
