import * as Sentry from "@sentry/cloudflare";
import handler from "@tanstack/react-start/server-entry";
import { handleApiV1 } from "./api-v1/router";

export default Sentry.withSentry(
  () => ({
    dsn: "https://412acc40471763ed76cfbd92c70a80e4@o4510288569106432.ingest.us.sentry.io/4510318411579392",

    // Setting this option to true will send default PII data to Sentry.
    // For example, automatic IP address collection on events
    sendDefaultPii: true,
    // integrations: [Sentry.consoleLoggingIntegration()],
    // enableLogs: true,
  }),
  {
    async fetch(req) {
      try {
        const url = new URL(req.url);

        // Intercept API v1 requests
        if (url.pathname.startsWith("/api/v1/")) {
          return await handleApiV1(req);
        }

        return await handler.fetch(req);
      } catch (error) {
        Sentry.captureException(error);

        throw error;
      }
    },
  }
);

// biome-ignore lint/performance/noBarrelFile: <needed for Durable Object export>
export { Repo } from "./do/repo";
