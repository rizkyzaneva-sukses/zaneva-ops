/**
 * Quick command renderers — render hasil tool ke Telegram HTML
 * tanpa lewat LLM. Tujuan: hemat token, respons instan (~200ms vs ~10s),
 * output konsisten.
 *
 * Tiap fungsi memanggil bot-tools langsung lalu format jadi pesan HTML.
 * Untuk pertanyaan natural language, kita tetap pakai AI (lihat telegram-ai.ts).
 */

import {
    getSalesRanking,
    getRevenueSummary,
    getStockLevels,
    getOrdersSummary,
    getPlatformBreakdown,
    getWalletSummary,
    getExpenseBreakdown,
    getUtangPiutangSummary,
    getPurchaseOrderStatus,
    getDeadStock,
    getGeoAnalysis,
    getCustomerAnalysis,
    getScanFulfillment,
} from '@/lib/bot-tools'

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function esc(s: any): string {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function nowWIBStr(): string {
    const d = new Date()
    return d.toLocaleDateString('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    })
}

// ─────────────────────────────────────────────
// /top10 & /top10hari
// ─────────────────────────────────────────────
async function renderTop10(period: 'today' | 'week'): Promise<string> {
    const data = await getSalesRanking(period, 10)
    if (!data.ranking.length) {
        return `🏆 <b>Top Produk — ${esc(data.period)}</b>\n\nTidak ada data penjualan di periode ini.`
    }
    const lines = data.ranking.map((r: any) =>
        `<b>${r.rank}.</b> ${esc(r.productName)}\n   ${r.totalQty} pcs · ${r.orderCount} order · ${r.totalOmzet}`
    ).join('\n\n')
    const totalQty = data.ranking.reduce((s: number, r: any) => s + r.totalQty, 0)
    return `🏆 <b>Top 10 Produk Terlaris — ${esc(data.period)}</b>\n\n${lines}\n\n<i>Total qty top 10: ${totalQty} pcs</i>`
}

// ─────────────────────────────────────────────
// /omzet, /omzetminggu, /omzetbulan
// ─────────────────────────────────────────────
async function renderOmzet(period: 'today' | 'week' | 'month'): Promise<string> {
    const data = await getRevenueSummary(period)
    const cancelRate = data.totalOrders > 0
        ? ((data.batalCount / data.totalOrders) * 100).toFixed(1)
        : '0'
    return `💰 <b>Ringkasan Omzet — ${esc(data.period)}</b>

📦 Order valid : <b>${data.validOrders}</b> dari ${data.totalOrders} (cancel: ${data.batalCount}, ${cancelRate}%)
💵 Omzet       : <b>${esc(data.omzet)}</b>
📉 HPP         : ${esc(data.hpp)}
📈 Gross Profit: <b>${esc(data.grossProfit)}</b>
📊 Margin      : <b>${esc(data.marginPct)}</b>`
}

// ─────────────────────────────────────────────
// /stok, /stokhabil
// ─────────────────────────────────────────────
async function renderStok(filter: 'low' | 'critical'): Promise<string> {
    const limit = filter === 'critical' ? 20 : 15
    const data = await getStockLevels(filter, limit)
    if (!data.products.length) {
        return `📦 <b>${esc(data.filter)}</b>\n\n✅ Tidak ada produk di kategori ini. Stok aman.`
    }
    const lines = data.products.map(p => {
        const stockStr = p.currentStock <= 0 ? `<b>${p.currentStock}</b>` : String(p.currentStock)
        return `${p.status} <code>${esc(p.sku)}</code>\n   ${esc(p.productName)}\n   SOH: ${stockStr} · ROP: ${p.rop}`
    }).join('\n\n')
    return `📦 <b>${esc(data.filter)}</b> (${data.count} produk)\n\n${lines}`
}

// ─────────────────────────────────────────────
// /order, /orderminggu
// ─────────────────────────────────────────────
async function renderOrder(period: 'today' | 'week'): Promise<string> {
    const data = await getOrdersSummary(period)
    const aging = data.agingBacklog.length
        ? data.agingBacklog.map((a: any) => `   ${esc(a.bucket)}: ${a.count}`).join('\n')
        : '   (tidak ada backlog)'
    return `📋 <b>Ringkasan Order — ${esc(data.period)}</b>

✅ Terkirim : <b>${data.terkirim.count}</b> · ${esc(data.terkirim.omzet)}
⏳ Pending  : <b>${data.pending.count}</b> · ${esc(data.pending.omzet)}
❌ Batal    : <b>${data.batal.count}</b>
📊 Total    : ${data.total} order

🕐 <b>Aging Backlog</b> (saat ini, semua periode):
${aging}`
}

// ─────────────────────────────────────────────
// /platform, /platformhari
// ─────────────────────────────────────────────
async function renderPlatform(period: 'today' | 'week'): Promise<string> {
    const data = await getPlatformBreakdown(period)
    if (!data.platforms.length) {
        return `🛒 <b>Platform Breakdown — ${esc(data.period)}</b>\n\nTidak ada data.`
    }
    const lines = data.platforms.map((p: any, i: number) =>
        `<b>${i + 1}.</b> ${esc(p.platform)} — ${esc(p.share)}\n   ${p.orderCount} order · ${p.totalQty} pcs · ${esc(p.totalOmzet)}`
    ).join('\n\n')
    return `🛒 <b>Platform Breakdown — ${esc(data.period)}</b>\n\n${lines}\n\n<b>Total omzet:</b> ${esc(data.grandTotalOmzet)}`
}

// ─────────────────────────────────────────────
// /saldo
// ─────────────────────────────────────────────
async function renderSaldo(): Promise<string> {
    const data = await getWalletSummary()
    const active = data.wallets.filter((w: any) => w.isActive)
    if (!active.length) {
        return `💳 <b>Saldo Wallet</b>\n\nTidak ada wallet aktif.`
    }
    const walletLines = active.slice(0, 12).map((w: any) => {
        const tag = w.isAdsBudget ? ' 📢' : ''
        const platform = w.linkedPlatform ? ` <i>[${esc(w.linkedPlatform)}]</i>` : ''
        return `• ${esc(w.name)}${tag}${platform}\n   <b>${esc(w.balance)}</b>`
    }).join('\n\n')
    const lastTrx = data.recentTransactions.slice(0, 3)
        .map((t: any) => `   ${esc(t.date)} · ${esc(t.wallet)} · ${esc(t.type)} ${esc(t.amount)}`)
        .join('\n')
    return `💳 <b>Saldo Wallet</b>

💰 Total Kas    : <b>${esc(data.totalCashPosition)}</b>
📢 Ads Budget   : ${esc(data.adsBudgetTotal)}
🏦 Wallet Aktif : ${data.activeWalletCount}

${walletLines}

🔄 <b>3 Transaksi Terakhir:</b>
${lastTrx || '   (tidak ada)'}`
}

// ─────────────────────────────────────────────
// /pengeluaran
// ─────────────────────────────────────────────
async function renderPengeluaran(): Promise<string> {
    const data = await getExpenseBreakdown('month')
    if (!data.breakdown.length) {
        return `💸 <b>Pengeluaran — ${esc(data.period)}</b>\n\nBelum ada pengeluaran tercatat.`
    }
    const lines = data.breakdown.slice(0, 12).map((b: any, i: number) =>
        `<b>${i + 1}.</b> ${esc(b.category)} — ${esc(b.share)}\n   ${b.trxCount} trx · ${esc(b.total)}`
    ).join('\n\n')
    return `💸 <b>Pengeluaran — ${esc(data.period)}</b>

<b>Total: ${esc(data.totalExpense)}</b> (${data.categoryCount} kategori)

${lines}`
}

// ─────────────────────────────────────────────
// /utang
// ─────────────────────────────────────────────
async function renderUtang(): Promise<string> {
    const data = await getUtangPiutangSummary()
    const utangAlerts = data.utang.overdue + data.utang.approachingDue
    const piutangAlerts = data.piutang.overdue + data.piutang.approachingDue
    const utangTopItems = data.utang.items.slice(0, 5).map((i: any) => {
        const tag = i.isOverdue ? ' ⚠️ OVERDUE' : i.isApproachingDue ? ' ⏰ <7hr' : ''
        const due = i.dueDate ? ` · jatuh tempo ${esc(i.dueDate)}` : ''
        return `• ${esc(i.creditor)} — ${esc(i.sisa)}${tag}${due}`
    }).join('\n')
    const piutangTopItems = data.piutang.items.slice(0, 5).map((i: any) => {
        const tag = i.isOverdue ? ' ⚠️ OVERDUE' : i.isApproachingDue ? ' ⏰ <7hr' : ''
        const due = i.dueDate ? ` · jatuh tempo ${esc(i.dueDate)}` : ''
        return `• ${esc(i.debtor)} — ${esc(i.sisa)}${tag}${due}`
    }).join('\n')
    return `💼 <b>Utang & Piutang Outstanding</b>

📊 <b>Posisi Net: ${esc(data.netPosition)}</b>

🔴 <b>Utang</b> (${data.utang.count} item · total ${esc(data.utang.totalOutstanding)})
   Overdue: ${data.utang.overdue} · Mendekati jatuh tempo: ${data.utang.approachingDue}
${utangTopItems || '   (tidak ada)'}

🟢 <b>Piutang</b> (${data.piutang.count} item · total ${esc(data.piutang.totalOutstanding)})
   Overdue: ${data.piutang.overdue} · Mendekati jatuh tempo: ${data.piutang.approachingDue}
${piutangTopItems || '   (tidak ada)'}

${utangAlerts + piutangAlerts > 0 ? `⚠️ <i>Ada ${utangAlerts + piutangAlerts} item butuh perhatian.</i>` : '✅ <i>Semua dalam kondisi normal.</i>'}`
}

// ─────────────────────────────────────────────
// /po
// ─────────────────────────────────────────────
async function renderPO(): Promise<string> {
    const data = await getPurchaseOrderStatus('open')
    if (!data.count) {
        return `📥 <b>Purchase Order — ${esc(data.filter)}</b>\n\n✅ Tidak ada PO yang masih open. Semua kelar.`
    }
    const lines = data.items.slice(0, 10).map(i => {
        const overdue = i.isOverdue ? ' ⚠️ OVERDUE' : ''
        const exp = i.expectedDate ? ` · ETA ${esc(i.expectedDate)}` : ''
        return `<b>${esc(i.poNumber)}</b> — ${esc(i.vendor)}${overdue}
   ${i.qtyReceived}/${i.qtyOrder} pcs (${esc(i.fulfillmentPct)})${exp}
   ${esc(i.status)} · Sisa bayar: ${esc(i.sisaBayar)}`
    }).join('\n\n')
    return `📥 <b>Purchase Order — ${esc(data.filter)}</b>

📊 ${data.count} PO open${data.overdueCount > 0 ? ` · <b>${data.overdueCount} overdue ⚠️</b>` : ''}
💰 Total nilai : ${esc(data.totalAmount)}
✅ Sudah bayar : ${esc(data.totalPaid)}
🔴 Sisa bayar  : <b>${esc(data.totalUnpaid)}</b>

${lines}`
}

// ─────────────────────────────────────────────
// /deadstock
// ─────────────────────────────────────────────
async function renderDeadStock(): Promise<string> {
    const data = await getDeadStock(30, 20)
    if (!data.count) {
        return `🧊 <b>Dead Stock — ${esc(data.period)}</b>\n\n✅ Tidak ada dead stock. Semua produk laku.`
    }
    const lines = data.products.slice(0, 12).map((p: any, i: number) =>
        `<b>${i + 1}.</b> <code>${esc(p.sku)}</code> ${esc(p.productName)}\n   SOH: ${p.currentStock} · Nilai: ${esc(p.deadValue)}`
    ).join('\n\n')
    return `🧊 <b>Dead Stock — ${esc(data.period)}</b>

📊 <b>${data.count} SKU</b> mandek (stok > 0, 0 penjualan ${esc(data.period)})
💸 Total nilai dead stock: <b>${esc(data.totalDeadValue)}</b>

${lines}

<i>Pertimbangkan: diskon, bundling, atau retur ke supplier.</i>`
}

// ─────────────────────────────────────────────
// /kota
// ─────────────────────────────────────────────
async function renderKota(): Promise<string> {
    const data = await getGeoAnalysis('week', undefined, undefined, 10)
    if (!data.topCities.length) {
        return `🗺️ <b>Top Kota — ${esc(data.period)}</b>\n\nTidak ada data.`
    }
    const cityLines = data.topCities.map((c: any) =>
        `<b>${c.rank}.</b> ${esc(c.city)} <i>(${esc(c.province)})</i>\n   ${c.orderCount} order · ${esc(c.share)} · ${esc(c.totalOmzet)}`
    ).join('\n\n')
    const provinceLines = data.topProvinces.slice(0, 5).map((p: any) =>
        `${p.rank}. ${esc(p.province)} — ${p.orderCount} order · ${esc(p.totalOmzet)}`
    ).join('\n')
    return `🗺️ <b>Top Kota — ${esc(data.period)}</b>

${cityLines}

🏞️ <b>Top 5 Provinsi:</b>
${provinceLines}`
}

// ─────────────────────────────────────────────
// /customer
// ─────────────────────────────────────────────
async function renderCustomer(): Promise<string> {
    const data = await getCustomerAnalysis('month', undefined, undefined, 10)
    const buyerLines = data.topBuyers.length
        ? data.topBuyers.slice(0, 8).map((b: any) =>
            `<b>${b.rank}.</b> ${esc(b.buyer)}\n   ${b.orderCount} order · ${b.totalQty} pcs · ${esc(b.totalOmzet)}`
        ).join('\n\n')
        : '   (tidak ada data)'
    return `👥 <b>Customer Analysis — ${esc(data.period)}</b>

📊 <b>Buyer unik: ${data.uniqueBuyers}</b>
🆕 Baru        : ${data.newBuyers}
🔁 Returning   : ${data.returningBuyers} <i>(${esc(data.returningRate)} dari unique)</i>
🔄 Repeat dlm periode: ${data.repeatBuyersInPeriod} <i>(${esc(data.repeatRateInPeriod)})</i>

🏆 <b>Top Buyer (omzet):</b>
${buyerLines}`
}

// ─────────────────────────────────────────────
// /fulfillment
// ─────────────────────────────────────────────
async function renderFulfillment(): Promise<string> {
    const data = await getScanFulfillment('today')
    const aging = data.unscannedAging.length
        ? data.unscannedAging.map((a: any) => `   ${esc(a.bucket)}: ${a.count}`).join('\n')
        : '   (semua sudah di-scan)'
    const operators = data.todayScanByOperator.length
        ? data.todayScanByOperator.slice(0, 5).map((o: any) =>
            `   • ${esc(o.operator)} — ${o.scanCount} scan (${o.uniqueOrders} order)`
        ).join('\n')
        : '   (belum ada scan)'
    return `📦 <b>Scan & Fulfillment — Hari Ini (${nowWIBStr()})</b>

📊 Total order        : ${data.totalOrders}
✅ Sudah di-scan      : <b>${data.scannedOrders}</b> (${esc(data.scanProgress)})
⏳ Belum di-scan      : ${data.unscannedOrders}
⏱️ Avg waktu scan     : ${esc(data.avgFulfillmentHours)} jam

🕐 <b>Aging Unscanned</b> (semua periode):
${aging}

👷 <b>Scanner hari ini</b> (${data.todayScanTotal} scan total):
${operators}`
}

// ─────────────────────────────────────────────
// Public API: dispatcher
// ─────────────────────────────────────────────
export type QuickCommandKey =
    | '/top10' | '/top10hari'
    | '/omzet' | '/omzetminggu' | '/omzetbulan'
    | '/stok' | '/stokhabil'
    | '/order' | '/orderminggu'
    | '/platform' | '/platformhari'
    | '/saldo' | '/pengeluaran' | '/utang' | '/po'
    | '/deadstock' | '/kota' | '/customer' | '/fulfillment'

export const QUICK_COMMANDS: QuickCommandKey[] = [
    '/top10', '/top10hari',
    '/omzet', '/omzetminggu', '/omzetbulan',
    '/stok', '/stokhabil',
    '/order', '/orderminggu',
    '/platform', '/platformhari',
    '/saldo', '/pengeluaran', '/utang', '/po',
    '/deadstock', '/kota', '/customer', '/fulfillment',
]

export function isQuickCommand(cmd: string): cmd is QuickCommandKey {
    return (QUICK_COMMANDS as string[]).includes(cmd)
}

export async function renderQuickCommand(cmd: QuickCommandKey): Promise<string> {
    switch (cmd) {
        case '/top10':         return renderTop10('week')
        case '/top10hari':     return renderTop10('today')
        case '/omzet':         return renderOmzet('today')
        case '/omzetminggu':   return renderOmzet('week')
        case '/omzetbulan':    return renderOmzet('month')
        case '/stok':          return renderStok('low')
        case '/stokhabil':     return renderStok('critical')
        case '/order':         return renderOrder('today')
        case '/orderminggu':   return renderOrder('week')
        case '/platform':      return renderPlatform('week')
        case '/platformhari':  return renderPlatform('today')
        case '/saldo':         return renderSaldo()
        case '/pengeluaran':   return renderPengeluaran()
        case '/utang':         return renderUtang()
        case '/po':            return renderPO()
        case '/deadstock':     return renderDeadStock()
        case '/kota':          return renderKota()
        case '/customer':      return renderCustomer()
        case '/fulfillment':   return renderFulfillment()
    }
}
