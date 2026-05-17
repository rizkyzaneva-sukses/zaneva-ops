import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (session.userRole !== 'OWNER') return apiError('Forbidden', 403)

  const { id } = await params
  const body = await request.json()
  const { status, airwaybill, qty, realOmzet, totalProductPrice } = body

  const order = await prisma.order.findUnique({ where: { id } })
  if (!order) return apiError('Order not found', 404)

  const updated = await prisma.order.update({
    where: { id },
    data: {
      ...(status !== undefined && { status }),
      ...(airwaybill !== undefined && { airwaybill }),
      ...(qty !== undefined && { qty: Number(qty) }),
      ...(realOmzet !== undefined && { realOmzet: Number(realOmzet) }),
      ...(totalProductPrice !== undefined && { totalProductPrice: Number(totalProductPrice) }),
    },
  })

  await prisma.auditLog.create({
    data: {
      entityType: 'Order',
      entityId: id,
      action: 'UPDATE',
      note: `Owner edited order ${order.orderNo}`,
      performedBy: session.username,
    }
  })

  return apiSuccess({ message: 'Pesanan berhasil diperbarui', order: updated })
}
