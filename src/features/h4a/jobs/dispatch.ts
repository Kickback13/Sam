import "server-only";

import { inngestEnabled } from "../server/config";
import { inngest } from "./client";
import { INBOUND_EMAIL_EVENT, processInboundEmailJob, type InboundEmailJob } from "./inbound-email";

/**
 * Queue the job on Inngest when it's configured (production, previews, local
 * dev server); otherwise run it right away. Both paths run the same code.
 */
export async function dispatchInboundEmail(job: InboundEmailJob) {
  if (inngestEnabled()) {
    await inngest.send({ name: INBOUND_EMAIL_EVENT, data: job, id: `h4a-email-${job.emailId}` });
    return { mode: "queued" as const };
  }
  const result = await processInboundEmailJob(job);
  return { mode: "inline" as const, result };
}
