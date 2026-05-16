'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useState } from 'react'
import {
  BookOpen, LayoutDashboard, ShoppingCart, Package, ScanLine,
  Wallet, Users, Shield, ClipboardCheck, Building2, CreditCard,
  BarChart3, TrendingUp, AlertTriangle, FileText, Database,
  Store, MessageSquarePlus, Megaphone, GitMerge, Brain,
  ChevronDown, ChevronRight, CheckCircle2, Clock, Zap,
  ArrowRight, Star, Info, Boxes, Receipt, PiggyBank,
  Landmark, PackageSearch, Truck, BadgeCheck, CircleDot,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

type RoleKey = 'OWNER' | 'FINANCE' | 'STAFF' | 'EXTERNAL'

interface WorkflowStep {
  time?: string
  title: string
  desc: string
  path?: string
  icon: React.ElementType
  tips?: string[]
}

interface Module {
  icon: React.ElementType
  color: string
  title: string
  path: string
  desc: string
  keyActions: string[]
}

interface RoleData {
  key: RoleKey
  label: string
  color: string
  bg: string
  border: string
  ring: string
  tagline: string
  description: string
  dailyWorkflow: WorkflowStep[]
  weeklyTasks: string[]
  modules: Module[]
  importantNotes: string[]
}

// ─── Role Data ────────────────────────────────────────────────────────────────

const ROLES: RoleData[] = [
  // ══════════════════════════════════════════════════════════ OWNER
  {
    key: 'OWNER',
    label: 'Owner',
    color: 'text-emerald-400',
    bg: 'bg-emerald-900/30',
    border: 'border-emerald-700',
    ring: 'ring-emerald-500/30',
    tagline: 'Akses penuh ke semua modul',
    description:
      'Owner memiliki akses ke seluruh sistem tanpa batasan — dari laporan keuangan, manajemen user, hingga AI Insights. Bertanggung jawab atas keputusan strategis bisnis berdasarkan data real-time.',

    dailyWorkflow: [
      {
        time: '08.00',
        icon: LayoutDashboard,
        title: 'Buka Dashboard',
        path: '/dashboard',
        desc: 'Lihat KPI utama hari ini: Omzet, Gross Profit, Stok Kritis, dan Aging Backlog. Ganti filter ke "Hari Ini" untuk data terkini. Pantau ROAS per platform (Shopee/TikTok).',
        tips: ['Jika Backlog >48 Jam merah → segera koordinasi tim gudang', 'ROAS < 2x → evaluasi spending iklan platform tersebut'],
      },
      {
        time: '08.15',
        icon: AlertTriangle,
        title: 'Cek Alerts',
        path: '/alerts',
        desc: 'Buka halaman Alerts untuk lihat stok habis, stok kritis, dan order pending terlalu lama. Tindaki sesuai prioritas — buat PO jika stok hampir habis.',
        tips: ['Klik "Buat PO" langsung dari alert stok kritis untuk lanjut ke Procurement'],
      },
      {
        time: '08.30',
        icon: ShoppingCart,
        title: 'Review Pesanan Baru',
        path: '/orders',
        desc: 'Filter pesanan dengan status "Perlu Dikirim". Pastikan tidak ada order yang stuck tanpa resi. Untuk pesanan bermasalah, edit langsung dari halaman ini.',
        tips: ['Gunakan filter Platform untuk focus per marketplace', 'Bulk delete duplikat import jika ada'],
      },
      {
        time: '09.00',
        icon: Wallet,
        title: 'Pantau Saldo & Finance',
        path: '/finance',
        desc: 'Cek saldo wallet aktif. Lihat apakah ada payout marketplace yang masuk hari ini (tab Payout). Jika ada pengeluaran operasional, catat di Wallet & Ledger.',
        tips: ['Tab Budget Iklan → catat spending iklan harian per platform', 'Utang jatuh tempo muncul di tab Utang & Piutang'],
      },
      {
        time: '17.00',
        icon: Brain,
        title: 'Cek Laporan Harian (Telegram)',
        path: '/owner-room',
        desc: 'Laporan harian otomatis dikirim via Telegram setiap sore. Lihat ringkasan omzet, profit, stok kritis, dan order pending. Bisa juga tanya langsung ke bot Telegram.',
        tips: ['Ketik "omset hari ini" atau "stok kritis" ke bot Telegram', 'Bot bisa jawab pertanyaan tanggal spesifik, misal "omset 1-5 Mei"'],
      },
    ],

    weeklyTasks: [
      'Senin pagi: Generate AI Weekly Brief di /ai-insights → baca rekomendasi, delegasikan ke manager',
      'Review Laporan Laba Rugi (Finance → Laporan) — pastikan margin sesuai target',
      'Cek ROAS per platform di Dashboard → evaluasi alokasi budget iklan minggu depan',
      'Review outstanding PO di Procurement → follow up vendor yang terlambat',
      'Audit Log (Owner Room) → spot-check aktivitas user jika ada yang mencurigakan',
      'Backup data mingguan via Owner Room → Tab Backup Data',
    ],

    modules: [
      {
        icon: LayoutDashboard, color: 'text-emerald-400',
        title: 'Dashboard', path: '/dashboard',
        desc: 'Ringkasan KPI real-time bisnis.',
        keyActions: ['Filter tanggal fleksibel (Hari ini, Minggu, Bulan)', 'ROAS per platform otomatis', 'Aging backlog visual', 'Top Provinsi & Kota'],
      },
      {
        icon: ShoppingCart, color: 'text-blue-400',
        title: 'Pesanan', path: '/orders',
        desc: 'Manajemen order dari semua marketplace.',
        keyActions: ['Import CSV TikTok/Shopee', 'Edit & hapus order (Owner only)', 'Bulk delete', 'Export ke CSV'],
      },
      {
        icon: ScanLine, color: 'text-cyan-400',
        title: 'Scan Resi', path: '/scan-order',
        desc: 'Verifikasi pengiriman via scan barcode.',
        keyActions: ['Scan barcode / kamera', 'Deteksi duplikat otomatis', 'Bulk upload CSV resi', 'Riwayat scan harian'],
      },
      {
        icon: Package, color: 'text-yellow-400',
        title: 'Inventori', path: '/inventory',
        desc: 'Stok overview, ledger, scan, opname, master produk.',
        keyActions: ['SOH real-time per SKU', 'Scan masuk/keluar/endorsement', 'Stock opname & adjustment', 'Master produk & ROP'],
      },
      {
        icon: GitMerge, color: 'text-yellow-400',
        title: 'Produk Gabungan', path: '/produk-gabungan',
        desc: 'Mapping SKU marketplace ke SKU internal.',
        keyActions: ['Tambah/edit mapping bundle', 'Import massal dari Excel', 'Otomatis split saat import order'],
      },
      {
        icon: FileText, color: 'text-orange-400',
        title: 'Procurement', path: '/procurement',
        desc: 'PO, vendor, dan pembayaran supplier.',
        keyActions: ['Buat PO ke vendor', 'Catat pembayaran', 'Monitor PO overdue', 'Print dokumen PO resmi'],
      },
      {
        icon: Wallet, color: 'text-violet-400',
        title: 'Finance Room', path: '/finance',
        desc: 'Wallet, iklan, aset, modal, payout, utang, laporan.',
        keyActions: ['Catat spending iklan per platform', 'Laporan L/R & Neraca', 'Utang & Piutang', 'Modal awal & payout'],
      },
      {
        icon: Users, color: 'text-pink-400',
        title: 'CRM', path: '/crm',
        desc: 'Manajemen data pelanggan.',
        keyActions: ['Riwayat pembelian per pelanggan', 'Segmentasi pelanggan', 'Tambah & edit kontak'],
      },
      {
        icon: AlertTriangle, color: 'text-red-400',
        title: 'Alerts', path: '/alerts',
        desc: 'Peringatan stok kritis & order delayed.',
        keyActions: ['Stok habis & kritis', 'Order pending >24/48 jam', 'Auto-refresh 5 menit', 'Shortcut buat PO'],
      },
      {
        icon: Brain, color: 'text-purple-400',
        title: 'AI Insights', path: '/ai-insights',
        desc: 'Analisis bisnis mingguan oleh AI.',
        keyActions: ['Weekly/Monthly review', 'Insight ROAS, stok, margin', 'Rekomendasi CEO-level', 'Snapshot data otomatis'],
      },
      {
        icon: Shield, color: 'text-emerald-400',
        title: 'Owner Room', path: '/owner-room',
        desc: 'Admin sistem eksklusif Owner.',
        keyActions: ['Manajemen user & role', 'Audit log semua aktivitas', 'Backup & restore data', 'Konfigurasi platform fee & Telegram bot'],
      },
      {
        icon: MessageSquarePlus, color: 'text-zinc-400',
        title: 'Suggest Revision', path: '/suggest-revision',
        desc: 'Papan masukan & bug report internal.',
        keyActions: ['Tambah saran dengan screenshot (CTRL+V)', 'Tandai selesai/pending', 'Akses semua role'],
      },
    ],

    importantNotes: [
      'Hanya Owner yang bisa hapus pesanan, edit harga, dan akses Owner Room',
      'AI Insights tersedia di /ai-insights — generate weekly untuk rekomendasi strategis',
      'Konfigurasi Telegram bot (chat ID, jadwal laporan) ada di Owner Room → Pengaturan',
      'Perubahan HPP & ROP produk langsung mempengaruhi kalkulasi profit di seluruh sistem',
      'Backup data sebelum import massal atau perubahan besar',
    ],
  },

  // ══════════════════════════════════════════════════════════ FINANCE
  {
    key: 'FINANCE',
    label: 'Finance',
    color: 'text-blue-400',
    bg: 'bg-blue-900/30',
    border: 'border-blue-700',
    ring: 'ring-blue-500/30',
    tagline: 'Keuangan, procurement, dan inventori operasional',
    description:
      'Finance mengelola seluruh arus kas perusahaan — dari pencatatan transaksi harian, pengelolaan PO vendor, hingga laporan keuangan bulanan. Akses ke inventori dan pesanan untuk keperluan rekonsiliasi.',

    dailyWorkflow: [
      {
        time: '08.00',
        icon: LayoutDashboard,
        title: 'Pantau Dashboard',
        path: '/dashboard',
        desc: 'Lihat total omzet, saldo wallet, dan status payout. Filter "Hari Ini" untuk data terkini. Catat anomali yang perlu ditindaklanjuti.',
        tips: ['Bandingkan omzet hari ini vs kemarin untuk deteksi penurunan signifikan'],
      },
      {
        time: '08.30',
        icon: Wallet,
        title: 'Catat Transaksi Harian',
        path: '/finance',
        desc: 'Buka Finance → Wallet & Ledger. Catat semua pengeluaran operasional (bayar kurir, supplies, dll) dan pemasukan yang belum tercatat. Pastikan saldo wallet sesuai rekening fisik.',
        tips: ['Gunakan kategori yang tepat agar masuk L/R report dengan benar', 'TRANSFER antar wallet tidak mengurangi total saldo'],
      },
      {
        time: '09.00',
        icon: Megaphone,
        title: 'Catat Spending Iklan',
        path: '/finance?tab=iklan',
        desc: 'Finance → Budget Iklan → mode "Catat Spending". Pilih platform (TikTok/Shopee), masukkan tanggal dan nominal spending iklan hari ini. ROAS otomatis terupdate di Dashboard.',
        tips: ['Jika isi ulang saldo iklan, gunakan mode "Deposit/Top-up" pilih sumber dana', 'Lakukan ini setiap hari agar ROAS akurat'],
      },
      {
        time: '09.30',
        icon: FileText,
        title: 'Cek PO & Pembayaran Vendor',
        path: '/procurement',
        desc: 'Procurement → Monitor → lihat PO yang sudah jatuh tempo atau hampir due. Jika ada pembayaran yang harus dilakukan, catat di tab Pembayaran Vendor.',
        tips: ['PO status "Partial" = barang sudah diterima sebagian, pastikan bayar sesuai yang diterima'],
      },
      {
        time: '10.00',
        icon: AlertTriangle,
        title: 'Cek Alerts Stok',
        path: '/alerts',
        desc: 'Pantau stok kritis dan habis. Koordinasi dengan tim gudang untuk konfirmasi stok fisik sebelum buat PO baru.',
        tips: ['Klik "Buat PO" dari alert untuk langsung ke form PO baru', 'Cek dulu SOH di Inventori sebelum buat PO besar'],
      },
      {
        time: '16.00',
        icon: Receipt,
        title: 'Rekonsiliasi Payout',
        path: '/finance?tab=payout',
        desc: 'Finance → Payout → cek payout marketplace yang masuk hari ini. Pastikan jumlah sesuai dengan settlement dari TikTok/Shopee. Catat di Wallet & Ledger jika belum masuk.',
        tips: ['Payout Shopee biasanya D+2 setelah pesanan terkirim', 'Bandingkan dengan laporan settlement dari seller center'],
      },
    ],

    weeklyTasks: [
      'Rekonsiliasi total ledger vs saldo rekening bank fisik',
      'Review Laporan Laba Rugi (Finance → Laporan) — presentasikan ke Owner setiap Senin',
      'Cek utang vendor yang jatuh tempo minggu ini (Finance → Utang & Piutang)',
      'Review piutang yang belum terbayar lebih dari 7 hari',
      'Export data transaksi mingguan untuk arsip keuangan',
      'Verifikasi seluruh PO yang sudah received telah dicatat dengan benar',
    ],

    modules: [
      {
        icon: LayoutDashboard, color: 'text-emerald-400',
        title: 'Dashboard', path: '/dashboard',
        desc: 'Pantau KPI keuangan real-time.',
        keyActions: ['Filter periode (hari/minggu/bulan)', 'ROAS platform', 'Saldo wallet snapshot', 'Payout terkini'],
      },
      {
        icon: ShoppingCart, color: 'text-blue-400',
        title: 'Pesanan', path: '/orders',
        desc: 'Lihat & rekonsiliasi data pesanan.',
        keyActions: ['Filter per platform & status', 'Export CSV untuk rekonsiliasi', 'Lihat real omzet & HPP per order'],
      },
      {
        icon: ScanLine, color: 'text-cyan-400',
        title: 'Scan Resi', path: '/scan-order',
        desc: 'Verifikasi pengiriman.',
        keyActions: ['Scan manual/kamera', 'Bulk upload CSV resi', 'Riwayat scan harian'],
      },
      {
        icon: Package, color: 'text-yellow-400',
        title: 'Inventori', path: '/inventory',
        desc: 'Stok overview & ledger mutasi.',
        keyActions: ['SOH per SKU', 'Ledger mutasi (IN/OUT)', 'Stock opname', 'Master produk & HPP'],
      },
      {
        icon: GitMerge, color: 'text-yellow-400',
        title: 'Produk Gabungan', path: '/produk-gabungan',
        desc: 'Mapping SKU marketplace.',
        keyActions: ['Tambah/edit mapping bundle', 'Import dari Excel', 'Preview split SKU'],
      },
      {
        icon: FileText, color: 'text-orange-400',
        title: 'Procurement', path: '/procurement',
        desc: 'PO, vendor, dan pembayaran.',
        keyActions: ['Buat & track PO', 'Catat pembayaran vendor', 'Monitor overdue PO', 'Manajemen data vendor'],
      },
      {
        icon: Wallet, color: 'text-violet-400',
        title: 'Finance Room', path: '/finance',
        desc: 'Keuangan lengkap (kecuali Modal Awal).',
        keyActions: ['Wallet & Ledger harian', 'Budget Iklan per platform', 'Aset Tetap & depresiasi', 'Payout, Utang/Piutang, Laporan'],
      },
      {
        icon: Users, color: 'text-pink-400',
        title: 'CRM', path: '/crm',
        desc: 'Data pelanggan & riwayat pembelian.',
        keyActions: ['Cari pelanggan', 'Lihat riwayat order', 'Data kontak & alamat'],
      },
      {
        icon: AlertTriangle, color: 'text-red-400',
        title: 'Alerts', path: '/alerts',
        desc: 'Peringatan stok & order.',
        keyActions: ['Stok habis/kritis', 'Order delayed >48 jam', 'Shortcut buat PO'],
      },
      {
        icon: MessageSquarePlus, color: 'text-zinc-400',
        title: 'Suggest Revision', path: '/suggest-revision',
        desc: 'Laporan bug & saran sistem.',
        keyActions: ['Tambah masukan + screenshot', 'Tandai selesai'],
      },
    ],

    importantNotes: [
      'Finance tidak bisa hapus pesanan atau edit harga — hubungi Owner jika ada koreksi',
      'Catat spending iklan SETIAP HARI agar ROAS di dashboard akurat',
      'Kategori transaksi mempengaruhi Laporan L/R — pilih kategori dengan benar',
      'PO hanya bisa dihapus oleh Owner; Finance bisa request delete melalui Suggest Revision',
      'Modal Awal di Finance Room hanya bisa diakses Owner',
    ],
  },

  // ══════════════════════════════════════════════════════════ STAFF
  {
    key: 'STAFF',
    label: 'Staff',
    color: 'text-zinc-300',
    bg: 'bg-zinc-800/60',
    border: 'border-zinc-600',
    ring: 'ring-zinc-500/30',
    tagline: 'Operasional harian: pesanan, gudang, dan pengiriman',
    description:
      'Staff mengelola operasional harian di gudang dan pengiriman. Fokus pada verifikasi resi, mutasi stok masuk/keluar, dan memantau pesanan yang perlu dikirim. Tidak memiliki akses ke data keuangan.',

    dailyWorkflow: [
      {
        time: '08.00',
        icon: LayoutDashboard,
        title: 'Cek Dashboard Backlog',
        path: '/dashboard',
        desc: 'Lihat Aging Backlog — berapa order yang perlu dikirim dan sudah berapa lama pending. Prioritaskan yang masuk bucket >24 jam atau >48 jam.',
        tips: ['Fokus ke bagian "Backlog Pengiriman" di Dashboard', 'Order >48 jam harus segera diproses atau dilaporkan ke atasan'],
      },
      {
        time: '08.15',
        icon: ShoppingCart,
        title: 'Cek Pesanan Perlu Dikirim',
        path: '/orders',
        desc: 'Filter pesanan dengan status "Perlu Dikirim". Cetak atau catat daftar order yang harus dikirim hari ini. Koordinasi dengan kurir/ekspedisi.',
        tips: ['Gunakan filter Platform untuk pisahkan order Shopee dan TikTok', 'Cari berdasarkan No. Order atau nama pembeli jika ada pertanyaan'],
      },
      {
        time: '09.00',
        icon: Boxes,
        title: 'Catat Barang Masuk (Gudang)',
        path: '/inventory-scan',
        desc: 'Ketika barang dari supplier tiba: buka Inventori → Scan Masuk/Keluar → tab "Scan Masuk". Scan atau ketik SKU satu per satu, atur qty, lalu COMMIT batch. Stok otomatis bertambah.',
        tips: ['Scan SKU dari barcode di dus/kemasan produk', 'Cek PO terlebih dahulu untuk verifikasi qty yang seharusnya datang', 'Jangan commit sebelum semua item selesai di-scan'],
      },
      {
        time: '10.00',
        icon: Truck,
        title: 'Scan Resi Pengiriman',
        path: '/scan-order',
        desc: 'Setelah paket diserahkan ke kurir, scan setiap resi di halaman Scan Resi. Ini memperbarui status order menjadi terkirim dan tercatat di sistem.',
        tips: ['Gunakan mode kamera untuk scan lebih cepat', 'Sistem berbunyi 1x (sukses), 2x (duplikat), 3x (tidak ditemukan)', 'Upload CSV jika resi banyak — format: No. Resi, Tanggal'],
      },
      {
        time: '11.00',
        icon: PackageSearch,
        title: 'Cek Stok Overview',
        path: '/inventory',
        desc: 'Buka Inventori → lihat produk dengan SOH rendah atau merah. Laporkan ke Finance/Owner jika ada stok yang perlu segera di-restock.',
        tips: ['SOH merah = sudah di bawah ROP → perlu PO segera', 'SOH 0 atau minus = stok habis, jangan terima order produk ini'],
      },
      {
        time: '14.00',
        icon: ScanLine,
        title: 'Catat Endorsement / Sample',
        path: '/inventory-scan',
        desc: 'Jika ada barang keluar untuk KOL/endorsement: Inventori → Scan Masuk/Keluar → tab "Endorsement". Catat produk dan qty yang keluar. Ini dicatat sebagai Beban Sample.',
        tips: ['Endorsement otomatis tercatat sebagai MARKETING keluar dari stok', 'Wajib catat agar stok fisik dan sistem selalu sinkron'],
      },
    ],

    weeklyTasks: [
      'Laporkan kondisi stok fisik yang mencurigakan (selisih) ke Finance untuk jadwal Stock Opname',
      'Pastikan semua resi minggu ini sudah di-scan (tidak ada yang terlewat)',
      'Cek riwayat scan (Global Ledger) untuk verifikasi mutasi stok minggu ini sudah benar',
      'Berikan masukan atau laporkan bug melalui Suggest Revision',
    ],

    modules: [
      {
        icon: LayoutDashboard, color: 'text-emerald-400',
        title: 'Dashboard', path: '/dashboard',
        desc: 'Pantau backlog dan status operasional.',
        keyActions: ['Aging backlog pengiriman', 'Total order per hari', 'Stok kritis count'],
      },
      {
        icon: ShoppingCart, color: 'text-blue-400',
        title: 'Pesanan', path: '/orders',
        desc: 'Lihat daftar pesanan (view only).',
        keyActions: ['Filter status & platform', 'Cari per resi/order', 'Lihat detail item & penerima'],
      },
      {
        icon: ScanLine, color: 'text-cyan-400',
        title: 'Scan Resi', path: '/scan-order',
        desc: 'Verifikasi pengiriman setelah paket dikirim.',
        keyActions: ['Scan barcode resi (kamera/manual)', 'Deteksi duplikat otomatis + suara', 'Bulk upload CSV resi', 'Histori scan hari ini'],
      },
      {
        icon: Package, color: 'text-yellow-400',
        title: 'Inventori — Stok Overview', path: '/inventory',
        desc: 'Lihat kondisi stok semua produk.',
        keyActions: ['SOH real-time per SKU', 'Indikator Aman/Kritis/Habis', 'Filter per kategori', 'Riwayat ledger per SKU'],
      },
      {
        icon: FileText, color: 'text-yellow-400',
        title: 'Inventori — Global Ledger', path: '/inventory-ledger',
        desc: 'Riwayat semua mutasi stok.',
        keyActions: ['Filter tanggal & SKU', 'Lihat IN/OUT per produk', 'Verifikasi catatan mutasi'],
      },
      {
        icon: ScanLine, color: 'text-yellow-400',
        title: 'Inventori — Scan Masuk/Keluar', path: '/inventory-scan',
        desc: 'Catat mutasi stok via scan barcode.',
        keyActions: ['Tab Scan Masuk (barang dari supplier)', 'Tab Scan Keluar (barang keluar)', 'Tab Endorsement (sample KOL)', 'Tab Retur (barang kembali)', 'Upload CSV batch'],
      },
      {
        icon: MessageSquarePlus, color: 'text-zinc-400',
        title: 'Suggest Revision', path: '/suggest-revision',
        desc: 'Laporan bug dan masukan sistem.',
        keyActions: ['Tambah masukan + paste screenshot (CTRL+V)', 'Lihat status masukan sebelumnya'],
      },
    ],

    importantNotes: [
      'Staff TIDAK memiliki akses ke data keuangan (Finance Room, Procurement, CRM)',
      'Selalu COMMIT batch scan — jangan tinggalkan batch yang belum di-submit',
      'Jika menemukan selisih stok fisik vs sistem, laporkan ke Finance untuk stock opname',
      'Scan Resi dilakukan SETELAH paket benar-benar diserahkan ke kurir, bukan sebelumnya',
      'Gunakan Suggest Revision untuk lapor bug atau minta fitur baru',
    ],
  },

  // ══════════════════════════════════════════════════════════ EXTERNAL
  {
    key: 'EXTERNAL',
    label: 'External',
    color: 'text-purple-400',
    bg: 'bg-purple-900/30',
    border: 'border-purple-700',
    ring: 'ring-purple-500/30',
    tagline: 'Akses read-only stok produk tersedia',
    description:
      'User External adalah mitra atau pihak luar yang perlu melihat ketersediaan stok produk tanpa akses ke data internal bisnis. Setelah login, otomatis diarahkan ke halaman External Inventory.',

    dailyWorkflow: [
      {
        time: '',
        icon: Store,
        title: 'Login → External Inventory',
        path: '/external-inventory',
        desc: 'Setelah login, sistem otomatis mengarahkan ke halaman External Inventory. Halaman ini menampilkan daftar produk yang masih memiliki stok tersedia.',
        tips: ['Hanya produk aktif dengan stok > 0 yang ditampilkan', 'Tidak ada data harga atau informasi internal lain'],
      },
      {
        time: '',
        icon: PackageSearch,
        title: 'Cari Produk',
        path: '/external-inventory',
        desc: 'Gunakan kolom pencarian untuk cari produk berdasarkan SKU atau nama produk. Sistem menampilkan nama produk dan jumlah stok saat ini.',
        tips: ['Cari dengan SKU untuk hasil paling akurat', 'Stok yang ditampilkan adalah data real-time dari sistem'],
      },
      {
        time: '',
        icon: MessageSquarePlus,
        title: 'Suggest Revision (jika diperlukan)',
        path: '/suggest-revision',
        desc: 'Jika ada masukan atau menemukan masalah pada halaman yang bisa diakses, bisa disampaikan melalui halaman Suggest Revision.',
        tips: ['Bisa paste screenshot langsung dengan CTRL+V'],
      },
    ],

    weeklyTasks: [
      'Tidak ada tugas mingguan khusus untuk role External',
      'Hubungi tim internal jika ada produk yang tidak terlihat di daftar stok',
    ],

    modules: [
      {
        icon: Store, color: 'text-purple-400',
        title: 'External Inventory', path: '/external-inventory',
        desc: 'Halaman stok produk read-only untuk mitra eksternal.',
        keyActions: ['Lihat daftar produk tersedia', 'Cari per SKU atau nama produk', 'Data stok real-time', 'Read-only (tidak bisa edit apapun)'],
      },
      {
        icon: MessageSquarePlus, color: 'text-zinc-400',
        title: 'Suggest Revision', path: '/suggest-revision',
        desc: 'Papan masukan dan saran.',
        keyActions: ['Tambah masukan + screenshot', 'Lihat status laporan sebelumnya'],
      },
    ],

    importantNotes: [
      'Akses External hanya bisa lihat stok — tidak bisa edit, hapus, atau tambah data apapun',
      'Harga, HPP, data keuangan, dan pesanan tidak ditampilkan ke role External',
      'Jika butuh akses lebih luas, hubungi Owner untuk perubahan role',
      'Session login berlaku selama browser aktif — logout setelah selesai di komputer bersama',
    ],
  },
]

// ─── Role colors for badges ───────────────────────────────────────────────────

const ROLE_BADGE: Record<RoleKey, string> = {
  OWNER: 'bg-emerald-900/50 text-emerald-400 border-emerald-700',
  FINANCE: 'bg-blue-900/50 text-blue-400 border-blue-700',
  STAFF: 'bg-zinc-800 text-zinc-300 border-zinc-600',
  EXTERNAL: 'bg-purple-900/50 text-purple-400 border-purple-700',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ModuleCard({ mod }: { mod: Module }) {
  const [open, setOpen] = useState(false)
  const Icon = mod.icon
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/40 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
          <Icon size={16} className={mod.color} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-zinc-200">{mod.title}</p>
          <p className="text-xs text-zinc-500 truncate">{mod.desc}</p>
        </div>
        <a
          href={mod.path}
          onClick={e => e.stopPropagation()}
          className="text-[10px] text-zinc-600 hover:text-emerald-400 transition-colors font-mono mr-2 shrink-0"
        >
          {mod.path}
        </a>
        {open ? <ChevronDown size={14} className="text-zinc-500 shrink-0" /> : <ChevronRight size={14} className="text-zinc-600 shrink-0" />}
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-zinc-800/60">
          <ul className="mt-3 space-y-1.5">
            {mod.keyActions.map((a, i) => (
              <li key={i} className="flex items-start gap-2">
                <CheckCircle2 size={12} className="text-emerald-500 shrink-0 mt-0.5" />
                <span className="text-xs text-zinc-400">{a}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function WorkflowCard({ step, index }: { step: WorkflowStep; index: number }) {
  const [open, setOpen] = useState(false)
  const Icon = step.icon
  return (
    <div className="relative flex gap-4">
      {/* Connector line */}
      <div className="flex flex-col items-center">
        <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 z-10">
          <span className="text-xs font-bold text-zinc-400">{index + 1}</span>
        </div>
        <div className="w-px flex-1 bg-zinc-800 mt-1" />
      </div>
      {/* Content */}
      <div className="flex-1 pb-4">
        <div
          className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden cursor-pointer"
          onClick={() => setOpen(o => !o)}
        >
          <div className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/40 transition-colors">
            <div className="w-7 h-7 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
              <Icon size={14} className="text-zinc-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                {step.time && (
                  <span className="text-[10px] font-mono text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded">
                    {step.time}
                  </span>
                )}
                <p className="text-sm font-semibold text-zinc-200">{step.title}</p>
              </div>
            </div>
            {step.path && (
              <a
                href={step.path}
                onClick={e => e.stopPropagation()}
                className="text-[10px] text-zinc-600 hover:text-emerald-400 font-mono transition-colors shrink-0"
              >
                {step.path}
              </a>
            )}
            {open ? <ChevronDown size={13} className="text-zinc-500 shrink-0" /> : <ChevronRight size={13} className="text-zinc-600 shrink-0" />}
          </div>
          {open && (
            <div className="px-4 pb-4 border-t border-zinc-800/60">
              <p className="text-sm text-zinc-400 leading-relaxed mt-3">{step.desc}</p>
              {step.tips && step.tips.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {step.tips.map((tip, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <Zap size={11} className="text-amber-500 shrink-0 mt-0.5" />
                      <span className="text-xs text-amber-400/80">{tip}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DocumentationPage() {
  const [activeRole, setActiveRole] = useState<RoleKey>('OWNER')
  const role = ROLES.find(r => r.key === activeRole)!

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <BookOpen size={22} className="text-emerald-400" />
            Panduan Penggunaan
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Workflow dan panduan lengkap per role — ELYASR Management System
          </p>
        </div>
      </div>

      {/* Role Tab Selector */}
      <div className="flex gap-1.5 mb-6 bg-zinc-900/60 border border-zinc-800 rounded-xl p-1.5 w-fit">
        {ROLES.map(r => (
          <button
            key={r.key}
            onClick={() => setActiveRole(r.key)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeRole === r.key
                ? `${r.bg} ${r.color} border ${r.border} shadow-sm`
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Role Hero */}
      <div className={`${role.bg} border ${role.border} rounded-2xl p-6 mb-6`}>
        <div className="flex items-start gap-4">
          <div className={`px-3 py-1.5 rounded-lg border ${ROLE_BADGE[activeRole]} text-sm font-bold shrink-0`}>
            {role.label.toUpperCase()}
          </div>
          <div>
            <p className={`font-bold text-base ${role.color}`}>{role.tagline}</p>
            <p className="text-sm text-zinc-400 mt-1 leading-relaxed max-w-2xl">{role.description}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="text-xs text-zinc-500">Modul tersedia:</span>
          {role.modules.map(m => (
            <a
              key={m.path}
              href={m.path}
              className="text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800/80 border border-zinc-700 px-2 py-0.5 rounded-md transition-colors"
            >
              {m.title}
            </a>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Left: Daily Workflow */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Clock size={14} className="text-zinc-500" />
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Workflow Harian</h2>
          </div>
          <div>
            {role.dailyWorkflow.map((step, i) => (
              <WorkflowCard key={i} step={step} index={i} />
            ))}
          </div>

          {/* Weekly Tasks */}
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-4">
              <Star size={14} className="text-zinc-500" />
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Tugas Mingguan</h2>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2.5">
              {role.weeklyTasks.map((t, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <ArrowRight size={13} className="text-emerald-600 shrink-0 mt-0.5" />
                  <span className="text-sm text-zinc-400 leading-relaxed">{t}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Important Notes */}
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-4">
              <Info size={14} className="text-zinc-500" />
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Catatan Penting</h2>
            </div>
            <div className="bg-amber-950/20 border border-amber-900/40 rounded-xl p-4 space-y-2.5">
              {role.importantNotes.map((n, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <CircleDot size={12} className="text-amber-500 shrink-0 mt-1" />
                  <span className="text-sm text-amber-200/70 leading-relaxed">{n}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Modules */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <BadgeCheck size={14} className="text-zinc-500" />
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
              Modul & Fitur ({role.modules.length})
            </h2>
          </div>
          <div className="space-y-2">
            {role.modules.map(m => (
              <ModuleCard key={m.path} mod={m} />
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-10 pt-6 border-t border-zinc-800 flex items-center justify-between">
        <p className="text-xs text-zinc-600">ELYASR Management System · Panduan diperbarui Mei 2026</p>
        <div className="flex gap-2">
          {ROLES.map(r => (
            <span key={r.key} className={`text-[10px] font-bold px-2 py-0.5 rounded border ${ROLE_BADGE[r.key]}`}>
              {r.label}
            </span>
          ))}
        </div>
      </div>
    </AppLayout>
  )
}
