# 🚀 Panduan Deploy ELYASR Management System ke EasyPanel

Dokumen ini menjelaskan langkah-langkah lengkap untuk men-deploy aplikasi **ELYASR Management System** ke [EasyPanel](https://easypanel.io/) menggunakan Docker.

---

## 📋 Prasyarat

Sebelum memulai, pastikan Anda sudah memiliki:

- ✅ Akun & server EasyPanel yang aktif (VPS dengan Docker)
- ✅ Repository di GitHub / GitLab / Gitea (atau akses ke source code)
- ✅ Domain atau subdomain yang sudah diarahkan ke IP server EasyPanel
- ✅ Minimal RAM **1 GB** dan disk **5 GB** (rekomendasi: 2 GB RAM)

---

## 🗂️ Arsitektur Aplikasi

```
EasyPanel
├── Service: elyasr-db       → PostgreSQL 16 (database)
└── Service: elyasr-app      → Next.js App (port 3000)
```

---

## 🛠️ Langkah 1 — Siapkan Repository

Pastikan source code sudah ter-push ke GitHub (atau Git provider lainnya):

```bash
git add .
git commit -m "ready for production"
git push origin main
```

> **Penting:** File `Dockerfile` sudah ada di root project dan siap digunakan.

---

## 🐘 Langkah 2 — Buat Service Database (PostgreSQL)

1. Buka **EasyPanel Dashboard**
2. Pilih project Anda (atau buat project baru, contoh: `zaneva`)
3. Klik **"+ Add Service"** → pilih **"Postgres"**
4. Isi konfigurasi:

| Field       | Nilai                    |
|-------------|--------------------------|
| Service Name | `elyasr-db`             |
| Image        | `postgres:16-alpine`    |
| Database     | `elyasr_ops`            |
| Username     | `elyasr_user`           |
| Password     | *(buat password kuat)*  |

5. Klik **"Create"** dan tunggu hingga service running ✅

> **Catat** internal connection string-nya, biasanya:
> `postgresql://elyasr_user:PASSWORD@elyasr-db:5432/elyasr_ops`

---

## 📦 Langkah 3 — Buat Service Aplikasi (Next.js)

1. Di project yang sama, klik **"+ Add Service"** → pilih **"App"**
2. Isi konfigurasi dasar:

| Field        | Nilai                    |
|--------------|--------------------------|
| Service Name | `elyasr-app`            |
| Build Method | **Dockerfile**          |
| Port         | `3000`                  |

3. Di bagian **Source**, pilih:
   - **GitHub** (connect repo Anda)
   - Atau **Git** → masukkan URL repository
   - Branch: `master`

---

## 🔐 Langkah 4 — Konfigurasi Environment Variables

Di service `elyasr-app`, buka tab **"Environment"** dan tambahkan variabel berikut:

```env
# Database — gunakan internal hostname dari service elyasr-db
DATABASE_URL=postgresql://elyasr_user:PASSWORD_ANDA@elyasr-db:5432/elyasr_ops

# Session Secret — wajib minimal 32 karakter acak
# Generate dengan: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
SESSION_SECRET=ganti_dengan_random_string_minimal_32_karakter

# Nama Aplikasi
NEXT_PUBLIC_APP_NAME=ELYASR Business Operation

# Mode
NODE_ENV=production
```

> ⚠️ **PENTING:**
> - `DATABASE_URL` menggunakan **internal hostname** EasyPanel (nama service `elyasr-db`), bukan IP publik.
> - `SESSION_SECRET` harus unik dan minimal 32 karakter. **Jangan gunakan nilai default!**

### Cara Generate SESSION_SECRET

Jalankan perintah berikut di terminal lokal:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Salin outputnya dan gunakan sebagai nilai `SESSION_SECRET`.

---

## 🔧 Langkah 5 — Konfigurasi Build Arguments

Di service `elyasr-app`, buka tab **"Build"** → bagian **"Build Arguments"** dan tambahkan:

```
DATABASE_URL=postgresql://elyasr_user:PASSWORD_ANDA@elyasr-db:5432/elyasr_ops
SESSION_SECRET=random_secret_32_chars_minimum
NEXT_PUBLIC_APP_NAME=ELYASR Business Operation
```

> Ini diperlukan karena `Dockerfile` menggunakan `ARG` untuk proses build (`prisma generate` & `next build`).

---

## 🌐 Langkah 6 — Setup Domain

1. Di service `zaneva-app`, buka tab **"Domains"**
2. Klik **"Add Domain"**
3. Masukkan domain/subdomain Anda, contoh: `elyasr.domain-anda.com`
4. Aktifkan **HTTPS / Let's Encrypt** (centang enable SSL)
5. Pastikan DNS domain sudah mengarah ke IP server EasyPanel

---

## 🚢 Langkah 7 — Deploy!

1. Klik tombol **"Deploy"** di service `elyasr-app`
2. Pantau log build di tab **"Logs"**
3. Proses build memakan waktu **3–7 menit** (pertama kali)

### Yang Terjadi Saat Deploy:

```
Stage 1: Install dependencies (npm ci)
Stage 2: Build aplikasi (prisma generate + next build)
Stage 3: Jalankan server standalone (prisma db push + node server.js)
```

---

## ✅ Langkah 8 — Verifikasi

Setelah deploy berhasil, akses aplikasi di browser:

```
https://elyasr.domain-anda.com
```

### Login Default

Cek apakah seed database sudah berjalan. Jika perlu seed manual:

1. Buka tab **"Console"** di service `elyasr-app`
2. Jalankan:
   ```bash
   node node_modules/prisma/build/index.js db seed
   ```

---

## 🔄 Update / Re-Deploy

Setiap kali ada perubahan code:

```bash
# Push ke GitHub
git add .
git commit -m "update fitur X"
git push origin master
```

Lalu di EasyPanel:
- Klik **"Deploy"** → EasyPanel akan otomatis pull & rebuild

Atau aktifkan **Auto Deploy** di tab "General" untuk deploy otomatis setiap ada push.

---

## 🐛 Troubleshooting

### ❌ Build gagal: "prisma generate error"

Pastikan **Build Arguments** sudah diisi dengan benar, terutama `DATABASE_URL`.

### ❌ Aplikasi tidak bisa connect ke database

- Pastikan nama internal hostname di `DATABASE_URL` sama persis dengan nama service database (contoh: `elyasr-db`)
- Cek apakah service database sedang running

### ❌ Error "No space left on device"

- Bersihkan Docker images lama di server:
  ```bash
  docker system prune -af
  ```
- Pastikan disk server masih cukup (minimal 3 GB free)

### ❌ Login gagal / SESSION_SECRET error

- Pastikan `SESSION_SECRET` sudah diisi dan minimal 32 karakter
- Restart service setelah mengubah environment variable

### ❌ Halaman tidak bisa dibuka (HTTPS error)

- Pastikan DNS sudah propagate (bisa dicek di [dnschecker.org](https://dnschecker.org))
- Tunggu beberapa menit setelah aktivasi SSL

---

## 📌 Ringkasan Environment Variables

| Variable               | Wajib | Contoh Nilai                                              |
|------------------------|-------|-----------------------------------------------------------|
| `DATABASE_URL`         | ✅    | `postgresql://elyasr_user:pass@elyasr-db:5432/elyasr_ops` |
| `SESSION_SECRET`       | ✅    | `a3f8...` (32+ karakter hex)                              |
| `NEXT_PUBLIC_APP_NAME` | ✅    | `ELYASR Business Operation`                               |
| `NODE_ENV`             | ✅    | `production`                                              |

---

## 📞 Referensi

- [EasyPanel Documentation](https://easypanel.io/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Next.js Deployment](https://nextjs.org/docs/deployment)

---

*Dokumen ini dibuat untuk project **ELYASR Management System** — versi April 2026*
