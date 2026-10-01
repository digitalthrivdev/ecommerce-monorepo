-- CreateTable
CREATE TABLE "AppAppearance" (
    "id" TEXT NOT NULL DEFAULT 'app',
    "config" JSONB NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppAppearance_pkey" PRIMARY KEY ("id")
);
