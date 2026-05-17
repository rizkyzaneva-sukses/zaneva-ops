-- =============================================================
-- FIX: Update order trx_date
--      menggunakan released_date dari payout (Waktu Dana Dilepaskan)
--
-- Alternatif SQL langsung jika ingin langsung di psql / DBeaver.
-- Cara lebih aman: gunakan API endpoint POST /api/payouts/backfill-dates
--   { "dryRun": true }  → preview
--   { "dryRun": false } → eksekusi
--
-- Jalankan sekali saja di database production.
-- Orders yang tidak memiliki payout tidak tersentuh.
-- =============================================================

-- 1. Preview dulu — cek berapa order yang akan ter-update
SELECT
  o.id,
  o.order_no,
  o.platform,
  o.order_created_at   AS old_order_created_at,
  o.trx_date           AS old_trx_date,
  p.released_date      AS new_trx_date
FROM orders o
JOIN payouts p ON p.order_no = o.order_no
WHERE p.released_date IS NOT NULL
  AND (
    -- hanya update jika trx_date berbeda dari released_date (beda hari)
    o.trx_date IS NULL
    OR DATE(o.trx_date AT TIME ZONE 'Asia/Jakarta') IS DISTINCT FROM
       DATE(p.released_date AT TIME ZONE 'Asia/Jakarta')
  )
ORDER BY o.platform, p.released_date DESC
LIMIT 100;

-- =============================================================
-- 2. Eksekusi update (jalankan setelah preview OK)
-- =============================================================

UPDATE orders o
SET
  trx_date   = p.released_date,
  updated_at = NOW()
FROM payouts p
WHERE p.order_no = o.order_no
  AND p.released_date IS NOT NULL
  AND (
    o.trx_date IS NULL
    OR DATE(o.trx_date AT TIME ZONE 'Asia/Jakarta') IS DISTINCT FROM
       DATE(p.released_date AT TIME ZONE 'Asia/Jakarta')
  );

-- Cek hasil
SELECT COUNT(*) AS total_updated
FROM orders o
JOIN payouts p ON p.order_no = o.order_no
WHERE DATE(o.trx_date AT TIME ZONE 'Asia/Jakarta') =
      DATE(p.released_date AT TIME ZONE 'Asia/Jakarta');
