/*
  Warnings:

  - Added the required column `subscriptionId` to the `SyncedToCalendar` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "SyncedToCalendar" ADD COLUMN     "subscriptionId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "SyncedToCalendar_subscriptionId_idx" ON "SyncedToCalendar"("subscriptionId");

-- AddForeignKey
ALTER TABLE "SyncedToCalendar" ADD CONSTRAINT "SyncedToCalendar_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
