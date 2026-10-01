-- CreateTable
CREATE TABLE "PlatformSettings" (
    "id" TEXT NOT NULL DEFAULT 'platform',
    "deliveryFee" DECIMAL(10,2) NOT NULL,
    "freeDeliveryThreshold" DECIMAL(10,2),
    "minOrderValue" DECIMAL(10,2) NOT NULL,
    "deliveryPartnerFee" DECIMAL(10,2) NOT NULL,
    "supportPhone" TEXT,
    "supportEmail" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);
