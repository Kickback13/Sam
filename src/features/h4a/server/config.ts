import "server-only";

/**
 * Inbound email + job configuration (all optional; missing ⇒ "Not connected").
 *
 *   INBOUND_EMAIL_DOMAIN    domain Resend receives for (e.g. inbound.thehousing4all.com or <id>.resend.app)
 *   RESEND_WEBHOOK_SECRET   signing secret of the Resend webhook (whsec_…)
 *   RESEND_API_KEY          Resend API key (fetches received email bodies; sends owner alerts when on)
 *   INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY   set by the Vercel Inngest integration
 *   INNGEST_DEV             local Inngest dev server (e.g. 1 or http://127.0.0.1:8288)
 */
export type InboundConfig = {
  domain: string | null;
  webhookSecret: string | null;
  apiKey: string | null;
  /** All three are set: forwarded emails can be received and read. */
  connected: boolean;
  missing: string[];
};

export function inboundConfig(
  env: Record<string, string | undefined> = process.env,
): InboundConfig {
  const domain = env.INBOUND_EMAIL_DOMAIN?.trim().toLowerCase() || null;
  const webhookSecret = env.RESEND_WEBHOOK_SECRET?.trim() || null;
  const apiKey = env.RESEND_API_KEY?.trim() || null;
  const missing = [
    domain ? null : "INBOUND_EMAIL_DOMAIN",
    webhookSecret ? null : "RESEND_WEBHOOK_SECRET",
    apiKey ? null : "RESEND_API_KEY",
  ].filter((v): v is string => v !== null);
  return { domain, webhookSecret, apiKey, connected: missing.length === 0, missing };
}

/**
 * Any deployed or production-mode runtime (Vercel production AND previews —
 * previews use the production database — plus `next start`). Unsigned
 * webhooks are refused here.
 */
export function isProductionRuntime(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return (
    env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview" || env.NODE_ENV === "production"
  );
}

/** Background jobs go through Inngest when it's configured; otherwise they run inline. */
export function inngestEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.INNGEST_EVENT_KEY?.trim() || env.INNGEST_DEV?.trim());
}

/** Absolute app origin for links in alert emails (null → no link). */
export function siteUrl(env: Record<string, string | undefined> = process.env): string | null {
  const explicit = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || env.VERCEL_URL?.trim();
  return vercel ? `https://${vercel}` : null;
}
