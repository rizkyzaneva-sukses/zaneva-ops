# ELYASR Management System

Sistem manajemen operasional bisnis e-commerce multi-platform.

## Stack
- **Frontend/Backend**: Next.js 15 (App Router)
- **Database**: PostgreSQL + Prisma ORM
- **Auth**: iron-session (cookie-based)
- **UI**: TailwindCSS + custom components

---

## 🚀 Setup Lokal

### 1. Clone & Install
```bash
git clone https://github.com/rizkyzaneva-sukses/elyasr-ops.git
cd elyasr-ops
npm install
```

### 2. Environment
```bash
copy .env.example .env
# Edit .env — isi DATABASE_URL dan SESSION_SECRET
```

### 3. Database
```bash
# Jalankan PostgreSQL (atau pakai Docker)
docker-compose up db -d

# Push schema ke database
npm run db:push

# Seed initial data (admin user + wallets)
npm run db:seed
```

### 4. Jalankan dev server
```bash
npm run dev
# Buka http://localhost:3000
# Login: admin / admin123
```

---

## 🐳 Deploy ke EasyPanel (VPS)

### Step 1 — Siapkan PostgreSQL di EasyPanel
1. Buka EasyPanel → **Services** → **New Service** → **PostgreSQL**
2. Catat: host, port, user, password, database name
3. Connection string format:
   ```
   postgresql://USER:PASSWORD@HOST:PORT/DATABASE
   ```

### Step 2 — Push ke GitHub
```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/rizkyzaneva-sukses/elyasr-ops.git
git push -u origin master
```

### Step 3 — Buat App di EasyPanel
1. **New Service** → **App** → pilih **GitHub**
2. Pilih repo `elyasr-ops`
3. **Build Method**: Dockerfile
4. Set environment variables:

| Key | Value |
|-----|-------|
| `DATABASE_URL` | `postgresql://user:pass@db-host:5432/elyasr_ops` |
| `SESSION_SECRET` | Random 32+ karakter |
| `NODE_ENV` | `production` |
| `NEXT_PUBLIC_APP_NAME` | `ELYASR Business Operation` |

5. **Port**: 3000
6. Deploy!

### Step 4 — Setup Database (first time)
Setelah app running, buka terminal EasyPanel atau SSH ke VPS:
```bash
# Jalankan migrations
npx prisma migrate deploy

# Seed initial data
npm run db:seed
```

### Step 5 — Login
- URL: `https://your-domain.easypanel.host`
- Username: `admin`
- Password: `admin123`
- ⚠️ **Ganti password segera setelah login pertama!**

---

## 📋 User Roles

| Role | Akses |
|------|-------|
| OWNER | Full access semua fitur |
| FINANCE | Procurement, Finance Room, Inventori internal, CRM, Alerts, Laporan |
| STAFF | Dashboard (terbatas), Orders, Scan Resi, Inventori operasional, Suggest Revision |
| EXTERNAL | External Inventory (read-only) |

---

## 🗄️ Database Commands

```bash
# Generate Prisma client
npm run db:generate

# Push schema (dev, tanpa migration file)
npm run db:push

# Buat migration file (production)
npm run db:migrate

# Deploy migrations (production)
npm run db:migrate:prod

# Seed data awal
npm run db:seed

# Buka Prisma Studio
npm run db:studio
```

---

## 📁 Struktur Project

```
elyasr-ops/
├── prisma/
│   ├── schema.prisma      # 24 entities
│   └── seed.ts            # Initial data
├── src/
│   ├── app/
│   │   ├── api/           # API routes
│   │   ├── dashboard/     # Dashboard
│   │   ├── orders/        # Pesanan
│   │   ├── inventory/     # Stok overview
│   │   ├── external-inventory/ # Stok read-only untuk EXTERNAL
│   │   ├── inventory-scan/# Scan IN/OUT
│   │   ├── procurement/   # Tab PO, vendor, payment, monitoring
│   │   ├── scan-order/    # Scan resi kirim
│   │   ├── finance/       # Wallet & ledger
│   │   ├── master-products/# CRUD produk
│   │   ├── produk-gabungan/# Mapping SKU gabungan marketplace
│   │   ├── suggest-revision/# Board masukan & revisi
│   │   ├── documentation/ # Dokumentasi sistem
│   │   └── login/         # Halaman login
│   ├── components/
│   │   ├── layout/        # Sidebar, AppLayout
│   │   ├── ui/            # Shared UI components
│   │   └── providers.tsx  # Auth + React Query
│   └── lib/
│       ├── prisma.ts      # DB client
│       ├── session.ts     # Auth session
│       └── utils.ts       # Helpers
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

---

## 🔐 Session Secret

Generate random secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 📊 Features

- ✅ Multi-platform order management (TikTok, Shopee, Tokopedia)
- ✅ CSV import/export (Orders, Payout, Inventory)
- ✅ Barcode/SKU scan dengan beep feedback
- ✅ Real-time SOH calculation
- ✅ Procurement & Purchase Orders
- ✅ Print PO resmi dengan layout tabel adaptif
- ✅ Wallet & financial ledger
- ✅ Stock opname
- ✅ Mapping produk gabungan dari marketplace ke SKU internal
- ✅ Suggest Revision dengan paste screenshot
- ✅ External inventory read-only untuk role EXTERNAL
- ✅ Role-based access control (4 roles)
- ✅ Audit trail semua aksi penting
- ✅ Dark mode UI
