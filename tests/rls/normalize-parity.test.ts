import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { normalizeEmail, normalizePhone } from "@/lib/normalize";

import { EMAIL_CASES, PHONE_CASES } from "../fixtures/normalize-cases";
import { db } from "./env";

/** The dedupe keys are computed in SQL (trigger) and in TS (import preview) — they must agree. */
let c: Client;
beforeAll(async () => {
  c = await db();
});
afterAll(async () => {
  await c.end();
});

describe("SQL ↔ TypeScript normalization parity", () => {
  it.each(EMAIL_CASES)("email %s", async (input) => {
    const { rows } = await c.query("select app_private.normalize_email($1) as v", [input]);
    expect(rows[0].v).toBe(normalizeEmail(input));
  });
  it.each(PHONE_CASES)("phone %s", async (input) => {
    const { rows } = await c.query("select app_private.normalize_phone($1) as v", [input]);
    expect(rows[0].v).toBe(normalizePhone(input));
  });
});
