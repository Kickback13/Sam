import "server-only";

import { inngest } from "./client";
import { INBOUND_EMAIL_EVENT, processInboundEmailJob, type InboundEmailJob } from "./inbound-email";

/**
 * Forwarded alert email → fetch body → parse → dedupe → score → alert.
 * Retried up to 4 times with Inngest's backoff; one email at a time per
 * workspace (the database also serializes ingestion per workspace).
 */
export const processInboundEmail = inngest.createFunction(
  {
    id: "h4a-process-inbound-email",
    name: "Deal Finder: process forwarded email",
    retries: 4,
    triggers: [{ event: INBOUND_EMAIL_EVENT }],
    concurrency: { limit: 1, key: "event.data.workspaceSlug" },
  },
  async ({ event, step }) => {
    const job = event.data as InboundEmailJob;
    return step.run("fetch-parse-ingest", () => processInboundEmailJob(job));
  },
);

export const h4aFunctions = [processInboundEmail];
