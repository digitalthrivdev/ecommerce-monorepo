-- CreateTable
CREATE TABLE "PaymentGatewayCredential" (
    "gateway" TEXT NOT NULL,
    "credentials" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentGatewayCredential_pkey" PRIMARY KEY ("gateway")
);
