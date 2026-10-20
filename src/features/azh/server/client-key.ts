import "server-only";

import { createHash } from "node:crypto";

import { headers } from "next/headers";

/** Salted, daily-rotating hash of the submitter IP — used only for rate limiting, never stored raw. */
export async function clientKey(slug: string): Promise<string | null> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || null;
  if (!ip) return null;
  const day = new Date().toISOString().slice(0, 10);
  return createHash("sha256").update(`azh-intake:${slug}:${day}:${ip}`).digest("hex");
}
