import type { NextApiRequest } from "next";
import { z } from "zod";

import { getCredentialForCalendarCache } from "@calcom/lib/delegationCredential/server";
import { HttpError } from "@calcom/lib/http-error";
import logger from "@calcom/lib/logger";
import { safeStringify } from "@calcom/lib/safeStringify";
import { SelectedCalendarRepository } from "@calcom/lib/server/repository/selectedCalendar";
import prisma from "@calcom/prisma";

import { getCalendar } from "../../_utils/getCalendar";
import type GoogleCalendarService from "../lib/CalendarService";

const log = logger.getSubLogger({ prefix: ["GoogleCalendarWebhook"] });

const googleHeadersSchema = z.object({
  "x-goog-channel-expiration": z.string(), // Sat, 22 Mar 2025 19:14:43 GMT
  "x-goog-channel-id": z.string(), // xxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  "x-goog-channel-token": z.string(), // XXXXXXXXXXXXXXXXXXx/XXXXXXXXXXXX=
  "x-goog-message-number": z.string(), // 398005
  "x-goog-resource-id": z.string(), // XXXXXXXXXXXXXXXXXX_XXX
  /**
   * 'exists' - Resource exists and is changed
   * 'not_found' - Resource has been deleted
   * 'sync' - Initial sync when someone subscribes to the channel
   */
  "x-goog-resource-state": z.string(),
  "x-goog-resource-uri": z.string(), // https://www.googleapis.com/calendar/v3/calendars/user%40example.com/events?alt=json
});

// Use "destination" to represent calendars tracked via SyncedToCalendar
type CalendarType = "selected" | "destination";

async function getCalendarFromChannelId(channelId: string, resourceId: string) {
  // 1. Query Subscription first, as it's the central point for new webhook handling
  const subscription = await prisma.subscription.findFirst({
    where: {
      providerSubscriptionId: channelId,
    },
  });

  // 2. Concurrently query SelectedCalendar and SyncedToCalendar (if subscription found)
  const [selectedCalendar, syncedCalendars] = await Promise.all([
    SelectedCalendarRepository.findFirstByGoogleChannelIdAndResourceId(channelId, resourceId),
    subscription
      ? prisma.syncedToCalendar.findMany({
          where: { subscriptionId: subscription.id },
          include: { credential: true }, // Include credential for later use
        })
      : Promise.resolve([]), // If no subscription, no synced calendars
  ]);

  const calendarTypes: CalendarType[] = [];
  let googleCalendarId: string | null = null;
  let credentialId: number | null = null;
  let sourceCalendarRecordId: number | null = null; // To track which record (selected/synced) provided the info

  log.info("selectedCalendar", safeStringify(selectedCalendar));
  log.info("syncedCalendars", safeStringify(syncedCalendars));
  if (selectedCalendar) {
    calendarTypes.push("selected");
    googleCalendarId = selectedCalendar.externalId;
    credentialId = selectedCalendar.credentialId;
    sourceCalendarRecordId = selectedCalendar.id;
    log.debug(
      "Found selected calendar record",
      safeStringify({ channelId, resourceId, selectedCalendarId: selectedCalendar.id })
    );
  }

  if (syncedCalendars.length > 0) {
    calendarTypes.push("destination");
    // Use the first synced calendar's info if no selected calendar was found, or verify consistency
    const firstSynced = syncedCalendars[0];
    if (!googleCalendarId) {
      googleCalendarId = firstSynced.externalCalendarId;
      credentialId = firstSynced.credentialId;
      sourceCalendarRecordId = firstSynced.id;
      log.debug(
        "Using synced calendar record",
        safeStringify({ channelId, resourceId, syncedCalendarId: firstSynced.id })
      );
    } else if (googleCalendarId !== firstSynced.externalCalendarId) {
      // This case should ideally not happen if SelectedCalendar and SyncedToCalendar point to the same external resource
      // for the *same* subscription. If it does, it indicates a potential inconsistency.
      log.error(
        "Data inconsistency: Selected calendar externalId and Synced calendar externalId do not match for the same subscription.",
        safeStringify({
          channelId,
          resourceId,
          selectedExternalId: googleCalendarId,
          syncedExternalId: firstSynced.externalCalendarId,
          selectedCalendarId: selectedCalendar?.id,
          syncedCalendarId: firstSynced.id,
          subscriptionId: subscription?.id,
        })
      );

      throw new HttpError({
        statusCode: 500,
        message:
          "Data inconsistency: Selected calendar externalId and Synced calendar externalId do not match for the same subscription.",
      });
    }
    if (!credentialId) {
      credentialId = firstSynced.credentialId;
    } else if (credentialId !== firstSynced.credentialId) {
      log.warn(
        "Credential mismatch between selected and synced calendar records for the same subscription.",
        safeStringify({
          channelId,
          resourceId,
          selectedCredentialId: credentialId,
          syncedCredentialId: firstSynced.credentialId,
        })
      );
    }
  }

  // If neither selected nor synced calendars are found
  if (calendarTypes.length === 0) {
    log.warn(
      "No selected or synced calendar records found for subscription",
      safeStringify({ channelId, resourceId, subscriptionId: subscription?.id })
    );
    return {
      calendarService: null,
      googleCalendarId: null,
      calendarTypes,
      subscriptionId: subscription?.id ?? null, // Return subscriptionId if found
    };
  }

  // Ensure we have a credential ID to proceed
  if (!credentialId) {
    // This should theoretically not happen if calendarTypes is not empty
    log.error(
      "Logical error: Found calendar types but no credential ID.",
      safeStringify({
        channelId,
        resourceId,
        calendarTypes,
        sourceCalendarRecordId,
        subscriptionId: subscription?.id,
      })
    );
    throw new HttpError({
      statusCode: 500,
      message: `Internal error: Could not determine credential for calendar processing (Channel: ${channelId}, Resource: ${resourceId}).`,
    });
  }

  // Fetch the credential using the determined credentialId
  const credentialForCalendarCache = await getCredentialForCalendarCache({ credentialId: credentialId });
  if (!credentialForCalendarCache) {
    // Throw specific error if credential fetch fails
    throw new HttpError({
      statusCode: 404, // Or 500 if credential should always exist here
      message: `No credential found for credentialId: ${credentialId} (associated with ${calendarTypes.join(
        " & "
      )} calendar, source ID: ${sourceCalendarRecordId}, Channel: ${channelId}, Resource: ${resourceId})`,
    });
  }

  const calendarService = (await getCalendar(credentialForCalendarCache)) as GoogleCalendarService | null;

  if (!calendarService) {
    // Throw error if calendar service initialization fails
    throw new HttpError({
      statusCode: 500, // Service init failure is likely an internal issue
      message: `Failed to initialize calendar service for credential: ${credentialId}`,
    });
  }

  return {
    calendarService,
    googleCalendarId, // This is the crucial external ID for the Google API call
    calendarTypes,
    subscriptionId: subscription?.id ?? null, // Pass subscription ID for potential updates
  };
}

export async function postHandler(req: NextApiRequest) {
  let channelId: string | undefined;
  let resourceId: string | undefined;
  let subscriptionId: number | null = null; // Initialize subscriptionId

  try {
    const parsedHeaders = googleHeadersSchema.parse(req.headers);
    channelId = parsedHeaders["x-goog-channel-id"];
    resourceId = parsedHeaders["x-goog-resource-id"];
    const channelToken = parsedHeaders["x-goog-channel-token"];
    const resourceState = parsedHeaders["x-goog-resource-state"];

    if (channelToken !== process.env.GOOGLE_WEBHOOK_TOKEN) {
      throw new HttpError({ statusCode: 403, message: "Invalid API key" });
    }
    // channelId and resourceId are validated by schema parsing now
    if (channelId !== "cb5b3f92-b570-425b-9ae2-67d6608fff2b") {
      // prevent spam while testing
      return { message: "ok" };
    }
    const calendarInfo = await getCalendarFromChannelId(channelId, resourceId);
    log.info("calendarInfo", safeStringify(calendarInfo));
    subscriptionId = calendarInfo.subscriptionId; // Store subscriptionId for potential update/logging

    const { calendarService, googleCalendarId, calendarTypes } = calendarInfo;

    if (!googleCalendarId || calendarTypes.length === 0) {
      // Log already happened in getCalendarFromChannelId
      // Consider stopping the watch if no records found? Maybe handled elsewhere.
      return {
        message: `No active selected or synced calendar records found for channelId ${channelId} and resourceId ${resourceId}. Subscription ID: ${subscriptionId}`,
      };
    }

    // Now we have the actual Google Calendar ID (googleCalendarId) and the resourceId
    log.info(
      `Processing webhook for ${calendarTypes.join(" & ")} Calendar(s): ${googleCalendarId}`,
      safeStringify({
        calendarTypes: calendarTypes.join(", "),
        googleCalendarId,
        resourceId,
        resourceState,
        channelId,
        subscriptionId, // Add subscriptionId to logs
        messageNumber: req.headers["x-goog-message-number"],
      })
    );

    if (!calendarService?.onWatchedCalendarChange) {
      // Log error with more context
      log.error(
        "Calendar service does not support onWatchedCalendarChange",
        safeStringify({
          credentialId: calendarService?.credential.id,
          calendarTypes,
          googleCalendarId,
          channelId,
          resourceId,
          subscriptionId,
        })
      );
      throw new HttpError({
        statusCode: 501,
        message: "Calendar service does not support onWatchedCalendarChange",
      }); // 501 Not Implemented might be suitable
    }

    // Pass the correct Google Calendar ID, resourceId, resourceState and the relevant calendarTypes
    await calendarService.onWatchedCalendarChange(googleCalendarId, resourceId, resourceState, calendarTypes);

    log.debug(
      `Successfully processed webhook for type(s): ${calendarTypes.join(", ")}`,
      safeStringify({
        calendarTypes,
        googleCalendarId,
        resourceId,
        channelId,
        subscriptionId, // Add subscriptionId to logs
        messageNumber: req.headers["x-goog-message-number"],
      })
    );

    // Update Subscription.lastSyncAt if a subscription was identified and processing was successful
    if (subscriptionId !== null) {
      try {
        await prisma.subscription.update({
          where: { id: subscriptionId },
          data: { lastSyncAt: new Date() }, // Update last sync time
        });
        log.debug(
          "Updated lastSyncAt for subscription",
          safeStringify({ subscriptionId, resourceId, channelId })
        );
      } catch (error) {
        log.error(
          "Failed to update lastSyncAt for subscription",
          safeStringify(error),
          safeStringify({ subscriptionId, resourceId, channelId })
        );
        // Decide if this failure should impact the overall response (e.g., return 500?)
        // For now, log the error but return "ok" as the primary webhook logic succeeded.
      }
    } else {
      // This case might occur if only a selectedCalendar was found without a corresponding new Subscription record yet.
      // This might be expected during transition or if selectedCalendars don't always have a linked Subscription.
      log.info(
        "No subscription ID found to update lastSyncAt, likely processing for SelectedCalendar only.",
        safeStringify({ channelId, resourceId, calendarTypes })
      );
    }

    // REMOVED: prisma.destinationCalendar.updateMany block

    return { message: "ok" };
  } catch (error) {
    // Log with context if available
    const context = { channelId, resourceId, subscriptionId };
    if (error instanceof z.ZodError) {
      log.error(
        "Invalid webhook headers",
        safeStringify({ error: error.errors, headers: req.headers, context })
      );
      throw new HttpError({ statusCode: 400, message: "Invalid request headers" });
    }
    if (error instanceof HttpError) {
      // Log HttpErrors with context before re-throwing
      log.error(
        `HttpError processing webhook: ${error.message}`,
        safeStringify({ statusCode: error.statusCode, context })
      );
      throw error;
    }
    log.error("Unexpected error processing webhook", safeStringify(error), safeStringify({ context }));
    throw new HttpError({ statusCode: 500, message: "Internal server error" });
  }
}
