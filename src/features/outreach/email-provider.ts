/**
 * Newsletter email provider (Resend). Built and tested, but "Not connected"
 * until Sam's Resend account is set up. Sending is enabled only when ALL hold:
 *
 *   OUTREACH_EMAIL=on       explicit switch (off by default, everywhere)
 *   RESEND_API_KEY          Sam's Resend key (same key as inbound/alerts)
 *   not a Vercel preview    previews share the production database, so a
 *                           preview must never send to real contacts
 *
 * The From address comes from Settings → Outreach (its domain must be verified
 * in Resend). One-click unsubscribe headers (RFC 8058) go on every message.
 */

export type EmailConfig = {
  enabled: boolean;
  apiKey: string | null;
  /** Why sending is off, for the UI ("Not connected" card). */
  reason: string | null;
};

export function outreachEmailConfig(
  env: Record<string, string | undefined> = process.env,
): EmailConfig {
  const apiKey = env.RESEND_API_KEY?.trim() || null;
  const on = env.OUTREACH_EMAIL?.trim().toLowerCase() === "on";
  const reason =
    env.VERCEL_ENV === "preview"
      ? "Preview deployments never send email (they share the production database)."
      : !on
        ? "Newsletter sending is switched off (OUTREACH_EMAIL is not on)."
        : !apiKey
          ? "Resend isn't connected (RESEND_API_KEY is not set)."
          : null;
  return { enabled: reason === null, apiKey, reason };
}

export type OutgoingEmail = {
  /** Our id for this recipient (newsletter_sends.id) — echoed back in results. */
  ref: string;
  from: string;
  to: string;
  replyTo: string | null;
  subject: string;
  html: string;
  text: string;
  unsubscribeUrl: string;
};

export type SendOutcome =
  | { ref: string; ok: true; providerId: string | null }
  | {
      ref: string;
      ok: false;
      error: string;
    };

export interface EmailProvider {
  /** Sends up to BATCH_SIZE emails; returns one outcome per input, in order. */
  sendBatch(emails: OutgoingEmail[]): Promise<SendOutcome[]>;
}

/** Resend's batch endpoint takes up to 100 emails per call. */
export const BATCH_SIZE = 100;

export function resendProvider(cfg: EmailConfig, fetchImpl: typeof fetch = fetch): EmailProvider {
  return {
    async sendBatch(emails) {
      if (!cfg.enabled || !cfg.apiKey) throw new Error(cfg.reason ?? "Email isn't connected.");
      if (emails.length === 0) return [];
      if (emails.length > BATCH_SIZE) throw new Error(`At most ${BATCH_SIZE} emails per batch`);
      let res: Response;
      try {
        res = await fetchImpl("https://api.resend.com/emails/batch", {
          method: "POST",
          headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(
            emails.map((e) => ({
              from: e.from,
              to: [e.to],
              ...(e.replyTo ? { reply_to: e.replyTo } : {}),
              subject: e.subject,
              html: e.html,
              text: e.text,
              headers: {
                "List-Unsubscribe": `<${e.unsubscribeUrl}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              },
            })),
          ),
        });
      } catch (err) {
        const error = `Couldn't reach Resend: ${err instanceof Error ? err.message : "network error"}`;
        return emails.map((e) => ({ ref: e.ref, ok: false as const, error }));
      }
      if (!res.ok) {
        const error = `Resend returned ${res.status}`;
        return emails.map((e) => ({ ref: e.ref, ok: false as const, error }));
      }
      const body = (await res.json().catch(() => null)) as { data?: { id?: string }[] } | null;
      return emails.map((e, i) => ({
        ref: e.ref,
        ok: true as const,
        providerId: body?.data?.[i]?.id ?? null,
      }));
    },
  };
}

/** "Housing4All <news@send.thehousing4all.com>" — quotes the name if it has punctuation. */
export function formatFrom(name: string, email: string): string {
  const clean = name.replace(/[\r\n"]/g, "").trim();
  return /[^\w\s.-]/.test(clean) ? `"${clean}" <${email}>` : `${clean} <${email}>`;
}
