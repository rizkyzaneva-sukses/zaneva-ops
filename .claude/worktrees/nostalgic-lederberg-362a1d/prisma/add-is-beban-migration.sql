-- Migration: Tambah kolom is_beban ke master_expense_categories
-- Jalankan di database production sebelum deploy

ALTER TABLE master_expense_categories 
  ADD COLUMN IF NOT EXISTS is_beban BOOLEAN NOT NULL DEFAULT true;

-- Update kategori yang sudah ada: semua default = true (beban / masuk L/R)
-- Ini sudah ditangani oleh DEFAULT true di atas

-- Verifikasi
SELECT id, name, "group", is_beban, is_active, is_system 
FROM master_expense_categories 
ORDER BY "group", name;
