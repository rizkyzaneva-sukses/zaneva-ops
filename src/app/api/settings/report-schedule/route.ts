import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'

async function requireOwner() {
    const session = await getSession()
    if (!session.isLoggedIn || session.userRole !== 'OWNER') return null
    return session
}

function parseCronPart(value: string | undefined, fallback: number): number {
    const raw = value?.trim()
    if (!raw) return fallback
    const parsed = Number.parseInt(raw, 10)
    return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * GET /api/settings/report-schedule
 * Ambil jadwal auto-report. Buat default jika belum ada.
 */
export async function GET() {
    if (!await requireOwner()) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }
    try {
        let sched = await prisma.reportSchedule.findFirst()
        if (!sched) {
            sched = await prisma.reportSchedule.create({
                data: { cronSchedule: '30 17 * * *', isActive: true },
            })
        }
        const parts = sched.cronSchedule.split(' ')
        return NextResponse.json({
            success: true,
            data: {
                id:           sched.id,
                cronSchedule: sched.cronSchedule,
                isActive:     sched.isActive,
                hour:         parseCronPart(parts[1], 17),
                minute:       parseCronPart(parts[0], 30),
            },
        })
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message }, { status: 500 })
    }
}

/**
 * PUT /api/settings/report-schedule
 * Body: { hour?: number, minute?: number, isActive?: boolean }
 * Perubahan langsung aktif di scheduler tanpa restart.
 */
export async function PUT(request: NextRequest) {
    if (!await requireOwner()) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }
    try {
        const body     = await request.json()
        const hour     = body.hour   !== undefined ? Number(body.hour)   : null
        const minute   = body.minute !== undefined ? Number(body.minute) : null
        const isActive = body.isActive !== undefined ? Boolean(body.isActive) : null

        let sched = await prisma.reportSchedule.findFirst()

        if (!sched) {
            sched = await prisma.reportSchedule.create({
                data: { cronSchedule: '30 17 * * *', isActive: true },
            })
        }

        const parts    = sched.cronSchedule.split(' ')
        const newMin   = minute   !== null ? minute   : parseCronPart(parts[0], 30)
        const newHour  = hour     !== null ? hour     : parseCronPart(parts[1], 17)
        const newActive = isActive !== null ? isActive : sched.isActive

        // Validasi
        if (newMin < 0 || newMin > 59 || newHour < 0 || newHour > 23) {
            return NextResponse.json({ success: false, error: 'Jam/menit tidak valid' }, { status: 400 })
        }

        const newCron = `${newMin} ${newHour} * * *`

        await prisma.reportSchedule.update({
            where: { id: sched.id },
            data:  { cronSchedule: newCron, isActive: newActive },
        })

        return NextResponse.json({
            success: true,
            message: `Jadwal diupdate: ${String(newHour).padStart(2,'0')}:${String(newMin).padStart(2,'0')} WIB`,
            data:    { cronSchedule: newCron, isActive: newActive, hour: newHour, minute: newMin },
        })
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message }, { status: 500 })
    }
}
