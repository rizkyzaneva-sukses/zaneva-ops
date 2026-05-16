-- Migration: add_ads_wallet_fields
-- Tambah kolom is_ads_budget dan linked_platform ke tabel wallets
-- untuk tracking ad spend per platform dan kalkulasi ROAS yang akurat.

ALTER TABLE wallets
  ADD COLUMN IF NOT EXISTS is_ads_budget  BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS linked_platform VARCHAR(100)          DEFAULT NULL;

-- Index untuk query ROAS (filter wallet ads per platform)
CREATE INDEX IF NOT EXISTS wallets_is_ads_budget_idx ON wallets (is_ads_budget);
CREATE INDEX IF NOT EXISTS wallets_linked_platform_idx ON wallets (linked_platform);
