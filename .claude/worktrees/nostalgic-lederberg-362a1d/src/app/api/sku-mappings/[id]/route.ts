import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

// PUT /api/sku-mappings/[id] — update mapping
export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const body = await request.json()
  const fromSku = String(body.fromSku ?? '').trim()
  const toSku = String(body.toSku ?? '').trim()

  if (!fromSku || !toSku) return apiError('fromSku dan toSku wajib diisi')

  // Cek duplikat fromSku (selain diri sendiri)
  const dup = await prisma.skuMapping.findFirst({
    where: { fromSku, NOT: { id: params.id } },
  })
  if (dup) return apiError(`SKU "${fromSku}" sudah dipakai oleh mapping lain`)

  const mapping = await prisma.skuMapping.update({
    where: { id: params.id },
    data: { fromSku, toSku },
  })

  return apiSuccess(mapping)
}
