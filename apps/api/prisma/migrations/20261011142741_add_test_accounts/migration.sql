-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN     "riderReviewLoginCodeHash" TEXT,
ADD COLUMN     "riderReviewLoginEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "riderReviewLoginPhone" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isTestAccount" BOOLEAN NOT NULL DEFAULT false;
