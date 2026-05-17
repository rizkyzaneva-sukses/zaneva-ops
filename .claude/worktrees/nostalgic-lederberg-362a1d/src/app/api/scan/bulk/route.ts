import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'
import { format } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE', 'STAFF'].includes(session.userRole)) return apiError('Forbidden', 403)

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return apiError('File tidak ditemukan')
    
    const text = await file.text()
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length < 2) return apiError('File CSV kosong atau tidak valid')

    const headerRow = lines[0].split(',').map(h => h.trim().toLowerCase())
    let resiIdx = headerRow.findIndex(h => h.includes('resi') || h.includes('awb'))
    let dateIdx = headerRow.findIndex(h => h.includes('tanggal') || h.includes('date'))

    if (resiIdx === -1) {
      resiIdx = 0
      dateIdx = 1
    }

    const todayDate = formatInTimeZone(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd')
    const jakartaNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))

    const result = {
      success: 0,
      duplicateSkipped: 0,
      notFound: [] as string[]
    }

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',').map(x => x.trim())
      const awb = parts[resiIdx]?.replace(/^"|"$/g, '') // remove quotes if any
      if (!awb) continue
      
      let rawDate = parts[dateIdx]?.replace(/^"|"$/g, '')
      if (!rawDate) rawDate = todayDate

      const matchedOrder = await prisma.order.findFirst({
        where: { airwaybill: awb }
      })

      if (!matchedOrder) {
        result.notFound.push(awb)
        continue
      }

      const exist = await prisma.orderScanLog.findFirst({
        where: { orderNo: matchedOrder.orderNo }
      })

      if (exist) {
        result.duplicateSkipped++
      } else {
        const terkirimStatus = `TERKIRIM | ${rawDate}`

        await prisma.order.updateMany({
          where: { orderNo: matchedOrder.orderNo },
          data: { status: terkirimStatus }
        })

        await prisma.orderScanLog.create({
          data: {
            orderId: matchedOrder.id,
            orderNo: matchedOrder.orderNo,
            scannedAt: jakartaNow,
            scannedBy: session.userId,
            note: 'Bulk Upload'
          }
        })

        await prisma.auditLog.create({
          data: {
            entityType: 'Order',
            action: 'SCAN',
            entityId: matchedOrder.id,
            refOrderNo: matchedOrder.orderNo,
            afterJson: { status: terkirimStatus, airwaybill: awb },
            performedBy: session.username,
          }
        })

        result.success++
      }
    }

    return apiSuccess(result)
  } catch (error) {
    return apiError('Gagal memproses file CSV: ' + (error as any).message)
  }
}
