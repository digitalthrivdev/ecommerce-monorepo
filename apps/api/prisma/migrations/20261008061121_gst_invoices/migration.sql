-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveryFeeGstRate" DECIMAL(5,2),
ADD COLUMN     "deliveryFeeTax" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "interStateSupply" BOOLEAN,
ADD COLUMN     "sellerAddress" TEXT,
ADD COLUMN     "sellerGstin" TEXT,
ADD COLUMN     "sellerName" TEXT;

-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN     "deliveryFeeGstRate" DECIMAL(5,2) NOT NULL DEFAULT 18,
ADD COLUMN     "gstin" TEXT;

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "gstin" TEXT;

-- CreateIndex
CREATE INDEX "Delivery_deliveredAt_idx" ON "Delivery"("deliveredAt");

-- CreateIndex
CREATE INDEX "Payment_paidAt_idx" ON "Payment"("paidAt");

-- Prisma cannot express CHECK constraints in the schema. The API also checks the GSTIN's checksum.
ALTER TABLE "PlatformSettings" ADD CONSTRAINT "PlatformSettings_gstin_check" CHECK ("gstin" ~ '^[0-9]{2}[A-Z0-9]{13}$');
ALTER TABLE "PlatformSettings" ADD CONSTRAINT "PlatformSettings_deliveryFeeGstRate_check" CHECK ("deliveryFeeGstRate" >= 0 AND "deliveryFeeGstRate" < 100);
ALTER TABLE "Store" ADD CONSTRAINT "Store_gstin_check" CHECK ("gstin" ~ '^[0-9]{2}[A-Z0-9]{13}$');
ALTER TABLE "Order" ADD CONSTRAINT "Order_deliveryFeeTax_check" CHECK (
  "deliveryFeeTax" >= 0 AND "deliveryFeeTax" <= "deliveryFee" AND ("deliveryFeeGstRate" IS NULL OR ("deliveryFeeGstRate" >= 0 AND "deliveryFeeGstRate" < 100))
);
ALTER TABLE "Order" ADD CONSTRAINT "Order_seller_check" CHECK (("sellerAddress" IS NULL) = ("interStateSupply" IS NULL));
