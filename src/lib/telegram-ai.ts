/**
 * Telegram AI Assistant — menggunakan Adye API (OpenAI-compatible)
 * dengan Claude Sonnet 4.6 dan tool calling untuk query data bisnis.
 */

import {
    getSalesRanking,
    getRevenueSummary,
    getStockLevels,
    getOrdersSummary,
    getPlatformBreakdown,
} from '@/lib/bot-tools'

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────
const ADYE_BASE_URL = process.env.ADYE_BASE_URL || 'https://adye.dev/v1'
const ADYE_MODEL    = process.env.ADYE_MODEL    || 'claude-sonnet-4-6'
const ADYE_API_KEY  = process.env.ADYE_API_KEY  || ''

// ─────────────────────────────────────────────
// System prompt
// ─────────────────────────────────────────────
const TODAY_WIB = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))
const TODAY_STR = `${TODAY_WIB.getFullYear()}-${String(TODAY_WIB.getMonth() + 1).padStart(2, '0')}-${String(TODAY_WIB.getDate()).padStart(2, '0')}`

const SYSTEM_PROMPT = `Kamu adalah asisten bisnis AI untuk Elyasr Ops — sistem manajemen operasional toko online.
Kamu membantu owner mendapatkan insights dari data bisnisnya melalui Telegram.

KONTEKS BISNIS:
- Elyasr adalah toko online yang berjualan di berbagai marketplace (Shopee, Tokopedia, Lazada, dll)
- Data yang tersedia: orders/penjualan, inventori/stok, omzet, profit
- Semua harga dalam Rupiah (IDR), sudah diformat ke "Rp X.XXX"
- Waktu menggunakan WIB (Asia/Jakarta, UTC+7)
- Tanggal hari ini (WIB): ${TODAY_STR}

CARA MENENTUKAN TANGGAL:
- Gunakan "period" untuk periode umum: today, yesterday, week (7 hari terakhir), month (bulan ini)
- Gunakan "start_date" + "end_date" (format YYYY-MM-DD) untuk tanggal spesifik atau rentang bebas
- Jika user menyebut tanggal tertentu (mis. "13 Mei", "tanggal 13-15"), hitung dari hari ini dan gunakan start_date/end_date
- Jika user menyebut "kemarin", "minggu lalu", dll — konversi ke tanggal absolut dan gunakan start_date/end_date
- Untuk perbandingan dua periode (mis. "bulan ini vs bulan lalu"), panggil tool DUA KALI dengan date range berbeda
- Jika tidak ada info waktu sama sekali, default ke period="week"

PANDUAN RESPONS:
- Jawab dalam Bahasa Indonesia yang natural dan profesional
- Gunakan emoji secukupnya agar mudah dibaca di Telegram (jangan berlebihan)
- Respons singkat dan langsung ke poin — ini chat Telegram, bukan laporan panjang
- Untuk ranking: tampilkan nomor urut, nama produk, qty terjual
- Jika data kosong untuk periode tersebut, sampaikan dengan jelas
- Jangan tampilkan data teknis seperti SKU kecuali diminta

CONTOH FORMAT RANKING:
🏆 Top 5 Produk (7 Hari Terakhir)
1. Nama Produk A — 120 pcs
2. Nama Produk B — 98 pcs
3. Nama Produk C — 75 pcs

Gunakan tool yang tepat. Bisa panggil beberapa tool sekaligus jika pertanyaan butuh data dari berbagai sumber.`

// ─────────────────────────────────────────────
// Tool definitions (OpenAI function calling format)
// ─────────────────────────────────────────────
const TOOLS = [
    {
        type: 'function',
        function: {
            name: 'get_sales_ranking',
            description: 'Ambil ranking/daftar produk terlaris berdasarkan jumlah qty terjual. Gunakan untuk pertanyaan seperti "produk terlaris", "top 10 produk", "apa yang paling banyak terjual".',
            parameters: {
                type: 'object',
                properties: {
                    period: {
                        type: 'string',
                        enum: ['today', 'yesterday', 'week', 'month'],
                        description: 'Periode preset. Abaikan jika menggunakan start_date/end_date.',
                    },
                    start_date: {
                        type: 'string',
                        description: 'Tanggal mulai format YYYY-MM-DD (WIB). Gunakan untuk tanggal spesifik atau rentang bebas.',
                    },
                    end_date: {
                        type: 'string',
                        description: 'Tanggal akhir format YYYY-MM-DD (WIB). Jika tidak diisi, sama dengan start_date (satu hari).',
                    },
                    limit: {
                        type: 'number',
                        description: 'Jumlah produk yang ditampilkan (default 10, max 50)',
                    },
                },
                required: [],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_revenue_summary',
            description: 'Ambil ringkasan omzet, HPP, dan gross profit. Gunakan untuk pertanyaan tentang "omzet", "pendapatan", "profit", "keuntungan", "margin". Panggil dua kali dengan range berbeda untuk membandingkan periode.',
            parameters: {
                type: 'object',
                properties: {
                    period: {
                        type: 'string',
                        enum: ['today', 'yesterday', 'week', 'month'],
                        description: 'Periode preset. Abaikan jika menggunakan start_date/end_date.',
                    },
                    start_date: {
                        type: 'string',
                        description: 'Tanggal mulai format YYYY-MM-DD (WIB).',
                    },
                    end_date: {
                        type: 'string',
                        description: 'Tanggal akhir format YYYY-MM-DD (WIB). Jika tidak diisi, sama dengan start_date.',
                    },
                },
                required: [],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_stock_levels',
            description: 'Ambil informasi stok produk. Gunakan untuk pertanyaan tentang "stok", "inventory", "barang hampir habis", "restock", "stok kritis".',
            parameters: {
                type: 'object',
                properties: {
                    filter: {
                        type: 'string',
                        enum: ['all', 'low', 'critical'],
                        description: 'Filter stok: all=semua produk, low=stok di bawah ROP (perlu restock), critical=stok habis (0 atau minus)',
                    },
                    limit: {
                        type: 'number',
                        description: 'Jumlah produk yang ditampilkan (default 20)',
                    },
                },
                required: ['filter'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_orders_summary',
            description: 'Ambil ringkasan order berdasarkan status (terkirim, pending, batal) dan aging backlog. Gunakan untuk pertanyaan tentang "order hari ini", "berapa order", "pending kirim", "backlog".',
            parameters: {
                type: 'object',
                properties: {
                    period: {
                        type: 'string',
                        enum: ['today', 'yesterday', 'week', 'month'],
                        description: 'Periode preset. Abaikan jika menggunakan start_date/end_date.',
                    },
                    start_date: {
                        type: 'string',
                        description: 'Tanggal mulai format YYYY-MM-DD (WIB).',
                    },
                    end_date: {
                        type: 'string',
                        description: 'Tanggal akhir format YYYY-MM-DD (WIB). Jika tidak diisi, sama dengan start_date.',
                    },
                },
                required: [],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_platform_breakdown',
            description: 'Ambil breakdown penjualan per platform marketplace (Shopee, Tokopedia, dll). Gunakan untuk pertanyaan tentang "platform mana yang paling laku", "perbandingan marketplace", "omzet per platform".',
            parameters: {
                type: 'object',
                properties: {
                    period: {
                        type: 'string',
                        enum: ['today', 'yesterday', 'week', 'month'],
                        description: 'Periode preset. Abaikan jika menggunakan start_date/end_date.',
                    },
                    start_date: {
                        type: 'string',
                        description: 'Tanggal mulai format YYYY-MM-DD (WIB).',
                    },
                    end_date: {
                        type: 'string',
                        description: 'Tanggal akhir format YYYY-MM-DD (WIB). Jika tidak diisi, sama dengan start_date.',
                    },
                },
                required: [],
            },
        },
    },
]

// ─────────────────────────────────────────────
// Tool executor
// ─────────────────────────────────────────────
async function executeTool(name: string, args: Record<string, any>): Promise<string> {
    try {
        let result: any
        switch (name) {
            case 'get_sales_ranking':
                result = await getSalesRanking(args.period, args.limit, args.start_date, args.end_date)
                break
            case 'get_revenue_summary':
                result = await getRevenueSummary(args.period, args.start_date, args.end_date)
                break
            case 'get_stock_levels':
                result = await getStockLevels(args.filter, args.limit)
                break
            case 'get_orders_summary':
                result = await getOrdersSummary(args.period, args.start_date, args.end_date)
                break
            case 'get_platform_breakdown':
                result = await getPlatformBreakdown(args.period, args.start_date, args.end_date)
                break
            default:
                return JSON.stringify({ error: `Tool tidak dikenal: ${name}` })
        }
        return JSON.stringify(result)
    } catch (err: any) {
        console.error(`[bot-tools] Error in ${name}:`, err)
        return JSON.stringify({ error: `Gagal mengambil data: ${err.message}` })
    }
}

// ─────────────────────────────────────────────
// Main: Process user message dengan AI + tool loop
// ─────────────────────────────────────────────
type Message = {
    role: 'system' | 'user' | 'assistant' | 'tool'
    content: string | null
    tool_calls?: any[]
    tool_call_id?: string
    name?: string
}

export async function processWithAI(userMessage: string): Promise<string> {
    if (!ADYE_API_KEY) {
        return '❌ ADYE_API_KEY belum dikonfigurasi. Hubungi admin.'
    }

    const messages: Message[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: userMessage },
    ]

    // Agentic loop — max 5 iterasi untuk menghindari infinite loop
    for (let iter = 0; iter < 5; iter++) {
        const res = await fetch(`${ADYE_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${ADYE_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: ADYE_MODEL,
                messages,
                tools: TOOLS,
                tool_choice: 'auto',
                max_tokens: 1500,
            }),
        })

        if (!res.ok) {
            const body = await res.text()
            console.error('[telegram-ai] Adye API error:', res.status, body)
            return `❌ Error dari AI (${res.status}). Coba lagi nanti.`
        }

        const data = await res.json()
        const choice = data.choices?.[0]

        if (!choice) {
            return '❌ Respons AI tidak valid. Coba lagi nanti.'
        }

        // AI selesai — kembalikan respons teks
        if (choice.finish_reason === 'stop' || choice.finish_reason === 'end_turn') {
            return choice.message?.content || '(Tidak ada respons)'
        }

        // AI mau panggil tool
        if (choice.finish_reason === 'tool_calls' || choice.message?.tool_calls?.length) {
            const assistantMsg = choice.message
            messages.push(assistantMsg)

            // Eksekusi semua tool calls
            for (const tc of assistantMsg.tool_calls || []) {
                let args: Record<string, any> = {}
                try { args = JSON.parse(tc.function?.arguments || '{}') } catch {}

                console.log(`[telegram-ai] Calling tool: ${tc.function?.name}`, args)
                const toolResult = await executeTool(tc.function?.name, args)

                messages.push({
                    role: 'tool',
                    tool_call_id: tc.id,
                    content: toolResult,
                })
            }
            // Lanjut ke iterasi berikutnya — AI akan proses hasil tool
            continue
        }

        // Fallback: ambil konten jika ada
        if (choice.message?.content) {
            return choice.message.content
        }

        break
    }

    return '⚠️ AI tidak dapat menyelesaikan permintaan. Coba pertanyaan yang lebih spesifik.'
}
