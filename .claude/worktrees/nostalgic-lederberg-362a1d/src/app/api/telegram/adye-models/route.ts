/** GET /api/telegram/adye-models?secret=565228988 — cek model list dari Adye API */
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
    const secret = req.nextUrl.searchParams.get('secret')
    if (secret !== process.env.TELEGRAM_OWNER_CHAT_ID) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const apiKey = process.env.ADYE_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'ADYE_API_KEY tidak ada' })

    const res = await fetch('https://adye.dev/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` },
    })
    const data = await res.json()
    return NextResponse.json({ status: res.status, models: data })
}
