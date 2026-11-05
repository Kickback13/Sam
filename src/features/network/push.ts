/**
 * Network / Community push notifications (ADR-041). Pure config + payload helpers.
 *
 *   NETWORK_PUSH_PUBLIC_KEY    VAPID public key (base64url, ~87 chars)
 *   NETWORK_PUSH_PRIVATE_KEY   VAPID private key (base64url, ~43 chars) — server only
 *   NETWORK_PUSH_SUBJECT       contact for push services, e.g. mailto:someone@business.com
 *
 * Generate the pair for free with `npx web-push generate-vapid-keys` and put it in Vercel
 * (never in git or chat). Missing or malformed ⇒ "Not connected": no button, nothing sent.
 */

export type PushConfig = {
  connected: boolean;
  publicKey: string | null;
  privateKey: string | null;
  subject: string | null;
};

const B64URL = /^[A-Za-z0-9_-]+$/;

export function pushConfig(env: Record<string, string | undefined> = process.env): PushConfig {
  const publicKey = env.NETWORK_PUSH_PUBLIC_KEY?.trim() || null;
  const privateKey = env.NETWORK_PUSH_PRIVATE_KEY?.trim() || null;
  const subject = env.NETWORK_PUSH_SUBJECT?.trim() || null;
  const ok =
    publicKey !== null &&
    B64URL.test(publicKey) &&
    publicKey.length >= 80 &&
    privateKey !== null &&
    B64URL.test(privateKey) &&
    privateKey.length >= 40 &&
    subject !== null &&
    /^(mailto:[^@\s]+@[^@\s]+|https:\/\/\S+)$/.test(subject);
  return {
    connected: ok,
    publicKey: ok ? publicKey : null,
    privateKey: ok ? privateKey : null,
    subject: ok ? subject : null,
  };
}

export type PushPayload = { title: string; body: string; url: string; tag: string };

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** What a member's phone shows for a new team post or event (no private data). */
export function pushPayload(
  kind: "post" | "event",
  community: string,
  title: string,
  url: string,
): PushPayload {
  return {
    title: clip(community, 60),
    body: clip(kind === "event" ? `New event: ${title}` : title, 140),
    url,
    tag: `${kind}:${url}`,
  };
}

/** The browser's PushSubscription JSON → what we store (validated). */
export function parseSubscription(
  raw: unknown,
): { endpoint: string; p256dh: string; auth: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const endpoint = typeof r.endpoint === "string" ? r.endpoint : "";
  const p256dh = typeof r.keys?.p256dh === "string" ? r.keys.p256dh : "";
  const auth = typeof r.keys?.auth === "string" ? r.keys.auth : "";
  if (!/^https:\/\/\S{6,1000}$/.test(endpoint)) return null;
  if (!B64URL.test(p256dh) || p256dh.length < 20 || p256dh.length > 200) return null;
  if (!B64URL.test(auth) || auth.length < 8 || auth.length > 100) return null;
  return { endpoint, p256dh, auth };
}
