# Bi-Directional Calendar Sync MVP Implementation Plan

This plan outlines the steps to implement the Minimum Viable Product (MVP) for bi-directional Google Calendar synchronization, focusing on Phase 1 requirements from the PRD (`Bi-Directional calendar sync.md`).

**Goal:** Automatically synchronize time/date updates and deletions from Google Calendar back to the corresponding bookings in Cal.com.

**Current State:**
*   Webhook handler exists (`packages/app-store/googlecalendar/api/webhook.ts`) to receive Google Calendar change notifications.
*   `CalendarService` has a method (`onWatchedCalendarChange`) called by the webhook, currently fetching and logging event details.
*   E2E tests (`apps/web/playwright/calendar-sync.e2e.ts`) are set up with placeholders.
*   A `mock-calendar-app` is added for testing purposes.

**Implementation Steps:**

1.  **Enhance `BookingReference` Storage:** ✅
    *   Added `calendarEventId` field to the `BookingReference` model and implemented migration to support bidirectional sync with external calendar events.

2.  **Implement Sync Logic in `CalendarService`:** ✅
    *   Developed core logic to handle events from Google Calendar, including deletion and time/date updates.
    *   Added mechanisms to find matching Cal.com bookings and update them appropriately while ignoring past events.

3.  **Refine Webhook Handler:** ✅
    *   Enhanced webhook handler to properly process Google Calendar notifications and route data to the appropriate services.
    *   Implemented robust logging and error handling for troubleshooting and monitoring.

4.  **Implement E2E Tests:**
    *   Create comprehensive tests for calendar sync functionality using the mock calendar app.
    *   Test both cancellation and rescheduling flows to verify bidirectional synchronization works correctly.

TODO:
- [x] DestinationCalendar support Google Channel related records and being updated by cron
- [x] Add calendarEventId field to BookingReference model
- [x] Update createGoogleCalendarReferenceForBooking to store Google Calendar event ID in calendarEventId
- [x] Update processUpdatedEvent to use calendarEventId instead of externalId
- [x] Implement actual booking cancellation and time updates in processUpdatedEvent
- [x] Add lastProcessedTime tracking for reliable synchronization
- [ ] Implement E2E tests
- [ ] Refine webhook handler with better logging and error handling


Later Versions:
- Create a unified channels tracking table:
  - Implement a new table (e.g., GoogleCalendarChannels) that tracks all channel subscriptions
  - Store references to both selected calendars and destination calendars
  - Include a type field to distinguish the calendar type
  - Use this as the single source for channel ID lookups
  - Pros
    - Better visibility into what all channels are are being observed
    - Single Channel can be used by both Selected And Deestination Calendar - So if a subscription is already there for SelectedCalendar, we could reuse that instead of creating a new one which can create more problems down the line
  - Potential Schema
    id: Primary Key (e.g., CUID)
    provider: Enum/String (e.g., 'GOOGLE', 'OUTLOOK')
    type: Enum/String ('DESTINATION', 'SELECTED')
    providerSubscriptionId: String (Unique identifier from the provider, e.g., Google channel ID, MS Graph subscription ID)
    providerResourceId: String (Optional, primarily for Google's resourceId returned on watch setup)
    resourceWatched: String (The specific resource path/URI being watched, e.g., /me/events)
    externalCalendarId: String (The actual ID of the calendar being watched, e.g., user@example.com)
    expiresAt: DateTime (When the subscription/channel expires)
    lastRenewedAt: DateTime (When the subscription was last renewed)
    metadata: JSONB (For provider-specific data like tokens, clientState)
    credentialId: Relation/FK to Credential table (Links to the specific user account connection)
    createdAt: DateTime
    updatedAt: DateTime
    Potentially add indexes on providerSubscriptionId, credentialId, expiresAt.


DOCUMENATION
- Webhook Update documentation: https://developers.google.com/workspace/calendar/api/guides/push

MANUAL TESTING FEEDBACK:
- We might want to make records of the changes we make so that we could debug why a certain booking was cancelled. Maybe set ancelledBy in booking
- There might be multiple subscriptions for the same external calendar and thus for an update we could receive multiple webhooks(depending on how many subscriptions there are) - We might want to think about a strategy to handle this.
   - Keep in mind that close to exporatopn time there could be two subscriptions one expiring and other one that we just created
- What happens if user changes the DestinationCalendar i.e. from email1@gmail.com to email2@gmail.com?
- If we don;'t find a matching Calendar then we don't have the credential as well that we should use to stop watching on that channel. Credential comes from matching DestinationCalendar/SelectedCalendar
  - Tehnically we should never delete a record of a channel that is being watched in cal.com, right now we replace the channelId and that is a problem. We should always create new channels. Implenmeting separate unified channels table might help with this as we create new records for every channel there instead of replacing
- https://developers.google.com/calendar/api/guides/push states that  Notifications are not 100% reliable. Expect a small percentage of messages to get dropped under normal working conditions. Make sure to handle these missing messages gracefully, so that the application still syncs even if no push messages are received.
- Also sometimes push notifications could be delayed, maybe upto an hour in worst cases.
- Recurring events might need to be handled differently 
- There could be multiple destination calendars with same integration and externalId but different eventTypeIds. So, we would need to ensure same googe channel related ids for all of them(Separate tracking table as mentioned above could help with this), but we need to process for the channel only once.


## Alternative Approaches Considered

### Approach: Using `SyncedToCalendar` and `Subscription` Tables

This approach proposes decoupling the calendar watching mechanism from the `DestinationCalendar` table and introducing two new tables:

1.  **`SyncedToCalendar` Table:**
    *   Stores unique combinations of `integration`, `externalId`, and `credentialId` for calendars that have had bookings synced to them.
    *   Includes a relation field (e.g., `bookingReferences`) linking back to `BookingReference` records. This facilitates querying for cleanup by allowing easy access to all bookings associated with a specific synced calendar.
    *   Acts as a central reference for external calendars involved in bookings.

2.  **`Subscription` Table (Unified Channel Tracking):**
    *   Implements the unified channel tracking table previously conceptualized.
    *   Manages the actual provider subscription details (e.g., Google Channel ID, resource ID, expiry).
    *   Links to `Credential` and references the `externalCalendarId`.

3.  **`BookingReference` Modification:**
    *   Add a foreign key (`syncedToCalendarId`) pointing to the `SyncedToCalendar` table.

4.  **Cron Job Logic:**
    *   A primary cron job (potentially separate from the existing `calendar-cache` cron) identifies active `SyncedToCalendar` entries needing a watch (e.g., based on linked future bookings).
    *   Manages subscription creation, renewal, and deletion via the `Subscription` table based on the need identified above.
    *   **Cleanup (Using `lastUsedAt`):** A separate, dedicated cron job is required to periodically clean up `SyncedToCalendar` and associated `Subscription` records.
    *   **Strategy:**
        1.  Add a `lastUsedAt: DateTime` field to the `SyncedToCalendar` model.
        2.  Update this field to `NOW()` whenever a booking associated with the `SyncedToCalendar` record is created or updated.
        3.  The cron job queries for `SyncedToCalendar` records where `lastUsedAt` is older than a defined threshold (e.g., 3-5 months).
        4.  Eligible `SyncedToCalendar` records and their corresponding `Subscription` records are deleted in batches.
    *   **Implementation:** Requires adding the field, updating booking creation/update logic, creating the cron job, and performing an initial data backfill for `lastUsedAt`.
    *   **Limitation:** This approach prioritizes fast booking operations. As `lastUsedAt` is updated on booking activity (not based on `endTime`), the calendar watch (`Subscription`) might remain active for the duration of the threshold *after* the last associated booking has actually ended. This is considered an acceptable trade-off for performance and simplicity, as it avoids complex `endTime` recalculations during booking operations. The scenario where this causes prolonged unnecessary watching (i.e., no bookings created/updated for several months on a specific calendar) is deemed unlikely in practice.

5.  **Webhook Handling:**
    *   Incoming webhooks use the provider's subscription ID (e.g., Google Channel ID) to look up the entry in the `Subscription` table.
    *   This links to the `externalCalendarId`, which maps to the `SyncedToCalendar` record.
    *   Finally, use the provider's event ID (from the webhook payload) and the `syncedToCalendarId` to find the relevant `BookingReference`(s).

**Pros:**

*   Handles cases where users change their `DestinationCalendar` more robustly, as watches are tied to historical syncs (`SyncedToCalendar`) rather than the current setting.
*   Implements the unified `Subscription` table, centralizing channel management and enabling potential reuse/efficiency.
*   Normalizes external calendar identification into the `SyncedToCalendar` table.

**Cons:**

*   Increases architectural complexity with two new tables and modified relationships.
*   Requires careful design of the cron job logic for managing the `Subscription` lifecycle (determining when to start/stop watching based on associated bookings), **including a separate process for cleaning up stale `SyncedToCalendar` and `Subscription` records.**
*   Introduces an extra step in the webhook-to-booking lookup path.
*   Requires careful consideration of indexing and potential performance impacts due to added joins and potentially large table sizes.
