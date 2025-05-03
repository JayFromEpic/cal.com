/*
  Warnings:

  - You are about to drop the `_BookingToSyncedToCalendar` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[bookingId]` on the table `SyncedToCalendar` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[bookingReferenceId]` on the table `SyncedToCalendar` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "BookingReference" DROP CONSTRAINT "BookingReference_syncedToCalendarId_fkey";

-- DropForeignKey
ALTER TABLE "_BookingToSyncedToCalendar" DROP CONSTRAINT "_BookingToSyncedToCalendar_A_fkey";

-- DropForeignKey
ALTER TABLE "_BookingToSyncedToCalendar" DROP CONSTRAINT "_BookingToSyncedToCalendar_B_fkey";

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "syncedToCalendarId" INTEGER;

-- AlterTable
ALTER TABLE "SyncedToCalendar" ADD COLUMN     "bookingId" INTEGER,
ADD COLUMN     "bookingReferenceId" INTEGER;

-- DropTable
DROP TABLE "_BookingToSyncedToCalendar";

-- CreateIndex
CREATE UNIQUE INDEX "SyncedToCalendar_bookingId_key" ON "SyncedToCalendar"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "SyncedToCalendar_bookingReferenceId_key" ON "SyncedToCalendar"("bookingReferenceId");

-- AddForeignKey
ALTER TABLE "SyncedToCalendar" ADD CONSTRAINT "SyncedToCalendar_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncedToCalendar" ADD CONSTRAINT "SyncedToCalendar_bookingReferenceId_fkey" FOREIGN KEY ("bookingReferenceId") REFERENCES "BookingReference"("id") ON DELETE CASCADE ON UPDATE CASCADE;
