import { handleInboundEmailWebhook } from "@/features/h4a/server/inbound-webhook";

/** Resend inbound webhook (email.received). See ADR-022 and docs/ACCOUNTS.md. */
export async function POST(request: Request) {
  return handleInboundEmailWebhook(request);
}
