import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'
import bcrypt from 'bcryptjs'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (session.userRole !== 'OWNER') return apiError('Forbidden', 403)

  const users = await prisma.appUser.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, username: true, fullName: true, userRole: true, isActive: true, createdAt: true },
  })
  return apiSuccess(users)
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (session.userRole !== 'OWNER') return apiError('Forbidden', 403)

  const { username, password, fullName, userRole } = await request.json()
  if (!username || !password || !userRole) return apiError('Username, password, dan role wajib diisi')

  const existing = await prisma.appUser.findUnique({ where: { username: username.toLowerCase() } })
  if (existing) return apiError('Username sudah digunakan')

  const passwordHash = await bcrypt.hash(password, 12)
  const user = await prisma.appUser.create({
    data: { username: username.toLowerCase(), passwordHash, fullName, userRole },
    select: { id: true, username: true, fullName: true, userRole: true, isActive: true },
  })
  return apiSuccess(user, 201)
}
