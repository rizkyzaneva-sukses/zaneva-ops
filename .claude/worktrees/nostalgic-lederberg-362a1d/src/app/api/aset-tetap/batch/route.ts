import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

// POST /api/aset-tetap/batch — bulk import dari CSV
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER'].includes(session.userRole)) return apiError('Hanya Owner yang dapat mengimpor aset', 403)

  const body = await request.json()
  const { rows } = body as { rows: { namaAset: string; nilaiPerolehan: string; tanggalBeli: string; umurEkonomisThn: string; note?: string }[] }

  if (!rows?.length) return apiError('Tidak ada data untuk diimport')

  const errors: string[] = []
  const inserts: any[] = []

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const rowNum = i + 2 // baris CSV (header = 1)
    if (!r.namaAset?.trim())       { errors.push(`Baris ${rowNum}: namaAset kosong`); continue }
    const nilai = parseInt(String(r.nilaiPerolehan).replace(/[^0-9]/g, ''))
    if (!nilai || isNaN(nilai))    { errors.push(`Baris ${rowNum}: nilaiPerolehan tidak valid`); continue }
    const tgl = new Date(r.tanggalBeli)
    if (isNaN(tgl.getTime()))      { errors.push(`Baris ${rowNum}: tanggalBeli tidak valid (gunakan YYYY-MM-DD)`); continue }
    const umur = parseInt(r.umurEkonomisThn)
    if (!umur || isNaN(umur) || umur <= 0) { errors.push(`Baris ${rowNum}: umurEkonomisThn tidak valid`); continue }

    inserts.push({
      namaAset:       r.namaAset.trim(),
      nilaiPerolehan: nilai,
      tanggalBeli:    tgl,
      umurEkonomisThn: umur,
      note:           r.note?.trim() || null,
      createdBy:      session.username,
    })
  }

  if (!inserts.length) return apiError(`Tidak ada baris valid. Error: ${errors.join('; ')}`)

  await prisma.asetTetap.createMany({ data: inserts })

  return apiSuccess({
    inserted: inserts.length,
    errors,
    message: `${inserts.length} aset berhasil diimport${errors.length ? `, ${errors.length} baris gagal` : ''}`,
  }, 201)
}
