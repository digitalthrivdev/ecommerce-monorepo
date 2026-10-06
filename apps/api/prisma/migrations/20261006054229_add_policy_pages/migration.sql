-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN     "businessAddress" TEXT,
ADD COLUMN     "businessName" TEXT;

-- CreateTable
CREATE TABLE "PolicyPage" (
    "slug" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PolicyPage_pkey" PRIMARY KEY ("slug")
);
