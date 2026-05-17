import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

// GET /api/scan — list batches
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)

  const batches = await prisma.inventoryScanBatch.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  return apiSuccess(batches)
}

// POST /api/scan — create draft batch
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE', 'STAFF'].includes(session.userRole)) return apiError('Forbidden', 403)

  const body = await request.json()
  const { direction, reason, items, itemsWithDetails } = body
  // items: { [sku]: qty } OR itemsWithDetails: [{ sku, qty, trxDate, note }]

  const finalItems = itemsWithDetails || items;

  if (!direction || !finalItems || (Array.isArray(finalItems) ? finalItems.length === 0 : Object.keys(finalItems).length === 0)) {
    return apiError('Data scan tidak valid')
  }

  const batch = await prisma.inventoryScanBatch.create({
    data: {
      batchDate: new Date(),
      direction,
      reason: reason || null,
      status: 'DRAFT',
      itemsJson: finalItems,
      scannedBy: session.userId,
      createdBy: session.username,
    },
  })

  return apiSuccess(batch, 201)
}
