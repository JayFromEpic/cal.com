/*
  Warnings:

  - Added the required column `credentialId` to the `SyncedToCalendar` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "SyncedToCalendar" ADD COLUMN     "credentialId" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "SyncedToCalendar" ADD CONSTRAINT "SyncedToCalendar_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "Credential"("id") ON DELETE CASCADE ON UPDATE CASCADE;
