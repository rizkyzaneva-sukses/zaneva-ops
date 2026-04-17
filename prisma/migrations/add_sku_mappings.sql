CREATE TABLE "sku_mappings" (
  "id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" TEXT,
  "from_sku" TEXT NOT NULL,
  "to_sku" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT "sku_mappings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sku_mappings_from_sku_key" ON "sku_mappings"("from_sku");
