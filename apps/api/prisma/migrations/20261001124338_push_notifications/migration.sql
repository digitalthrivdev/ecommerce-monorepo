-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('ANDROID', 'IOS');

-- AlterTable
ALTER TABLE "OrderStatusHistory" ADD COLUMN     "notifiedAt" TIMESTAMP(3);

-- Changes made before notifications existed are not sent.
UPDATE "OrderStatusHistory" SET "notifiedAt" = "createdAt";

-- CreateTable
CREATE TABLE "PushToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushToken_token_key" ON "PushToken"("token");

-- CreateIndex
CREATE INDEX "PushToken_userId_updatedAt_idx" ON "PushToken"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_notifiedAt_createdAt_idx" ON "OrderStatusHistory"("notifiedAt", "createdAt");

-- AddForeignKey
ALTER TABLE "PushToken" ADD CONSTRAINT "PushToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
