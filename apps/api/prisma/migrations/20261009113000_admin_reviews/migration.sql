-- CreateEnum
CREATE TYPE "ReviewSource" AS ENUM ('CUSTOMER', 'ADMIN');

-- AlterTable
ALTER TABLE "ProductReview" ADD COLUMN     "authorName" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "source" "ReviewSource" NOT NULL DEFAULT 'CUSTOMER',
ALTER COLUMN "userId" DROP NOT NULL,
ALTER COLUMN "orderId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Prisma cannot express CHECK constraints in the schema.
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_source_check" CHECK (
  ("source" = 'CUSTOMER' AND "userId" IS NOT NULL AND "orderId" IS NOT NULL AND "authorName" IS NULL)
  OR ("source" = 'ADMIN' AND "userId" IS NULL AND "orderId" IS NULL AND char_length("authorName") BETWEEN 1 AND 40)
);
