import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError, getPagination } from '@/lib/utils'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const { searchParams } = request.nextUrl
  const search = searchParams.get('search') || ''
  const all = searchParams.get('all') === 'true'

  if (all) {
    const vendors = await prisma.vendor.findMany({
      where: { isActive: true },
      orderBy: { namaVendor: 'asc' },
    })
    return apiSuccess(vendors)
  }

  const { skip, take } = getPagination({
    page: Number(searchParams.get('page') || 1),
    limit: Number(searchParams.get('limit') || 20),
  })

  const where = {
    ...(search && {
      OR: [
        { namaVendor: { contains: search, mode: 'insensitive' as const } },
        { vendorCode: { contains: search, mode: 'insensitive' as const } },
      ],
    }),
  }

  const [vendors, total] = await Promise.all([
    prisma.vendor.findMany({ where, orderBy: { namaVendor: 'asc' }, skip, take }),
    prisma.vendor.count({ where }),
  ])

  return apiSuccess({ vendors, total })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const body = await request.json()
  const { vendorCode, namaVendor, kontak, email, alamat, rekening, bank, termPayment } = body

  if (!vendorCode || !namaVendor) return apiError('Kode dan nama vendor wajib diisi')

  const existing = await prisma.vendor.findUnique({ where: { vendorCode } })
  if (existing) return apiError(`Kode vendor "${vendorCode}" sudah digunakan`)

  const vendor = await prisma.vendor.create({
    data: { vendorCode, namaVendor, kontak, email, alamat, rekening, bank,
            termPayment: termPayment || 0, createdBy: session.username },
  })
  return apiSuccess(vendor, 201)
}
