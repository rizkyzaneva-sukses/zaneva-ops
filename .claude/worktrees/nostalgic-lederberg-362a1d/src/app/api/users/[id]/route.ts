import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'
import bcrypt from 'bcryptjs'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (session.userRole !== 'OWNER') return apiError('Forbidden', 403)

  const body = await request.json()
  const { fullName, userRole, isActive, newPassword } = body

  const updateData: any = { fullName, userRole, isActive }
  if (newPassword) {
    updateData.passwordHash = await bcrypt.hash(newPassword, 12)
  }

  const user = await prisma.appUser.update({
    where: { id: (await params).id },
    data: updateData,
    select: { id: true, username: true, fullName: true, userRole: true, isActive: true },
  })
  return apiSuccess(user)
}
