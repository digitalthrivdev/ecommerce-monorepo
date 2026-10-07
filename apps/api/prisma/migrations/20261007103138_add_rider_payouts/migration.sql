-- CreateEnum
CREATE TYPE "PayoutMethod" AS ENUM ('CASH', 'UPI', 'BANK_TRANSFER', 'OTHER');

-- AlterTable
ALTER TABLE "DeliveryPartner" ADD COLUMN     "earningsSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "RiderPayout" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "method" "PayoutMethod" NOT NULL,
    "note" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,

    CONSTRAINT "RiderPayout_pkey" PRIMARY KEY ("id")
);

-- Prisma cannot express CHECK constraints in the schema.
ALTER TABLE "RiderPayout" ADD CONSTRAINT "RiderPayout_amount_check" CHECK ("amount" > 0);
ALTER TABLE "RiderPayout" ADD CONSTRAINT "RiderPayout_void_check"
  CHECK (("voidedAt" IS NULL) = ("voidReason" IS NULL));

-- CreateIndex
CREATE INDEX "RiderPayout_partnerId_paidAt_idx" ON "RiderPayout"("partnerId", "paidAt");

-- AddForeignKey
ALTER TABLE "RiderPayout" ADD CONSTRAINT "RiderPayout_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "DeliveryPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiderPayout" ADD CONSTRAINT "RiderPayout_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiderPayout" ADD CONSTRAINT "RiderPayout_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
