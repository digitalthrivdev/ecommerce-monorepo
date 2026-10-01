/*
  Warnings:

  - You are about to drop the column `storeId` on the `CartItem` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "CartItem" DROP CONSTRAINT "CartItem_storeId_fkey";

-- AlterTable
ALTER TABLE "Cart" ADD COLUMN     "storeId" TEXT;

-- AlterTable
ALTER TABLE "CartItem" DROP COLUMN "storeId";

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
