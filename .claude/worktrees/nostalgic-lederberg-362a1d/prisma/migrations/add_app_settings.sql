CREATE TABLE "app_settings" (
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "updated_by" TEXT,
  CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

INSERT INTO "app_settings" ("key", "value", "updated_at") VALUES
  ('biaya_admin_shopee', '14', NOW()),
  ('biaya_admin_tiktok', '14.1', NOW());
