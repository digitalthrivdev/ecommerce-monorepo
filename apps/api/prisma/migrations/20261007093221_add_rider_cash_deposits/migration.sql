-- AlterTable
ALTER TABLE "DeliveryPartner" ADD COLUMN     "cashSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN     "riderCashLimit" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "CashDeposit" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "storeId" TEXT,
    "note" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,

    CONSTRAINT "CashDeposit_pkey" PRIMARY KEY ("id")
);

-- Prisma cannot express CHECK constraints in the schema.
ALTER TABLE "CashDeposit" ADD CONSTRAINT "CashDeposit_amount_check" CHECK ("amount" > 0);
ALTER TABLE "CashDeposit" ADD CONSTRAINT "CashDeposit_void_check"
  CHECK (("voidedAt" IS NULL) = ("voidReason" IS NULL));
ALTER TABLE "PlatformSettings" ADD CONSTRAINT "PlatformSettings_riderCashLimit_check"
  CHECK ("riderCashLimit" IS NULL OR "riderCashLimit" > 0);

-- CreateIndex
CREATE INDEX "CashDeposit_partnerId_createdAt_idx" ON "CashDeposit"("partnerId", "createdAt");

-- CreateIndex
CREATE INDEX "CashDeposit_storeId_createdAt_idx" ON "CashDeposit"("storeId", "createdAt");

-- AddForeignKey
ALTER TABLE "CashDeposit" ADD CONSTRAINT "CashDeposit_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "DeliveryPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashDeposit" ADD CONSTRAINT "CashDeposit_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashDeposit" ADD CONSTRAINT "CashDeposit_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashDeposit" ADD CONSTRAINT "CashDeposit_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
