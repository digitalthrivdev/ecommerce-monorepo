-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ComplaintStatus" ADD VALUE 'APPROVED';
ALTER TYPE "ComplaintStatus" ADD VALUE 'RECEIVED';

-- AlterTable
ALTER TABLE "Complaint" ADD COLUMN     "reverseAwb" TEXT,
ADD COLUMN     "reverseCourierName" TEXT,
ADD COLUMN     "reverseTrackingUrl" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "rtoReceivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN     "returnWindowDays" INTEGER NOT NULL DEFAULT 7;
