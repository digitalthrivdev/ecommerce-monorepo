-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN     "otpProvider" TEXT;

-- CreateTable
CREATE TABLE "OtpProviderCredential" (
    "provider" TEXT NOT NULL,
    "credentials" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OtpProviderCredential_pkey" PRIMARY KEY ("provider")
);
