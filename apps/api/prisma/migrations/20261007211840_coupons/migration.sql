-- CreateEnum
CREATE TYPE "CouponDiscountType" AS ENUM ('FLAT', 'PERCENT');

-- AlterTable
ALTER TABLE "Cart" ADD COLUMN     "couponCode" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "couponCode" TEXT,
ADD COLUMN     "couponId" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "discount" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "discountType" "CouponDiscountType" NOT NULL,
    "discountValue" DECIMAL(10,2) NOT NULL,
    "maxDiscount" DECIMAL(10,2),
    "minOrderValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "totalLimit" INTEGER,
    "perCustomerLimit" INTEGER,
    "firstOrderOnly" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

-- CreateIndex
CREATE INDEX "Coupon_isActive_createdAt_idx" ON "Coupon"("isActive", "createdAt");

-- CreateIndex
CREATE INDEX "Order_couponId_userId_idx" ON "Order"("couponId", "userId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prisma cannot express CHECK constraints in the schema.
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_code_check" CHECK ("code" ~ '^[A-Z0-9]{3,20}$');
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_discountValue_check" CHECK (
  "discountValue" > 0 AND ("discountType" = 'FLAT' OR "discountValue" <= 100)
);
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_maxDiscount_check" CHECK (
  "maxDiscount" IS NULL OR ("discountType" = 'PERCENT' AND "maxDiscount" > 0)
);
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_minOrderValue_check" CHECK ("minOrderValue" >= 0);
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_dates_check" CHECK ("startsAt" IS NULL OR "endsAt" IS NULL OR "endsAt" > "startsAt");
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_limits_check" CHECK (
  ("totalLimit" IS NULL OR "totalLimit" > 0) AND ("perCustomerLimit" IS NULL OR "perCustomerLimit" > 0)
);
ALTER TABLE "Order" ADD CONSTRAINT "Order_coupon_check" CHECK (("couponId" IS NULL) = ("couponCode" IS NULL));
ALTER TABLE "Order" ADD CONSTRAINT "Order_discount_check" CHECK ("discount" >= 0);
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_discount_check" CHECK ("discount" >= 0);
