-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('PENDING', 'AWB_ASSIGNED', 'PICKUP_SCHEDULED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'NDR', 'RTO_IN_TRANSIT', 'RTO_DELIVERED', 'CANCELLED', 'LOST');

-- AlterEnum
-- The grocery steps map onto the new lifecycle: accepted and picking orders are confirmed, ready ones packed.
BEGIN;
CREATE TYPE "OrderStatus_new" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'PACKED', 'SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'RTO');
ALTER TABLE "public"."Order" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Order" ALTER COLUMN "status" TYPE "OrderStatus_new" USING (CASE "status"::text WHEN 'STORE_ACCEPTED' THEN 'CONFIRMED' WHEN 'PICKING' THEN 'CONFIRMED' WHEN 'READY_FOR_PICKUP' THEN 'PACKED' ELSE "status"::text END::"OrderStatus_new");
ALTER TABLE "OrderStatusHistory" ALTER COLUMN "fromStatus" TYPE "OrderStatus_new" USING (CASE "fromStatus"::text WHEN 'STORE_ACCEPTED' THEN 'CONFIRMED' WHEN 'PICKING' THEN 'CONFIRMED' WHEN 'READY_FOR_PICKUP' THEN 'PACKED' ELSE "fromStatus"::text END::"OrderStatus_new");
ALTER TABLE "OrderStatusHistory" ALTER COLUMN "toStatus" TYPE "OrderStatus_new" USING (CASE "toStatus"::text WHEN 'STORE_ACCEPTED' THEN 'CONFIRMED' WHEN 'PICKING' THEN 'CONFIRMED' WHEN 'READY_FOR_PICKUP' THEN 'PACKED' ELSE "toStatus"::text END::"OrderStatus_new");
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
DROP TYPE "public"."OrderStatus_old";
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'PENDING_PAYMENT';
COMMIT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "invoicedAt" TIMESTAMP(3);

-- Invoices numbered so far were numbered on delivery.
UPDATE "Order" o SET "invoicedAt" = coalesce(
  (SELECT min(h."createdAt") FROM "OrderStatusHistory" h WHERE h."orderId" = o.id AND h."toStatus" = 'DELIVERED'),
  o."updatedAt"
) WHERE o."invoiceNumber" IS NOT NULL;

-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN     "shippingProvider" TEXT;

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerOrderId" TEXT,
    "providerShipmentId" TEXT,
    "awb" TEXT,
    "courierName" TEXT,
    "trackingUrl" TEXT,
    "labelUrl" TEXT,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'PENDING',
    "statusAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "weightGrams" INTEGER NOT NULL,
    "lengthCm" DECIMAL(7,2) NOT NULL,
    "breadthCm" DECIMAL(7,2) NOT NULL,
    "heightCm" DECIMAL(7,2) NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentEvent" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "status" "ShipmentStatus" NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "description" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingCarrierCredential" (
    "carrier" TEXT NOT NULL,
    "credentials" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShippingCarrierCredential_pkey" PRIMARY KEY ("carrier")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_orderId_key" ON "Shipment"("orderId");

-- CreateIndex
CREATE INDEX "Shipment_provider_providerShipmentId_idx" ON "Shipment"("provider", "providerShipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_provider_awb_key" ON "Shipment"("provider", "awb");

-- CreateIndex
CREATE INDEX "ShipmentEvent_shipmentId_occurredAt_idx" ON "ShipmentEvent"("shipmentId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentEvent_shipmentId_providerEventId_key" ON "ShipmentEvent"("shipmentId", "providerEventId");

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentEvent" ADD CONSTRAINT "ShipmentEvent_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Parcels have a weight and a size.
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_parcel_check"
  CHECK ("weightGrams" > 0 AND "lengthCm" > 0 AND "breadthCm" > 0 AND "heightCm" > 0);
