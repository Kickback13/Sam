/**
 * Owner alert email — built, but OFF in Phase 2A ("Not connected") until Resend
 * is set up on Sam's account. Enabled only when all three are set:
 *   H4A_ALERT_EMAILS=on · RESEND_API_KEY · ALERT_EMAIL_FROM
 * It only ever emails the workspace owner (workspaces.owner_email). No SMS.
 */
import { formatCurrency } from "@/lib/format";

import type { CreatedAlert } from "../pipeline/types";

export type AlertEmailConfig = {
  enabled: boolean;
  apiKey: string | null;
  from: string | null;
  /** Why it's off, for the UI. */
  reason: string | null;
};

export function alertEmailConfig(
  env: Record<string, string | undefined> = process.env,
): AlertEmailConfig {
  const apiKey = env.RESEND_API_KEY?.trim() || null;
  const from = env.ALERT_EMAIL_FROM?.trim() || null;
  const flag = env.H4A_ALERT_EMAILS?.trim().toLowerCase() === "on";
  const reason = !flag
    ? "Alert emails are switched off (H4A_ALERT_EMAILS is not on)."
    : !apiKey
      ? "Resend isn't connected (RESEND_API_KEY is not set)."
      : !from
        ? "No sender address (ALERT_EMAIL_FROM is not set)."
        : null;
  return { enabled: reason === null, apiKey, from, reason };
}

export type AlertMessage = { subject: string; text: string; html: string };

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** workspaceUrl: e.g. https://housing4all-platform.vercel.app/w/housing4all (null → no link). */
export function composeAlertEmail(alert: CreatedAlert, workspaceUrl: string | null): AlertMessage {
  const place = [alert.address, alert.city, alert.zip].filter(Boolean).join(", ");
  const facts = [
    alert.price !== null ? formatCurrency(alert.price) : null,
    alert.units ? `${alert.units} units` : null,
    `score ${alert.score}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const subject = `New match: ${alert.address} — score ${alert.score}`;
  const link = workspaceUrl
    ? `${workspaceUrl.replace(/\/$/, "")}/deal-finder/${alert.listing_id}`
    : null;
  const text = [
    `A new listing scored ${alert.score} (your alert threshold is ${alert.threshold}).`,
    "",
    place,
    facts,
    `Source: ${alert.source_label}`,
    "",
    link ? `Open it in Deal Finder: ${link}` : "Open Deal Finder to review it.",
    "",
    "You get this because email alerts are on for your workspace. Only the workspace owner receives them.",
  ].join("\n");
  const html = `<p>A new listing scored <strong>${alert.score}</strong> (your alert threshold is ${alert.threshold}).</p>
<p><strong>${esc(place)}</strong><br>${esc(facts)}<br>Source: ${esc(alert.source_label)}</p>
${link ? `<p><a href="${esc(link)}">Open it in Deal Finder</a></p>` : ""}
<p style="color:#555">You get this because email alerts are on for your workspace. Only the workspace owner receives them.</p>`;
  return { subject, text, html };
}

export async function sendAlertEmail(
  cfg: AlertEmailConfig,
  to: string,
  msg: AlertMessage,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (!cfg.enabled || !cfg.apiKey || !cfg.from)
    throw new Error(cfg.reason ?? "Alert emails are off.");
  const res = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: cfg.from,
      to: [to],
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    }),
  });
  if (!res.ok) throw new Error(`Resend returned ${res.status}`);
}
