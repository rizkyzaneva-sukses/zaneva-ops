/**
 * Telegram inline keyboard menu definitions.
 *
 * Setiap tombol punya `callback_data` yang dimulai prefix "cmd:" untuk
 * menjalankan quick command, atau "menu:" untuk navigasi sub-menu, atau
 * "report:" untuk laporan harian/mingguan/bulanan.
 *
 * Format teks tombol pakai emoji biar gampang dibaca di mobile.
 */

export type InlineButton = { text: string; callback_data: string }
export type InlineKeyboard = InlineButton[][]

export type MenuPayload = { text: string; keyboard: InlineKeyboard }

// ─────────────────────────────────────────────
// Main menu — entry point /menu
// ─────────────────────────────────────────────
export function getMainMenu(): MenuPayload {
    return {
        text: `🏪 <b>Elyasr Bot Menu</b>

Pilih kategori untuk lihat data bisnis kamu.
Atau tanya bebas — bot bisa jawab pertanyaan natural language.`,
        keyboard: [
            [
                { text: '💰 Penjualan', callback_data: 'menu:sales' },
                { text: '📦 Inventory', callback_data: 'menu:inventory' },
            ],
            [
                { text: '💼 Keuangan', callback_data: 'menu:finance' },
                { text: '👥 Customer & Geo', callback_data: 'menu:cust' },
            ],
            [
                { text: '📑 Laporan Lengkap', callback_data: 'menu:reports' },
                { text: '⚙️ Operasional', callback_data: 'menu:ops' },
            ],
            [
                { text: '❓ Help / Tanya Bebas', callback_data: 'menu:help' },
            ],
        ],
    }
}

// ─────────────────────────────────────────────
// Sub-menu: Penjualan
// ─────────────────────────────────────────────
function getSalesMenu(): MenuPayload {
    return {
        text: `💰 <b>Penjualan & Order</b>

Lihat performa penjualan dari berbagai sudut.`,
        keyboard: [
            [
                { text: '📊 Omzet Hari Ini', callback_data: 'cmd:/omzet' },
                { text: '📊 Omzet 7 Hari', callback_data: 'cmd:/omzetminggu' },
            ],
            [
                { text: '📊 Omzet Bulan Ini', callback_data: 'cmd:/omzetbulan' },
            ],
            [
                { text: '📋 Order Hari Ini', callback_data: 'cmd:/order' },
                { text: '📋 Order 7 Hari', callback_data: 'cmd:/orderminggu' },
            ],
            [
                { text: '🏆 Top 10 (7 Hari)', callback_data: 'cmd:/top10' },
                { text: '🏆 Top 10 Hari Ini', callback_data: 'cmd:/top10hari' },
            ],
            [
                { text: '🛒 Platform 7 Hari', callback_data: 'cmd:/platform' },
                { text: '🛒 Platform Hari Ini', callback_data: 'cmd:/platformhari' },
            ],
            [
                { text: '« Kembali', callback_data: 'menu:main' },
            ],
        ],
    }
}

// ─────────────────────────────────────────────
// Sub-menu: Inventory
// ─────────────────────────────────────────────
function getInventoryMenu(): MenuPayload {
    return {
        text: `📦 <b>Inventory & Stok</b>

Cek kesehatan stok produk kamu.`,
        keyboard: [
            [
                { text: '🟡 Stok Kritis (≤ ROP)', callback_data: 'cmd:/stok' },
                { text: '🔴 Stok Habis', callback_data: 'cmd:/stokhabil' },
            ],
            [
                { text: '🧊 Dead Stock (30 hari)', callback_data: 'cmd:/deadstock' },
            ],
            [
                { text: '📥 Status PO', callback_data: 'cmd:/po' },
            ],
            [
                { text: '« Kembali', callback_data: 'menu:main' },
            ],
        ],
    }
}

// ─────────────────────────────────────────────
// Sub-menu: Keuangan
// ─────────────────────────────────────────────
function getFinanceMenu(): MenuPayload {
    return {
        text: `💼 <b>Keuangan</b>

Saldo kas, pengeluaran, utang & piutang.`,
        keyboard: [
            [
                { text: '💳 Saldo Wallet', callback_data: 'cmd:/saldo' },
            ],
            [
                { text: '💸 Pengeluaran Bulan Ini', callback_data: 'cmd:/pengeluaran' },
            ],
            [
                { text: '💼 Utang & Piutang', callback_data: 'cmd:/utang' },
            ],
            [
                { text: '« Kembali', callback_data: 'menu:main' },
            ],
        ],
    }
}

// ─────────────────────────────────────────────
// Sub-menu: Customer & Geo
// ─────────────────────────────────────────────
function getCustomerMenu(): MenuPayload {
    return {
        text: `👥 <b>Customer & Geografis</b>

Analisis customer behavior dan distribusi geografis.`,
        keyboard: [
            [
                { text: '🗺️ Top Kota (7 Hari)', callback_data: 'cmd:/kota' },
            ],
            [
                { text: '👥 Customer Analysis (30 Hari)', callback_data: 'cmd:/customer' },
            ],
            [
                { text: '« Kembali', callback_data: 'menu:main' },
            ],
        ],
    }
}

// ─────────────────────────────────────────────
// Sub-menu: Laporan
// ─────────────────────────────────────────────
function getReportsMenu(): MenuPayload {
    return {
        text: `📑 <b>Laporan Komprehensif</b>

Laporan lengkap dengan perbandingan periode.`,
        keyboard: [
            [
                { text: '☀️ Laporan Hari Ini', callback_data: 'report:daily' },
            ],
            [
                { text: '📅 Laporan Mingguan', callback_data: 'report:weekly' },
            ],
            [
                { text: '🗓️ Laporan Bulanan', callback_data: 'report:monthly' },
            ],
            [
                { text: '« Kembali', callback_data: 'menu:main' },
            ],
        ],
    }
}

// ─────────────────────────────────────────────
// Sub-menu: Operasional
// ─────────────────────────────────────────────
function getOpsMenu(): MenuPayload {
    return {
        text: `⚙️ <b>Operasional</b>

Progress fulfillment dan scan order.`,
        keyboard: [
            [
                { text: '📦 Scan & Fulfillment Hari Ini', callback_data: 'cmd:/fulfillment' },
            ],
            [
                { text: '« Kembali', callback_data: 'menu:main' },
            ],
        ],
    }
}

// ─────────────────────────────────────────────
// Sub-menu: Help
// ─────────────────────────────────────────────
function getHelpMenu(): MenuPayload {
    return {
        text: `❓ <b>Tanya Bebas — Natural Language</b>

Bot ini bisa jawab pertanyaan dalam Bahasa Indonesia. Tinggal ketik pertanyaan kamu, contohnya:

• <i>"berapa omzet bulan ini vs bulan lalu?"</i>
• <i>"produk apa yang paling laku 30 hari terakhir?"</i>
• <i>"audit kesehatan bisnis hari ini dong"</i>
• <i>"kasih snapshot keuangan: omzet, utang, piutang"</i>
• <i>"barang apa yang dead stock 60 hari?"</i>
• <i>"tanggal 13-15 Mei omzet berapa?"</i>

⚡ <b>Quick Command (instan, gratis):</b>
Kirim /help untuk lihat semua command yang ada.`,
        keyboard: [
            [
                { text: '« Kembali', callback_data: 'menu:main' },
            ],
        ],
    }
}

// ─────────────────────────────────────────────
// Dispatcher
// ─────────────────────────────────────────────
export function getMenuByKey(key: string): MenuPayload | null {
    switch (key) {
        case 'main':      return getMainMenu()
        case 'sales':     return getSalesMenu()
        case 'inventory': return getInventoryMenu()
        case 'finance':   return getFinanceMenu()
        case 'cust':      return getCustomerMenu()
        case 'reports':   return getReportsMenu()
        case 'ops':       return getOpsMenu()
        case 'help':      return getHelpMenu()
        default:          return null
    }
}
