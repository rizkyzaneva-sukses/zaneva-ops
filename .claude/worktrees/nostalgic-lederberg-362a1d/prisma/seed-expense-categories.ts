/**
 * Script untuk seed MasterExpenseCategory
 * Jalankan dengan: npx ts-node prisma/seed-expense-categories.ts
 * atau via: npx prisma db seed (jika dikonfigurasi)
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const CATEGORIES = [
  // Beban Pokok Penjualan (System - tidak bisa diedit/hapus)
  { name: 'HPP Produk', group: 'Beban Pokok Penjualan', isSystem: true },
  { name: 'Beban Ongkir Retur', group: 'Beban Pokok Penjualan', isSystem: true },

  // Beban Operasional
  { name: 'Gaji & Tunjangan', group: 'Beban Operasional', isSystem: false },
  { name: 'Biaya Iklan & Marketing', group: 'Beban Operasional', isSystem: false },
  { name: 'Listrik & Air', group: 'Beban Operasional', isSystem: false },
  { name: 'Internet & Komunikasi', group: 'Beban Operasional', isSystem: false },
  { name: 'Sewa Tempat', group: 'Beban Operasional', isSystem: false },
  { name: 'Perlengkapan Kantor', group: 'Beban Operasional', isSystem: false },
  { name: 'Transportasi', group: 'Beban Operasional', isSystem: false },
  { name: 'Biaya Packaging', group: 'Beban Operasional', isSystem: false },
  { name: 'Biaya Admin Bank', group: 'Beban Operasional', isSystem: false },

  // Beban Lain-lain
  { name: 'Lain-lain', group: 'Beban Lain-lain', isSystem: false },
]

async function main() {
  console.log('🌱 Seeding MasterExpenseCategory...')
  for (const cat of CATEGORIES) {
    await prisma.masterExpenseCategory.upsert({
      where: { name: cat.name },
      update: { group: cat.group, isSystem: cat.isSystem },
      create: cat,
    })
    console.log(`  ✓ ${cat.name} (${cat.group})`)
  }
  console.log('✅ Selesai!')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
