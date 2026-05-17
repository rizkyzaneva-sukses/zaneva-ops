import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

// ── Helper: ambil setting dari DB ──
async function getSetting(key: string): Promise<string | null> {
  const s = await prisma.appSetting.findUnique({ where: { key } })
  return s?.value ?? null
}

// ── Helper: format rupiah ──
function fmt(n: number): string {
  return 'Rp ' + Number(n || 0).toLocaleString('id-ID')
}

// ── Helper: kirim pesan ke Telegram ──
async function sendTelegram(botToken: string, chatId: string, text: string): Promise<{ ok: boolean; description?: string }> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  })
  return res.json()
}

// ── GET: ambil data laporan + kirim Telegram (dipanggil manual atau cron) ──
// Bisa dipakai sebagai pengganti n8n. Bisa juga hit langsung dari browser (Owner only).
export async function POST(request: NextRequest) {
  // Auth — hanya Owner yang bisa trigger manual
  const session = await getSession()
  if (!session.isLoggedIn) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  if (session.userRole !== 'OWNER') return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })

  // Ambil config dari DB
  const botToken = await getSetting('telegram_bot_token')
  const chatId   = await getSetting('telegram_chat_id')

  if (!botToken || !chatId) {
    return NextResponse.json({
      success: false,
      error: 'Konfigurasi Telegram belum diisi. Masuk ke Settings → Notifikasi Telegram.',
    }, { status: 400 })
  }

  // Tanggal target
  const body = await request.json().catch(() => ({}))
  const dateParam: string | undefined = body.date

  let dateFrom: string
  if (dateParam) {
    dateFrom = dateParam
  } else {
    const nowWIB = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))
    const y = nowWIB.getFullYear()
    const m = String(nowWIB.getMonth() + 1).padStart(2, '0')
    const d = String(nowWIB.getDate()).padStart(2, '0')
    dateFrom = `${y}-${m}-${d}`
  }

  const gteDate = new Date(dateFrom + 'T00:00:00+07:00')
  const lteDate = new Date(dateFrom + 'T23:59:59+07:00')
  const prevDay = new Date(gteDate)
  prevDay.setDate(prevDay.getDate() - 1)
  const prevFrom = `${prevDay.getFullYear()}-${String(prevDay.getMonth() + 1).padStart(2, '0')}-${String(prevDay.getDate()).padStart(2, '0')}`
  const prevGte = new Date(prevFrom + 'T00:00:00+07:00')
  const prevLte = new Date(prevFrom + 'T23:59:59+07:00')

  try {
    const [todayOrders, prevOrders, stokKritis, aging, topPlatform] = await Promise.all([
      prisma.$queryRaw<{ group_key: string; cnt: bigint; total_omzet: bigint; total_hpp: bigint }[]>`
        SELECT
          CASE
            WHEN status LIKE 'TERKIRIM%' THEN 'terkirim'
            WHEN status ILIKE '%batal%' OR status ILIKE '%cancel%' OR status ILIKE '%dibatalkan%' THEN 'batal'
            ELSE 'perlu_dikirim'
          END AS group_key,
          COUNT(*) AS cnt,
          COALESCE(SUM(real_omzet), 0) AS total_omzet,
          COALESCE(SUM(hpp * qty), 0) AS total_hpp
        FROM orders
        WHERE trx_date >= ${gteDate} AND trx_date <= ${lteDate}
        GROUP BY group_key
      `,
      prisma.$queryRaw<{ cnt: bigint; total_omzet: bigint }[]>`
        SELECT COUNT(*) AS cnt, COALESCE(SUM(real_omzet), 0) AS total_omzet
        FROM orders
        WHERE trx_date >= ${prevGte} AND trx_date <= ${prevLte}
          AND status NOT ILIKE '%batal%'
          AND status NOT ILIKE '%cancel%'
          AND status NOT ILIKE '%dibatalkan%'
      `,
      prisma.$queryRaw<{ cnt: bigint }[]>`
        SELECT COUNT(*) AS cnt FROM (
          SELECT p.sku,
            p.stok_awal
            + COALESCE(SUM(CASE WHEN l.direction = 'IN' AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
            - COALESCE(SUM(CASE WHEN l.direction = 'OUT' AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
            AS soh, p.rop
          FROM master_products p
          LEFT JOIN inventory_ledger l ON l.sku = p.sku
          WHERE p.is_active = true
          GROUP BY p.sku, p.stok_awal, p.rop, p.last_opname_date
        ) x WHERE soh <= rop
      `,
      prisma.$queryRaw<{ bucket: string; cnt: bigint }[]>`
        SELECT
          CASE
            WHEN EXTRACT(EPOCH FROM (NOW() - created_at))/3600 <= 12 THEN '0-12 Jam'
            WHEN EXTRACT(EPOCH FROM (NOW() - created_at))/3600 <= 24 THEN '12-24 Jam'
            WHEN EXTRACT(EPOCH FROM (NOW() - created_at))/3600 <= 48 THEN '24-48 Jam'
            ELSE '>48 Jam'
          END AS bucket,
          COUNT(*) AS cnt
        FROM orders
        WHERE status NOT LIKE 'TERKIRIM%'
          AND status NOT ILIKE '%batal%'
          AND status NOT ILIKE '%cancel%'
          AND status NOT ILIKE '%dibatalkan%'
        GROUP BY bucket
      `,
      prisma.$queryRaw<{ platform: string; cnt: bigint; total_omzet: bigint; total_hpp: bigint }[]>`
        SELECT
          COALESCE(platform, 'Unknown') AS platform,
          COUNT(*) AS cnt,
          COALESCE(SUM(real_omzet), 0) AS total_omzet,
          COALESCE(SUM(hpp * qty), 0) AS total_hpp
        FROM orders
        WHERE trx_date >= ${gteDate} AND trx_date <= ${lteDate}
          AND status NOT ILIKE '%batal%'
          AND status NOT ILIKE '%cancel%'
          AND status NOT ILIKE '%dibatalkan%'
        GROUP BY platform
        ORDER BY total_omzet DESC
      `,
    ])

    // Format data
    const statsMap = Object.fromEntries(
      (todayOrders as any[]).map((r: any) => [
        r.group_key,
        { count: Number(r.cnt), omzet: Number(r.total_omzet), hpp: Number(r.total_hpp) }
      ])
    )

    const omzet = (statsMap['terkirim']?.omzet ?? 0) + (statsMap['perlu_dikirim']?.omzet ?? 0)
    const hpp   = (statsMap['terkirim']?.hpp ?? 0) + (statsMap['perlu_dikirim']?.hpp ?? 0)
    const gp    = omzet - hpp
    const margin = omzet > 0 ? ((gp / omzet) * 100).toFixed(1) : '0'

    const terkirim   = statsMap['terkirim']?.count ?? 0
    const perluKirim = statsMap['perlu_dikirim']?.count ?? 0
    const batal      = statsMap['batal']?.count ?? 0
    const totalOrder = terkirim + perluKirim + batal

    const prevOmzet  = Number((prevOrders as any[])[0]?.total_omzet ?? 0)
    const prevCount  = Number((prevOrders as any[])[0]?.cnt ?? 0)
    const omzetDiff  = omzet - prevOmzet
    const countDiff  = totalOrder - prevCount

    const agingMap = Object.fromEntries((aging as any[]).map((r: any) => [r.bucket, Number(r.cnt)]))
    const agingTotal = Object.values(agingMap).reduce((s: number, v: any) => s + v, 0)

    // Tanggal Indonesia
    let tgl = dateFrom
    try {
      tgl = new Date(dateFrom + 'T00:00:00+07:00').toLocaleDateString('id-ID', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      })
    } catch {}

    // Platform lines
    const platforms = (topPlatform as any[])
    let platformLines = '├ Tidak ada data platform'
    if (platforms.length > 0) {
      platformLines = platforms.map((p: any) =>
        `├ ${p.platform}: ${fmt(Number(p.total_omzet))} (${Number(p.cnt)} order)`
      ).join('\n')
    }

    // Aging lines
    const agingKeys = Object.keys(agingMap)
    let agingStr = '├ Tidak ada'
    if (agingKeys.length > 0) {
      agingStr = agingKeys.map(k => `├ ${k}: ${agingMap[k]}`).join('\n')
    }

    // Comparison
    const omzetArrow = omzetDiff >= 0 ? '↑' : '↓'
    const orderArrow = countDiff >= 0 ? '↑' : '↓'
    const omzetComp  = prevOmzet > 0 ? `${omzetArrow} ${fmt(Math.abs(omzetDiff))}` : '—'
    const orderComp  = `${orderArrow} ${Math.abs(countDiff)} order`

    const msg = `📊 <b>LAPORAN HARIAN ELYASR</b>
${tgl} — 17.30 WIB

💰 <b>OMZET &amp; PROFIT (Hari Ini)</b>
├ Real Omzet    : ${fmt(omzet)}
├ HPP Total     : ${fmt(hpp)}
└ Gross Profit  : ${fmt(gp)} (${margin}%)

📦 <b>ORDER</b>
├ Total Masuk  : ${totalOrder} order
├ Terkirim     : ${terkirim} order
├ Pending Kirim: ${perluKirim} order
└ Dibatalkan   : ${batal} order

🏪 <b>PER PLATFORM</b>
${platformLines}

😡 <b>AGING BACKLOG</b> (${agingTotal} order pending)
${agingStr}

🔥 <b>STOK KRITIS:</b> ${Number((stokKritis as any[])[0]?.cnt ?? 0)} SKU perlu restock

📈 <b>VS KEMARIN</b>
├ Omzet  : ${omzetComp}
└ Order  : ${orderComp}

<i>Dikirim otomatis dari Elyasr Ops</i>`

    // Kirim ke Telegram
    const tgResult = await sendTelegram(botToken, chatId, msg)

    if (!tgResult.ok) {
      return NextResponse.json({
        success: false,
        error: `Telegram error: ${tgResult.description}`,
        tgResult,
      }, { status: 502 })
    }

    return NextResponse.json({
      success: true,
      message: 'Laporan berhasil dikirim ke Telegram!',
      date: dateFrom,
      sentTo: chatId,
    })

  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message || 'Unknown error',
    }, { status: 500 })
  }
}
