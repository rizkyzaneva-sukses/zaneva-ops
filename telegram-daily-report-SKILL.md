---
name: telegram-daily-report
description: >
  Implement an automated daily Telegram report system in a Next.js app. Use this skill
  whenever the user wants to: send scheduled Telegram messages/reports, set up cron-based
  notifications, broadcast to multiple Telegram chats or groups, or configure Telegram
  bot reporting. Always use this skill when the user mentions "laporan otomatis telegram",
  "auto report telegram", "kirim laporan ke telegram", scheduled Telegram messages, or
  any automated Telegram notification from a Next.js/Node.js backend.
---

# Telegram Daily Report — Auto Broadcast via node-cron

This skill implements a **server-side scheduled Telegram report** for Next.js apps (v13+).
No browser required — the cron runs inside the Next.js server process via `instrumentation.ts`.

## Stack assumptions
- Next.js 15 (App Router, standalone Docker output)
- Prisma + PostgreSQL
- EasyPanel / Docker deployment
- `node-cron@3` (NOT v4 — v4 uses `node:` protocol that webpack cannot bundle)

---

## 1. Install dependency

```bash
npm install node-cron@3
npm install --save-dev @types/node-cron
```

---

## 2. Prisma Schema

Add these two models to `prisma/schema.prisma`:

```prisma
model TelegramRecipient {
  id        String   @id @default(cuid())
  name      String
  chatId    String   @unique @map("chat_id")
  threadId  String?  @map("thread_id")   // ← Group Topics support (selalu sertakan)
  isActive  Boolean  @default(true) @map("is_active")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  @@map("telegram_recipients")
}

model ReportSchedule {
  id           String   @id @default(cuid())
  cronSchedule String   @default("30 17 * * *") @map("cron_schedule")
  isActive     Boolean  @default(true) @map("is_active")
  updatedAt    DateTime @updatedAt @map("updated_at")
  @@map("report_schedules")
}
```

> **Catatan `threadId`:** Field ini selalu disertakan secara default karena mendukung
> Telegram Group Topics. Jika tidak digunakan (chat biasa / grup tanpa topic), biarkan kosong/null.

---

## 3. next.config.js

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  serverExternalPackages: ['@prisma/client', 'bcryptjs', 'node-cron'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      const existing = Array.isArray(config.externals) ? config.externals : []
      config.externals = [...existing, 'node-cron']
    }
    return config
  },
  // Jangan tambahkan experimental.instrumentationHook — tidak perlu di Next.js 15
}
module.exports = nextConfig
```

---

## 4. src/instrumentation.ts

> **PENTING:** Guard dengan `=== 'edge'` bukan `=== 'nodejs'`.
> Di standalone Docker, `NEXT_RUNTIME` sering `undefined` — bukan `'nodejs'`.

```typescript
export async function register() {
  // Hanya jalankan di Node.js runtime (bukan Edge)
  if (process.env.NEXT_RUNTIME === 'edge') return

  const nodeCron = await import('node-cron')
  const { buildDailyReport } = await import('@/lib/daily-report')
  const { broadcastTelegramReport } = await import('@/lib/telegram')
  const { prisma } = await import('@/lib/prisma')

  async function getSchedule() {
    try {
      const row = await prisma.reportSchedule.findFirst()
      if (!row) return { hour: 17, minute: 30, isActive: true }
      const [, minuteStr, hourStr] = row.cronSchedule.split(' ')
      return {
        hour: parseInt(hourStr),
        minute: parseInt(minuteStr),
        isActive: row.isActive,
      }
    } catch {
      return { hour: 17, minute: 30, isActive: true }
    }
  }

  let lastSentDate: string | null = null

  // Cek setiap menit
  nodeCron.schedule('* * * * *', async () => {
    try {
      const { hour, minute, isActive } = await getSchedule()
      if (!isActive) return

      const nowJkt = new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })
      const d = new Date(nowJkt)
      const today = d.toLocaleDateString('en-CA')

      if (lastSentDate === today) return
      if (d.getHours() !== hour || d.getMinutes() !== minute) return

      lastSentDate = today
      console.log('[cron] Mengirim laporan harian...')
      const report = await buildDailyReport()
      const { sent, failed } = await broadcastTelegramReport(report)
      console.log(`[cron] Laporan terkirim: ${sent} sukses, ${failed} gagal`)
    } catch (err) {
      console.error('[cron] Error:', err)
    }
  }, { timezone: 'Asia/Jakarta' })

  console.log('[cron] Scheduler laporan harian aktif ✅')
}
```

---

## 5. src/lib/telegram.ts

Mendukung multi-recipient dan **Group Topics** via `message_thread_id`:

```typescript
import { prisma } from '@/lib/prisma'

async function getSetting(key: string): Promise<string | null> {
  try {
    const r = await prisma.appSetting.findUnique({ where: { key } })
    return r?.value ?? null
  } catch { return null }
}

async function getBotToken(): Promise<string | null> {
  return (await getSetting('telegram_bot_token')) || process.env.TELEGRAM_BOT_TOKEN || null
}

async function sendToChat(
  botToken: string,
  chatId: string,
  text: string,
  threadId?: string | null   // ← selalu sertakan parameter ini
): Promise<void> {
  const payload: Record<string, unknown> = { chat_id: chatId, text, parse_mode: 'HTML' }

  // Group Topics: kirim ke topik spesifik dalam supergroup
  if (threadId) payload.message_thread_id = Number(threadId)

  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Telegram error ${res.status}: ${body}`)
  }
}

export async function broadcastTelegramReport(text: string): Promise<{ sent: number; failed: number }> {
  const botToken = await getBotToken()
  if (!botToken) {
    console.error('[telegram] Bot token belum dikonfigurasi')
    return { sent: 0, failed: 1 }
  }

  let recipients: { chatId: string; name: string; threadId?: string | null }[] = []
  try {
    const rows = await prisma.telegramRecipient.findMany({ where: { isActive: true } })
    recipients = rows.map(r => ({ chatId: r.chatId, name: r.name, threadId: r.threadId }))
  } catch { /* tabel belum ada — gunakan fallback */ }

  // Fallback ke AppSetting / env jika tabel kosong
  if (recipients.length === 0) {
    const fallbackId = (await getSetting('telegram_chat_id')) || process.env.TELEGRAM_CHAT_ID
    if (!fallbackId) {
      console.error('[telegram] Tidak ada recipient aktif dan Chat ID fallback tidak ditemukan')
      return { sent: 0, failed: 1 }
    }
    recipients = [{ chatId: fallbackId, name: 'Default' }]
  }

  let sent = 0, failed = 0
  for (const r of recipients) {
    try {
      await sendToChat(botToken, r.chatId, text, r.threadId)
      sent++
      console.log(`[telegram] ✅ Terkirim ke ${r.name} (${r.chatId}${r.threadId ? '/topic:' + r.threadId : ''})`)
    } catch (err: any) {
      failed++
      console.error(`[telegram] ❌ Gagal ke ${r.name}: ${err.message}`)
    }
  }
  return { sent, failed }
}

export async function sendTelegramTest(chatId: string, text: string, threadId?: string | null): Promise<void> {
  const botToken = await getBotToken()
  if (!botToken) throw new Error('Bot token belum dikonfigurasi')
  await sendToChat(botToken, chatId, text, threadId)
}
```

---

## 6. API Routes

### GET + POST `/api/settings/telegram-recipients/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

async function requireOwner() {
  const s = await getSession()
  return s.isLoggedIn && s.userRole === 'OWNER' ? s : null
}

export async function GET() {
  if (!await requireOwner()) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  const rows = await prisma.telegramRecipient.findMany({ orderBy: { createdAt: 'asc' } })
  return NextResponse.json({ success: true, data: rows })
}

export async function POST(req: NextRequest) {
  if (!await requireOwner()) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  const { name, chatId, threadId } = await req.json()  // threadId opsional

  if (!name?.trim() || !chatId?.trim())
    return NextResponse.json({ success: false, error: 'Name dan Chat ID wajib diisi' }, { status: 400 })

  const existing = await prisma.telegramRecipient.findUnique({ where: { chatId: chatId.trim() } })
  if (existing)
    return NextResponse.json({ success: false, error: 'Chat ID sudah terdaftar' }, { status: 409 })

  const row = await prisma.telegramRecipient.create({
    data: {
      name: name.trim(),
      chatId: chatId.trim(),
      threadId: threadId?.trim() || null,  // simpan null jika kosong
    },
  })
  return NextResponse.json({ success: true, data: row }, { status: 201 })
}
```

### PATCH + DELETE `/api/settings/telegram-recipients/[id]/route.ts`

> Next.js 15: params adalah `Promise` — wajib `await ctx.params`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

type RouteContext = { params: Promise<{ id: string }> }

async function requireOwner() {
  const s = await getSession()
  return s.isLoggedIn && s.userRole === 'OWNER' ? s : null
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  if (!await requireOwner()) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const body = await req.json()
  const row = await prisma.telegramRecipient.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.chatId !== undefined && { chatId: body.chatId.trim() }),
      ...(body.threadId !== undefined && { threadId: body.threadId?.trim() || null }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
    },
  })
  return NextResponse.json({ success: true, data: row })
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  if (!await requireOwner()) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  await prisma.telegramRecipient.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
```

---

## 7. UI Form — Field Thread ID

Saat membuat form tambah recipient, **selalu sertakan field Thread ID** sebagai opsional:

```tsx
{/* Chat ID */}
<input
  placeholder="Chat ID (contoh: -1001234567890)"
  value={chatId}
  onChange={e => setChatId(e.target.value)}
/>

{/* Thread ID — untuk Group Topics */}
<input
  placeholder="Thread/Topic ID (opsional, untuk Group Topics)"
  value={threadId}
  onChange={e => setThreadId(e.target.value)}
/>
<p className="text-xs text-muted-foreground">
  Kosongkan jika bukan Group Topic. Lihat cara mendapatkan Thread ID di bawah.
</p>
```

---

## 8. Cara Mendapatkan Thread ID (Group Topics)

Telegram Supergroup dengan fitur **Topics/Forum** menggunakan `message_thread_id`.

### Cara 1 — Copy Link dari aplikasi Telegram
1. Buka grup → masuk ke topik yang diinginkan
2. Klik kanan (desktop) atau tekan lama (mobile) pada salah satu pesan di topik → **Copy Link**
3. URL formatnya: `https://t.me/c/1234567890/42`
   - `1234567890` = ID grup (tanpa `-100`)
   - `42` = **Thread ID** ← gunakan angka ini

> Chat ID lengkap = `-100` + ID grup → `-1001234567890`

### Cara 2 — Web Telegram
1. Buka [web.telegram.org](https://web.telegram.org) → masuk ke topik
2. Lihat URL di browser: `#-1001234567890_42`
   - Angka setelah `_` adalah **Thread ID** (`42`)

### Cara 3 — Bot API
Kirim pesan ke topik, lalu lihat respons `getUpdates`:
```json
"message": {
  "message_thread_id": 42,
  "chat": { "id": -1001234567890 }
}
```

### Tabel ringkasan

| Tipe Chat | Chat ID | Thread ID |
|-----------|---------|-----------|
| Chat pribadi | ID user (positif) | — |
| Grup biasa | ID grup (negatif) | — |
| Supergroup | `-100...` (negatif) | — |
| Supergroup + Topics | `-100...` (negatif) | ID topik (angka kecil) |

---

## 9. package.json scripts

```json
{
  "scripts": {
    "build": "prisma generate && next build",
    "start": "prisma db push --accept-data-loss && next start"
  }
}
```

> **`prisma db push` di `start`**, bukan `build` — Docker build tidak punya akses DB.

---

## 10. Environment Variables

```env
TELEGRAM_BOT_TOKEN=123456789:AABBCCdd...   # bot token dari @BotFather
TELEGRAM_CHAT_ID=-1001234567890            # fallback jika tabel TelegramRecipient kosong
DATABASE_URL=postgresql://...
```

Bot token dan Chat ID bisa juga disimpan di tabel `AppSetting` dengan key
`telegram_bot_token` dan `telegram_chat_id` — ini lebih prioritas dari env.

---

## Common Pitfalls

| Masalah | Penyebab | Solusi |
|---------|----------|--------|
| Scheduler tidak jalan | `NEXT_RUNTIME === 'nodejs'` di standalone Docker | Ganti guard: `if (process.env.NEXT_RUNTIME === 'edge') return` |
| Build error "prisma db push" | Dijalankan saat build, tidak ada koneksi DB | Pindahkan ke script `start` |
| Params error Next.js 15 | `{ params: { id } }` tidak valid | Gunakan `{ params: Promise<{id}> }` + `await ctx.params` |
| Pesan tidak masuk ke topik | `threadId` kosong atau salah | Pastikan angka thread ID benar dan bot adalah member grup |
| Bot tidak bisa kirim ke topik | Bot bukan admin/member | Tambahkan bot ke grup, beri izin kirim pesan |
| `message_thread_id` error | Topic sudah dihapus | Hapus thread ID atau buat topic baru |
