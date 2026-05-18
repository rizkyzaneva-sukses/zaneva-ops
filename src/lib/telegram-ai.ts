/**
 * Telegram AI Assistant — menggunakan Adye API (OpenAI-compatible)
 * dengan Claude Sonnet dan tool calling untuk query data bisnis.
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
const ADYE_MODEL = process.env.ADYE_MODEL || 'claude-sonnet-4.6'
const ADYE_API_KEY = process.env.ADYE_API_KEY || ''

// Timeout untuk API call (30 detik)
const API_TIMEOUT_MS = 30_000

// ─────────────────────────────────────────────
// System prompt — di-generate fresh setiap call agar tanggal selalu akurat
// ─────────────────────────────────────────────
function getSystemPrompt(): string {
    const nowWIB = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))
    const todayStr = `${nowWIB.getFullYear()}-${String(nowWIB.getMonth() + 1).padStart(2, '0')}-${String(nowWIB.getDate()).padStart(2, '0')}`

    return `Kamu adalah asisten bisnis AI untuk Elyasr Ops — sistem manajemen operasional toko online.
Kamu membantu owner mendapatkan insights dari data bisnisnya melalui Telegram.

KONTEKS BISNIS:
- Elyasr adalah toko online yang berjualan di berbagai marketplace (Shopee, Tokopedia, Lazada, dll)
- Data yang tersedia: orders/penjualan, inventori/stok, omzet, profit
- Semua harga dalam Rupiah (IDR), format: Rp X.XXX (titik ribuan)
- Waktu menggunakan WIB (Asia/Jakarta, UTC+7)
- Tanggal hari ini (WIB): ${todayStr}

CARA MENENTUKAN TANGGAL:
- Gunakan "period" untuk periode umum: today, yesterday, week (7 hari terakhir), month (bulan ini)
- Gunakan "start_date" + "end_date" (format YYYY-MM-DD) untuk tanggal spesifik atau rentang bebas
- Jika user menyebut tanggal tertentu (mis. "13 Mei", "tanggal 13-15"), hitung dari hari ini dan gunakan start_date/end_date
- Jika user menyebut "kemarin", "minggu lalu", dll — konversi ke tanggal absolut dan gunakan start_date/end_date
- Untuk perbandingan dua periode (mis. "bulan ini vs bulan lalu"), panggil tool DUA KALI dengan date range berbeda
- Jika tidak ada info waktu sama sekali, default ke period="week"
- "bulan ini" = 1 bulan ini sampai hari ini
- "minggu ini" = Senin minggu ini sampai hari ini

PANDUAN RESPONS:
- Jawab dalam Bahasa Indonesia yang natural dan profesional
- Gunakan emoji secukupnya agar mudah dibaca di Telegram (jangan berlebihan)
- Respons singkat dan langsung ke poin — ini chat Telegram, bukan laporan panjang
- Maksimal 3000 karakter
- Untuk ranking: tampilkan nomor urut, nama produk, qty terjual
- Jika data kosong untuk periode tersebut, sampaikan dengan jelas — jangan mengarang angka
- Jangan tampilkan data teknis seperti SKU kecuali diminta
- Selalu konfirmasi periode yang dipakai di awal jawaban
- Jika ada banyak varian produk (misal Sakeena Black S/M/L/XL), kelompokkan per nama dasar produk
- Setelah menampilkan data, tambahkan 1-3 insight actionable singkat yang spesifik berdasarkan data

CONTOH FORMAT RANKING:
🏆 Top 5 Produk (7 Hari Terakhir)
1. Nama Produk A — 120 pcs
2. Nama Produk B — 98 pcs
3. Nama Produk C — 75 pcs

Gunakan tool yang tepat. Bisa panggil beberapa tool sekaligus jika pertanyaan butuh data dari berbagai sumber.`
}

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
// Fetch with timeout
// ─────────────────────────────────────────────
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
        const res = await fetch(url, { ...options, signal: controller.signal })
        return res
    } finally {
        clearTimeout(timer)
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
        console.error('[telegram-ai] ADYE_API_KEY belum dikonfigurasi')
        return '❌ AI belum dikonfigurasi (ADYE_API_KEY kosong). Hubungi admin.'
    }

    console.log(`[telegram-ai] Processing: "${userMessage.slice(0, 80)}" | model=${ADYE_MODEL} | url=${ADYE_BASE_URL}`)

    const messages: Message[] = [
        { role: 'system', content: getSystemPrompt() },
        { role: 'user', content: userMessage },
    ]

    // Agentic loop — max 5 iterasi untuk menghindari infinite loop
    for (let iter = 0; iter < 5; iter++) {
        let res: Response
        try {
            res = await fetchWithTimeout(`${ADYE_BASE_URL}/chat/completions`, {
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
                    max_tokens: 2000,
                }),
            }, API_TIMEOUT_MS)
        } catch (err: any) {
            if (err.name === 'AbortError') {
                console.error('[telegram-ai] API timeout after', API_TIMEOUT_MS, 'ms')
                return '⏱️ AI timeout — server terlalu lama merespons. Coba lagi nanti.'
            }
            console.error('[telegram-ai] Fetch error:', err)
            return `❌ Gagal menghubungi AI: ${err.message}`
        }

        if (!res.ok) {
            const body = await res.text()
            console.error(`[telegram-ai] Adye API error ${res.status}:`, body.slice(0, 500))

            if (res.status === 401) {
                return '❌ API key tidak valid. Hubungi admin.'
            }
            if (res.status === 429) {
                return '⏳ Rate limit tercapai. Coba lagi dalam beberapa detik.'
            }
            if (res.status === 404) {
                return `❌ Model "${ADYE_MODEL}" tidak ditemukan di API. Hubungi admin untuk cek konfigurasi.`
            }
            return `❌ Error dari AI (HTTP ${res.status}). Coba lagi nanti.`
        }

        let data: any
        try {
            data = await res.json()
        } catch (err) {
            console.error('[telegram-ai] Failed to parse JSON response:', err)
            return '❌ Respons AI tidak valid (bukan JSON). Coba lagi nanti.'
        }

        const choice = data.choices?.[0]

        if (!choice) {
            console.error('[telegram-ai] No choices in response:', JSON.stringify(data).slice(0, 300))
            return '❌ Respons AI tidak valid (no choices). Coba lagi nanti.'
        }

        console.log(`[telegram-ai] Iter ${iter}: finish_reason=${choice.finish_reason}, has_tool_calls=${!!choice.message?.tool_calls?.length}`)

        // AI mau panggil tool — cek ini DULU sebelum cek finish_reason
        if (choice.message?.tool_calls?.length) {
            const assistantMsg = choice.message
            messages.push(assistantMsg)

            // Eksekusi semua tool calls
            for (const tc of assistantMsg.tool_calls) {
                let args: Record<string, any> = {}
                try { args = JSON.parse(tc.function?.arguments || '{}') } catch { }

                console.log(`[telegram-ai] Calling tool: ${tc.function?.name}`, JSON.stringify(args))
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

        // AI selesai — kembalikan respons teks
        // Support berbagai finish_reason: stop, end_turn, length, dll
        if (choice.message?.content) {
            return choice.message.content
        }

        // Jika finish_reason = stop tapi content kosong
        if (choice.finish_reason === 'stop' || choice.finish_reason === 'end_turn') {
            return choice.message?.content || '(AI tidak memberikan respons teks)'
        }

        // Fallback
        console.warn('[telegram-ai] Unexpected state:', JSON.stringify(choice).slice(0, 300))
        break
    }

    return '⚠️ AI tidak dapat menyelesaikan permintaan. Coba pertanyaan yang lebih spesifik.'
}
