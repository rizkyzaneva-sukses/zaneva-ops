import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

export async function GET() {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (session.userRole !== 'OWNER') return apiError('Forbidden', 403)

  const settings = await prisma.appSetting.findMany()
  const map = Object.fromEntries(settings.map(s => [s.key, s.value]))
  return apiSuccess(map)
}

export async function PATCH(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (session.userRole !== 'OWNER') return apiError('Forbidden', 403)

  const body = await request.json()
  const { key, value } = body
  if (!key || value === undefined) return apiError('key dan value wajib diisi')

  const setting = await prisma.appSetting.upsert({
    where: { key },
    update: { value: String(value), updatedBy: session.username },
    create: { key, value: String(value), updatedBy: session.username },
  })
  return apiSuccess(setting)
}
