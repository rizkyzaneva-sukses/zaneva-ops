-- Migration: Add platform breakdown fields to payouts table
-- Run this ONCE on Production DB via EasyPanel → PostgreSQL → SQL console.
-- Safe: additive only, no data deleted, all new columns have defaults.

-- Step 1: Add new columns (idempotent with IF NOT EXISTS)
ALTER TABLE payouts
  ADD COLUMN IF NOT EXISTS platform           VARCHAR(20),
  ADD COLUMN IF NOT EXISTS platform_fee_other INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS beban_ongkir       INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source             VARCHAR(30) DEFAULT 'manual_csv';

-- Step 2: Backfill platform for existing rows
-- Rows uploaded via old CSV manual → default to 'Shopee'
-- (adjust manually in DB if you have existing TikTok payout data)
UPDATE payouts
  SET platform = 'Shopee'
WHERE platform IS NULL;

-- Step 3: Verify
-- SELECT COUNT(*) total, COUNT(platform) with_platform FROM payouts;
-- SELECT DISTINCT platform FROM payouts;
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'payouts' ORDER BY ordinal_position;
