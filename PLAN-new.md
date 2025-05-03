# Bi-Directional Calendar Sync Implementation Plan (Alternative Approach)

This plan outlines the steps to transition from the current Google Calendar push notification mechanism embedded in `DestinationCalendar`/`SelectedCalendar` to a more robust and extensible approach using dedicated `Subscription` and `SyncedToCalendar` tables **for destination calendars**, while leaving the `SelectedCalendar` watch mechanism unchanged.

**1. Understand the Goal:**

Implement a bi-directional calendar synchronization system primarily for destination calendars that:

*   Is provider-agnostic (initially focusing on replacing the Google mechanism for destination calendars, but designed for extension).
*   Explicitly tracks the synchronization state of individual events synced via destination calendars.
*   Separates the concerns of managing *destination calendar* subscriptions from tracking event sync status.
*   Uses dedicated tables (`Subscription`, `SyncedToCalendar`) for clarity and maintainability for destination calendar sync.
*   **Maintains the existing Google watch mechanism for `SelectedCalendar`.**

-   **Define New Prisma Schema Models:** [COMPLETED]

Add the following models to `packages/prisma/schema.prisma`.

*   **`Subscription` Table:** Manages all the existing subscriptions to third-party calendars.
*   **`SyncedToCalendar` Table:** Stores metadata about external calendars to which events have been synced, linked to their subscription(to sync updates back from them)
*   **`BookingReference` Modifications:** Add relation to `SyncedToCalendar`.
*   **`Booking` Modifications:** Add relation to `SyncedToCalendar`.

-   **Refactor Cron Job & Google Webhook Handler:**

*   **Cron Job (`packages/features/calendar-cache/api/cron.ts`):**
    *   **Add `handleSyncedCalendarSubscription`:** This function handles both creation and renewal of subscriptions.
        *   **Identify Candidates:** Periodically query `SyncedToCalendar` records for relevant providers (e.g., `google_calendar`).
        *   **Process Each Candidate:** For each `SyncedToCalendar` record:
            *   Use `SyncedToCalendar.credentialId` to initialize the calendar service.
            *   **Check `subscriptionId`:**
                *   **If `subscriptionId` is `null` (Creation):**
                    *   Call the provider's subscribe/watch API.
                    *   On success, create a new `Subscription` record with the returned details.
                    *   Update the `SyncedToCalendar` record, setting its `subscriptionId` to the new Subscription's ID.
                    *   Handle API/database errors, potentially setting `Subscription.status` to ERROR.
                *   **If `subscriptionId` is not `null` (Renewal/Management):**
                    *   Fetch the linked `Subscription` record.
                    *   Check its `status` (e.g., `ERROR`) and `providerExpiration`.
                    *   If renewal is needed (due to impending expiration or retrying an error), call the provider's subscribe/watch API.
                    *   On success, update the existing `Subscription` record with new details (expiration, resource ID, sync token, status = `ACTIVE`, clear `lastError`).
                    *   Handle API/database errors, updating `Subscription.status` to `ERROR` and setting `lastError`.

*   **Google Webhook Handler (`packages/app-store/googlecalendar/api/webhook.ts`):**
    *   Query `Subscription` by `providerSubscriptionId` if found we have someone subscribed to this calendar.
        - if there are syncedToCalendar entries, it means we need to get the recent events from the calendar(use the first record of syncedToCalendar for now) - We call onWatchedCalendarChange
        - if there are no syncedToCalendar entries, it means there is nothing to sync from.
    *   Update `Subscription.lastSyncAt` and `Subscription.providerSyncToken`.
    *   Ensure `BookingReference.calendarEventId` is still set to `externalEventId`.

**6. Refactor Core Booking Logic (Create/Update/Delete):**

*   **Identify Sync Targets:** On `Booking` CUD, check `User`'s `Credentials`, `DestinationCalendar`, `SelectedCalendar`.
*   **Push to External (Destination Calendar):** If syncing via `DestinationCalendar`, use `Credential` to call provider API.
*   **Push to External (Selected Calendar):** If syncing via `SelectedCalendar`, use the existing logic.
