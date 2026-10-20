import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { assertSafeTarget, db } from "./env";

/** Runs supabase/tests/azh_rls.sql (AZH Track) against the local stack and requires 0 failures. */
describe("AZH SQL RLS suite", () => {
  it("passes every assertion", async () => {
    assertSafeTarget();
    const sql = readFileSync(path.join(process.cwd(), "supabase/tests/azh_rls.sql"), "utf8");
    const c = await db();
    try {
      const results = await c.query(sql);
      const last = (Array.isArray(results) ? results[results.length - 1] : results).rows[0];
      expect(last.failures).toBe("");
      expect(Number(last.failed)).toBe(0);
      expect(Number(last.passed)).toBeGreaterThanOrEqual(90);
      expect(Number(last.leftover_workspaces)).toBe(0);
      expect(Number(last.leftover_users)).toBe(0);
    } finally {
      await c.end();
    }
  });
});
