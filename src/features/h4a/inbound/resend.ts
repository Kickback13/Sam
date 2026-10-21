/**
 * Resend inbound ("Receiving") integration.
 *
 * The email.received webhook carries metadata only (no body). The body comes
 * from GET https://api.resend.com/emails/receiving/{email_id} with the API key.
 * Shapes match the official resend SDK types (resend@6: ReceivedEmailEventData,
 * GetReceivingEmailResponseSuccess). This only ever fetches the email itself —
 * never a link inside it.
 */
import { z } from "zod";

export const receivedEventSchema = z.object({
  type: z.literal("email.received"),
  created_at: z.string(),
  data: z.object({
    email_id: z.string().min(1).max(200),
    created_at: z.string().optional(),
    from: z.string().max(1000).default(""),
    to: z.array(z.string().max(500)).max(100).default([]),
    cc: z.array(z.string().max(500)).max(100).nullish(),
    bcc: z.array(z.string().max(500)).max(100).nullish(),
    received_for: z.array(z.string().max(500)).max(100).nullish(),
    message_id: z.string().max(998).nullish(),
    subject: z.string().max(998).nullish(),
  }),
});
export type ReceivedEvent = z.infer<typeof receivedEventSchema>;

export const receivedEmailSchema = z.object({
  id: z.string(),
  from: z.string().nullish(),
  subject: z.string().nullish(),
  html: z.string().nullish(),
  text: z.string().nullish(),
  created_at: z.string().nullish(),
});
export type ReceivedEmail = z.infer<typeof receivedEmailSchema>;

/** Every address the email was delivered to (received_for covers catch-all routing). */
export function recipientsOf(event: ReceivedEvent): string[] {
  return [
    ...(event.data.received_for ?? []),
    ...event.data.to,
    ...(event.data.cc ?? []),
    ...(event.data.bcc ?? []),
  ];
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export async function fetchReceivedEmail(
  emailId: string,
  opts: { apiKey: string; baseUrl?: string; fetch?: FetchLike },
): Promise<ReceivedEmail> {
  const base = (opts.baseUrl ?? "https://api.resend.com").replace(/\/$/, "");
  const res = await (opts.fetch ?? fetch)(
    `${base}/emails/receiving/${encodeURIComponent(emailId)}?html_format=cid`,
    { headers: { Authorization: `Bearer ${opts.apiKey}`, Accept: "application/json" } },
  );
  if (!res.ok) throw new Error(`Resend returned ${res.status} for email ${emailId}`);
  return receivedEmailSchema.parse(await res.json());
}
