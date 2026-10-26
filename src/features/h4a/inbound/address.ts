/**
 * Forwarding addresses: deals.<token>@<INBOUND_EMAIL_DOMAIN>. The token is 20
 * random base32 characters (100 bits). The database stores only its SHA-256,
 * so the full address is shown once, when an admin creates it. See ADR-022.
 */
import { createHash, randomBytes } from "node:crypto";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz234567"; // RFC 4648 base32, lowercase
export const TOKEN_LENGTH = 20;
export const ADDRESS_PREFIX = "deals";

export function generateToken(bytes: Buffer = randomBytes(TOKEN_LENGTH)): string {
  let out = "";
  for (let i = 0; i < TOKEN_LENGTH; i++) out += ALPHABET[bytes[i] % 32];
  return out;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token.trim().toLowerCase()).digest("hex");
}

export function tokenHint(token: string): string {
  return token.slice(-4);
}

export function formatAddress(token: string, domain: string): string {
  return `${ADDRESS_PREFIX}.${token}@${domain}`;
}

/** The token in "deals.<token>@domain" (or "Name <deals.<token>@domain>"), if the domain matches. */
export function tokenFromAddress(address: string, domain: string | null): string | null {
  const m = address
    .trim()
    .toLowerCase()
    .match(/<?([a-z0-9._+-]+)@([a-z0-9.-]+)>?\s*$/);
  if (!m) return null;
  if (domain && m[2] !== domain.toLowerCase()) return null;
  const local = m[1].match(new RegExp(`^${ADDRESS_PREFIX}[.+_-]([a-z2-7]{${TOKEN_LENGTH}})$`));
  return local ? local[1] : null;
}

/** First recipient that is one of our forwarding addresses. */
export function findToken(recipients: string[], domain: string | null): string | null {
  for (const r of recipients) {
    const t = tokenFromAddress(r, domain);
    if (t) return t;
  }
  return null;
}
