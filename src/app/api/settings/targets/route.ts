import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'
import { TARGET_KEY_PREFIX, ymWIB } from '@/lib/dashboard-helpers'

/**
 * Format key target di AppSetting:
 *   target.YYYY-MM.omzet
 *   target.YYYY-MM.netProfit
 */
function targetKeys(ym: string) {
  return {
    omzet: `${TARGET_KEY_PREFIX}${ym}.omzet`,
    netProfit: `${TARGET_KEY_PREFIX}${ym}.netProfit`,
  }
}

const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/

/**
 * GET /api/settings/targets?ym=YYYY-MM
 *  - Tanpa ym: return target untuk bulan ini + 2 bulan ke depan
 *  - Dengan ym: return target untuk bulan tsb
 */
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const { searchParams } = new URL(request.url)
  const ymParam = searchParams.get('ym')

  let yms: string[] = []
  if (ymParam) {
    if (!YM_RE.test(ymParam)) return apiError('Format ym harus YYYY-MM')
    yms = [ymParam]
  } else {
    const now = new Date()
    for (let i = 0; i < 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
      yms.push(ymWIB(d))
    }
  }

  const allKeys = yms.flatMap((ym) => Object.values(targetKeys(ym)))
  const rows = await prisma.appSetting.findMany({ where: { key: { in: allKeys } } })
  const map = new Map(rows.map((r: { key: string; value: string }) => [r.key, r.value]))

  const data = yms.map((ym) => {
    const k = targetKeys(ym)
    const omzet = map.get(k.omzet)
    const netProfit = map.get(k.netProfit)
    return {
      ym,
      omzet: omzet ? Number(omzet) : null,
      netProfit: netProfit ? Number(netProfit) : null,
    }
  })

  return apiSuccess(ymParam ? data[0] : data)
}

/**
 * POST /api/settings/targets
 * body: { ym: 'YYYY-MM', omzet?: number|null, netProfit?: number|null }
 *  - Pass null untuk clear target.
 */
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (session.userRole !== 'OWNER') return apiError('Forbidden', 403)

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return apiError('Body tidak valid')
  const { ym, omzet, netProfit } = body as {
    ym?: string
    omzet?: number | null
    netProfit?: number | null
  }
  if (!ym || !YM_RE.test(ym)) return apiError('Field ym (YYYY-MM) wajib')

  const keys = targetKeys(ym)
  const ops: Promise<unknown>[] = []

  const upsert = (key: string, value: number) =>
    prisma.appSetting.upsert({
      where: { key },
      update: { value: String(value), updatedBy: session.username },
      create: { key, value: String(value), updatedBy: session.username },
    })

  if (omzet !== undefined) {
    if (omzet === null) {
      ops.push(prisma.appSetting.deleteMany({ where: { key: keys.omzet } }))
    } else if (typeof omzet === 'number' && omzet >= 0 && Number.isFinite(omzet)) {
      ops.push(upsert(keys.omzet, Math.round(omzet)))
    } else {
      return apiError('omzet harus angka >= 0 atau null')
    }
  }

  if (netProfit !== undefined) {
    if (netProfit === null) {
      ops.push(prisma.appSetting.deleteMany({ where: { key: keys.netProfit } }))
    } else if (typeof netProfit === 'number' && Number.isFinite(netProfit)) {
      ops.push(upsert(keys.netProfit, Math.round(netProfit)))
    } else {
      return apiError('netProfit harus angka atau null')
    }
  }

  if (ops.length === 0) return apiError('Tidak ada field untuk diupdate')

  await Promise.all(ops)

  // Return state baru
  const rows = await prisma.appSetting.findMany({ where: { key: { in: Object.values(keys) } } })
  const map = new Map(rows.map((r: { key: string; value: string }) => [r.key, r.value]))
  return apiSuccess({
    ym,
    omzet: map.get(keys.omzet) ? Number(map.get(keys.omzet)) : null,
    netProfit: map.get(keys.netProfit) ? Number(map.get(keys.netProfit)) : null,
  })
}
