-- CreateEnum
CREATE TYPE "InventoryAdjustmentReason" AS ENUM ('RESTOCK', 'CORRECTION', 'DAMAGE', 'ORDER_UNAVAILABLE');

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "maxOrderQuantity" INTEGER;

-- CreateTable
CREATE TABLE "StoreHours" (
    "storeId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "opensAt" TEXT NOT NULL,
    "closesAt" TEXT NOT NULL,

    CONSTRAINT "StoreHours_pkey" PRIMARY KEY ("storeId","dayOfWeek")
);

-- CreateTable
CREATE TABLE "InventoryAdjustment" (
    "id" TEXT NOT NULL,
    "storeProductId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "quantityAfter" INTEGER NOT NULL,
    "reason" "InventoryAdjustmentReason" NOT NULL,
    "note" TEXT,
    "changedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryAdjustment_storeProductId_createdAt_idx" ON "InventoryAdjustment"("storeProductId", "createdAt");

-- AddForeignKey
ALTER TABLE "StoreHours" ADD CONSTRAINT "StoreHours_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryAdjustment" ADD CONSTRAINT "InventoryAdjustment_storeProductId_fkey" FOREIGN KEY ("storeProductId") REFERENCES "StoreProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prisma cannot express CHECK constraints in the schema.
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_maxOrderQuantity_check"
  CHECK ("maxOrderQuantity" IS NULL OR "maxOrderQuantity" >= 1);

ALTER TABLE "StoreHours" ADD CONSTRAINT "StoreHours_check"
  CHECK (
    "dayOfWeek" BETWEEN 0 AND 6
    AND "opensAt" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    AND "closesAt" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    AND "opensAt" <> "closesAt"
  );
