-- AlterTable
ALTER TABLE "Delivery" ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "earning" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "DeliveryPartner" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "DeliveryPartner_status_idx" ON "DeliveryPartner"("status");
