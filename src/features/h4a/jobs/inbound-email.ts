import "server-only";

import { alertEmailConfig } from "../alerts/email";
import { sanitizeEmailHtml } from "../email/html";
import { fetchReceivedEmail, type FetchLike } from "../inbound/resend";
import { processEmail } from "../pipeline/pipeline";
import { inboundConfig, siteUrl } from "../server/config";
import { inboundClient, inboundStore } from "../server/stores";

export const INBOUND_EMAIL_EVENT = "h4a/inbound.email.received";

/** Event data. `token` is the forwarding-address token — the same capability as the address itself. */
export type InboundEmailJob = {
  emailId: string;
  providerEmailId: string;
  token: string;
  workspaceSlug: string | null;
  from: string | null;
  subject: string | null;
  receivedAt: string | null;
};

const MAX_TEXT = 500_000;

/**
 * Fetch the body from Resend, store it (sanitized), parse it and ingest the
 * listings it contains. Safe to retry: dedupe means a retry updates, never
 * duplicates. Never follows links inside the email.
 */
export async function processInboundEmailJob(
  job: InboundEmailJob,
  opts: { fetch?: FetchLike; apiBaseUrl?: string } = {},
) {
  const cfg = inboundConfig();
  const store = inboundStore(inboundClient(), job.token, job.emailId);
  if (!cfg.apiKey) {
    await store.updateEmail({
      body_status: "failed",
      parse_status: "failed",
      error: "RESEND_API_KEY isn't set, so the email body can't be read.",
    });
    return { status: "not_connected" as const };
  }

  const body = await fetchReceivedEmail(job.providerEmailId, {
    apiKey: cfg.apiKey,
    baseUrl: opts.apiBaseUrl ?? process.env.RESEND_API_BASE_URL,
    fetch: opts.fetch,
  });
  await store.updateEmail({
    text_body: body.text ? body.text.slice(0, MAX_TEXT) : null,
    html_body: body.html ? sanitizeEmailHtml(body.html) : null,
    body_status: "stored",
    attempt: true,
  });

  const site = siteUrl();
  const outcome = await processEmail(
    store,
    {
      from: body.from ?? job.from,
      subject: body.subject ?? job.subject,
      text: body.text ?? null,
      html: body.html ?? null,
      receivedAt: job.receivedAt ?? body.created_at ?? null,
    },
    "email",
    alertEmailConfig(),
    site && job.workspaceSlug ? `${site}/w/${job.workspaceSlug}` : null,
  );
  return {
    status: "processed" as const,
    parser: outcome.parse.parserKey,
    listings: outcome.pipeline.results.length,
    alerts: outcome.pipeline.alerts.length,
  };
}
