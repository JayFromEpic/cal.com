/*
  Warnings:

  - The primary key for the `SyncedToCalendar` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `bookingId` on the `SyncedToCalendar` table. All the data in the column will be lost.
  - You are about to drop the column `calComVersionHash` on the `SyncedToCalendar` table. All the data in the column will be lost.
  - You are about to drop the column `externalEventId` on the `SyncedToCalendar` table. All the data in the column will be lost.
  - You are about to drop the column `externalVersionHash` on the `SyncedToCalendar` table. All the data in the column will be lost.
  - You are about to drop the column `lastSyncAt` on the `SyncedToCalendar` table. All the data in the column will be lost.
  - You are about to drop the column `lastSyncDirection` on the `SyncedToCalendar` table. All the data in the column will be lost.
  - The `id` column on the `SyncedToCalendar` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `integration` to the `SyncedToCalendar` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "SyncedToCalendar" DROP CONSTRAINT "SyncedToCalendar_bookingId_fkey";

-- DropIndex
DROP INDEX "SyncedToCalendar_bookingId_externalEventId_key";

-- DropIndex
DROP INDEX "SyncedToCalendar_bookingId_idx";

-- DropIndex
DROP INDEX "SyncedToCalendar_externalEventId_externalCalendarId_idx";

-- AlterTable
ALTER TABLE "BookingReference" ADD COLUMN     "syncedToCalendarId" INTEGER;

-- AlterTable
ALTER TABLE "SyncedToCalendar" DROP CONSTRAINT "SyncedToCalendar_pkey",
DROP COLUMN "bookingId",
DROP COLUMN "calComVersionHash",
DROP COLUMN "externalEventId",
DROP COLUMN "externalVersionHash",
DROP COLUMN "lastSyncAt",
DROP COLUMN "lastSyncDirection",
ADD COLUMN     "integration" TEXT NOT NULL,
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "SyncedToCalendar_pkey" PRIMARY KEY ("id");

-- DropEnum
DROP TYPE "SyncDirection";

-- CreateTable
CREATE TABLE "_BookingToSyncedToCalendar" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_BookingToSyncedToCalendar_AB_unique" ON "_BookingToSyncedToCalendar"("A", "B");

-- CreateIndex
CREATE INDEX "_BookingToSyncedToCalendar_B_index" ON "_BookingToSyncedToCalendar"("B");

-- CreateIndex
CREATE INDEX "SyncedToCalendar_externalCalendarId_idx" ON "SyncedToCalendar"("externalCalendarId");

-- AddForeignKey
ALTER TABLE "BookingReference" ADD CONSTRAINT "BookingReference_syncedToCalendarId_fkey" FOREIGN KEY ("syncedToCalendarId") REFERENCES "SyncedToCalendar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BookingToSyncedToCalendar" ADD CONSTRAINT "_BookingToSyncedToCalendar_A_fkey" FOREIGN KEY ("A") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BookingToSyncedToCalendar" ADD CONSTRAINT "_BookingToSyncedToCalendar_B_fkey" FOREIGN KEY ("B") REFERENCES "SyncedToCalendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
