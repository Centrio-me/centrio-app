-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "isMobile" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "UnreadSummary" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,
    "byMessenger" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnreadSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UnreadSummary_userId_key" ON "UnreadSummary"("userId");

-- AddForeignKey
ALTER TABLE "UnreadSummary" ADD CONSTRAINT "UnreadSummary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

