import app_Basecamp3 from "@calcom/app-store/basecamp3/trpc-router";
import app_RoutingForms from "@calcom/app-store/routing-forms/trpc-router";
import { userAdminRouter } from "@calcom/features/ee/users/server/trpc-router";
import { featureFlagRouter } from "@calcom/features/flags/server/router";
import { insightsRouter } from "@calcom/features/insights/server/trpc-router";

import { mergeRouters, router } from "../../trpc";
import { loggedInViewerRouter } from "../loggedInViewer/_router";
import { publicViewerRouter } from "../publicViewer/_router";
import { timezonesRouter } from "../publicViewer/timezones/_router";
import { adminRouter } from "./admin/_router";
import { apiKeysRouter } from "./apiKeys/_router";
import { appsRouter } from "./apps/_router";
import { attributesRouter } from "./attributes/_router";
import { authRouter } from "./auth/_router";
import { availabilityRouter } from "./availability/_router";
import { bookingsRouter } from "./bookings/_router";
import { calVideoRouter } from "./calVideo/_router";
import { calendarsRouter } from "./calendars/_router";
import { credentialsRouter } from "./credentials/_router";
import { delegationCredentialRouter } from "./delegationCredential/_router";
import { deploymentSetupRouter } from "./deploymentSetup/_router";
import { dsyncRouter } from "./dsync/_router";
import { eventTypesRouter } from "./eventTypes/_router";
import { filterSegmentsRouter } from "./filterSegments/_router";
import { googleWorkspaceRouter } from "./googleWorkspace/_router";
import { highPerfRouter } from "./highPerf/_router";
import { i18nRouter } from "./i18n/_router";
import { meRouter } from "./me/_router";
import { oAuthRouter } from "./oAuth/_router";
import { oooRouter } from "./ooo/_router";
import { viewerOrganizationsRouter } from "./organizations/_router";
import { paymentsRouter } from "./payments/_router";
import { routingFormsRouter } from "./routing-forms/_router";
import { slotsRouter } from "./slots/_router";
import { ssoRouter } from "./sso/_router";
import { viewerTeamsRouter } from "./teams/_router";
import { travelSchedulesRouter } from "./travelSchedules/_router";
import { webhookRouter } from "./webhook/_router";
import { workflowsRouter } from "./workflows/_router";

export const viewerRouter = mergeRouters(
  loggedInViewerRouter,

  router({
    apps: appsRouter,
    me: meRouter,
    public: publicViewerRouter,
    auth: authRouter,
    deploymentSetup: deploymentSetupRouter,
    bookings: bookingsRouter,
    calendars: calendarsRouter,
    calVideo: calVideoRouter,
    credentials: credentialsRouter,
    eventTypes: eventTypesRouter,
    availability: availabilityRouter,
    teams: viewerTeamsRouter,
    timezones: timezonesRouter,
    organizations: viewerOrganizationsRouter,
    delegationCredential: delegationCredentialRouter,
    webhook: webhookRouter,
    apiKeys: apiKeysRouter,
    slots: slotsRouter,
    workflows: workflowsRouter,
    saml: ssoRouter,
    dsync: dsyncRouter,
    i18n: i18nRouter,
    insights: insightsRouter,
    payments: paymentsRouter,
    filterSegments: filterSegmentsRouter,
    // NOTE: Add all app related routes in the bottom till the problem described in @calcom/app-store/trpc-routers.ts is solved.
    // After that there would just one merge call here for all the apps.
    appRoutingForms: app_RoutingForms,
    appBasecamp3: app_Basecamp3,
    features: featureFlagRouter,
    users: userAdminRouter,
    oAuth: oAuthRouter,
    googleWorkspace: googleWorkspaceRouter,
    admin: adminRouter,
    attributes: attributesRouter,
    highPerf: highPerfRouter,
    routingForms: routingFormsRouter,
    ooo: oooRouter,
    travelSchedules: travelSchedulesRouter,
  })
);
