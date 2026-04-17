import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

// POST /api/sku-mappings/import — bulk import dari array JSON { fromSku, toSku }[]
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const body = await request.json()
  const rows: { fromSku: string; toSku: string }[] = body.rows ?? []

  if (!Array.isArray(rows) || rows.length === 0) return apiError('Data kosong')

  const errors: string[] = []
  let imported = 0
  let updated = 0

  for (let i = 0; i < rows.length; i++) {
    const fromSku = String(rows[i].fromSku ?? '').trim()
    const toSku = String(rows[i].toSku ?? '').trim()

    if (!fromSku || !toSku) {
      errors.push(`Baris ${i + 1}: fromSku dan toSku wajib diisi`)
      continue
    }

    try {
      const existing = await prisma.skuMapping.findUnique({ where: { fromSku } })
      if (existing) {
        await prisma.skuMapping.update({ where: { fromSku }, data: { toSku, isActive: true } })
        updated++
      } else {
        await prisma.skuMapping.create({
          data: { fromSku, toSku, isActive: true, createdBy: session.username },
        })
        imported++
      }
    } catch {
      errors.push(`Baris ${i + 1} (${fromSku}): gagal disimpan`)
    }
  }

  return apiSuccess({
    imported,
    updated,
    errors,
    message: `${imported} ditambahkan, ${updated} diperbarui${errors.length > 0 ? `, ${errors.length} error` : ''}.`,
  })
}
