-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN     "playStoreUrl" TEXT,
ADD COLUMN     "reviewLoginCodeHash" TEXT,
ADD COLUMN     "reviewLoginEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewLoginPhone" TEXT,
ADD COLUMN     "websiteTagline" TEXT;
