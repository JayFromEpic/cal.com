/*
  Warnings:

  - You are about to drop the column `error` on the `DestinationCalendar` table. All the data in the column will be lost.
  - You are about to drop the column `googleChannelExpiration` on the `DestinationCalendar` table. All the data in the column will be lost.
  - You are about to drop the column `googleChannelId` on the `DestinationCalendar` table. All the data in the column will be lost.
  - You are about to drop the column `googleChannelKind` on the `DestinationCalendar` table. All the data in the column will be lost.
  - You are about to drop the column `googleChannelResourceId` on the `DestinationCalendar` table. All the data in the column will be lost.
  - You are about to drop the column `googleChannelResourceUri` on the `DestinationCalendar` table. All the data in the column will be lost.
  - You are about to drop the column `lastProcessedTime` on the `DestinationCalendar` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ERROR', 'PENDING');

-- CreateEnum
CREATE TYPE "SyncDirection" AS ENUM ('TO_EXTERNAL', 'FROM_EXTERNAL');

-- AlterTable
ALTER TABLE "DestinationCalendar" DROP COLUMN "error",
DROP COLUMN "googleChannelExpiration",
DROP COLUMN "googleChannelId",
DROP COLUMN "googleChannelKind",
DROP COLUMN "googleChannelResourceId",
DROP COLUMN "googleChannelResourceUri",
DROP COLUMN "lastProcessedTime";

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "credentialId" INTEGER NOT NULL,
    "externalCalendarId" TEXT NOT NULL,
    "providerType" TEXT NOT NULL,
    "providerSubscriptionId" TEXT,
    "providerSubscriptionKind" TEXT,
    "providerResourceId" TEXT,
    "providerResourceUri" TEXT,
    "providerExpiration" TIMESTAMP(3),
    "providerSyncToken" TEXT,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "webhookUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncedToCalendar" (
    "id" TEXT NOT NULL,
    "bookingId" INTEGER NOT NULL,
    "externalCalendarId" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "lastSyncAt" TIMESTAMP(3) NOT NULL,
    "lastSyncDirection" "SyncDirection" NOT NULL,
    "calComVersionHash" TEXT,
    "externalVersionHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncedToCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Subscription_credentialId_idx" ON "Subscription"("credentialId");

-- CreateIndex
CREATE INDEX "Subscription_providerSubscriptionId_idx" ON "Subscription"("providerSubscriptionId");

-- CreateIndex
CREATE INDEX "Subscription_status_providerExpiration_idx" ON "Subscription"("status", "providerExpiration");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_credentialId_externalCalendarId_key" ON "Subscription"("credentialId", "externalCalendarId");

-- CreateIndex
CREATE INDEX "SyncedToCalendar_bookingId_idx" ON "SyncedToCalendar"("bookingId");

-- CreateIndex
CREATE INDEX "SyncedToCalendar_externalEventId_externalCalendarId_idx" ON "SyncedToCalendar"("externalEventId", "externalCalendarId");

-- CreateIndex
CREATE UNIQUE INDEX "SyncedToCalendar_bookingId_externalEventId_key" ON "SyncedToCalendar"("bookingId", "externalEventId");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "Credential"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncedToCalendar" ADD CONSTRAINT "SyncedToCalendar_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
