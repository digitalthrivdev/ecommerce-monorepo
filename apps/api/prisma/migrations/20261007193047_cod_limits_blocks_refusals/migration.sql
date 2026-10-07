-- CreateEnum
CREATE TYPE "CustomerBlock" AS ENUM ('COD', 'ALL');

-- CreateEnum
CREATE TYPE "DeliveryFailure" AS ENUM ('REFUSED', 'UNREACHABLE', 'OTHER');

-- AlterTable
ALTER TABLE "Delivery" ADD COLUMN     "failure" "DeliveryFailure";

-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN     "codMaxOrderValue" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "orderBlock" "CustomerBlock",
ADD COLUMN     "orderBlockReason" TEXT,
ADD COLUMN     "orderBlockedAt" TIMESTAMP(3),
ADD COLUMN     "orderBlockedById" TEXT;

-- CreateIndex
CREATE INDEX "Delivery_failure_idx" ON "Delivery"("failure");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_orderBlockedById_fkey" FOREIGN KEY ("orderBlockedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A block always has its reason and date; only customers can be blocked.
ALTER TABLE "User" ADD CONSTRAINT "User_orderBlock_check" CHECK (
  ("orderBlock" IS NULL) = ("orderBlockReason" IS NULL)
  AND ("orderBlock" IS NULL) = ("orderBlockedAt" IS NULL)
  AND ("orderBlock" IS NULL OR "role" = 'CUSTOMER')
);

-- Only a cancelled delivery has a failure outcome.
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_failure_check" CHECK ("failure" IS NULL OR "status" = 'CANCELLED');

ALTER TABLE "PlatformSettings" ADD CONSTRAINT "PlatformSettings_codMaxOrderValue_check" CHECK ("codMaxOrderValue" IS NULL OR "codMaxOrderValue" > 0);
