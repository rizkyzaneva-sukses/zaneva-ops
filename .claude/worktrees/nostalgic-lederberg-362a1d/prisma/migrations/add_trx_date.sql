-- Migration: Add trx_date column to orders table
-- Run this once on Production DB before deploying new code.
-- Safe: no data is deleted, only a nullable column added.

-- Step 1: Add the column (idempotent with IF NOT EXISTS)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS trx_date TIMESTAMPTZ;

-- Step 2: Populate trx_date for existing data
-- Handles two mixed formats:
--   Shopee  → "2026-04-09 06:19"    (YYYY-MM-DD HH:mm)
--   TikTok  → "09/04/2026 00:17:22" (DD/MM/YYYY HH:mm:ss)
UPDATE orders 
SET trx_date = CASE
  -- Shopee format: starts with YYYY-MM-DD
  WHEN order_created_at ~ '^\d{4}-\d{2}-\d{2}'
    THEN (regexp_replace(order_created_at, ' ', 'T') || ':00+07:00')::timestamptz
  -- TikTok format: starts with DD/MM/YYYY
  WHEN order_created_at ~ '^\d{2}/\d{2}/\d{4}'
    THEN to_timestamp(
      CASE 
        WHEN order_created_at ~ '^\d{2}/\d{2}/\d{4} \d{2}:\d{2}:\d{2}$'
          THEN order_created_at
        ELSE order_created_at || ' 00:00:00'
      END,
      'DD/MM/YYYY HH24:MI:SS'
    ) AT TIME ZONE 'Asia/Jakarta'
  -- Fallback: use the record's created_at
  ELSE created_at
END
WHERE trx_date IS NULL;

-- Step 3: Verify results
-- SELECT COUNT(*) total, COUNT(trx_date) populated FROM orders;
