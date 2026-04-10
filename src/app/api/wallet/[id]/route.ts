import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

// PUT /api/wallet/[id] — update wallet
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const body = await request.json()
  const { name, isActive } = body

  const wallet = await prisma.wallet.update({
    where: { id: (await params).id },
    data: {
      ...(name && { name }),
      ...(isActive !== undefined && { isActive }),
    },
  })

  return apiSuccess(wallet)
}
