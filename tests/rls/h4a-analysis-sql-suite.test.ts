import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { assertSafeTarget, db } from "./env";

/** Runs supabase/tests/h4a_analysis_rls.sql (property analysis, Phase 3A) against the local stack and requires 0 failures. */
describe("H4A property analysis SQL RLS suite", () => {
  it("passes every assertion and leaves nothing behind", async () => {
    assertSafeTarget();
    const sql = readFileSync(path.join(process.cwd(), "supabase/tests/h4a_analysis_rls.sql"), "utf8");
    const c = await db();
    try {
      const results = await c.query(sql);
      const last = (Array.isArray(results) ? results[results.length - 1] : results).rows[0];
      expect(last.failures).toBe("");
      expect(Number(last.failed)).toBe(0);
      expect(Number(last.passed)).toBeGreaterThanOrEqual(25);
      expect(Number(last.leftover_workspaces)).toBe(0);
      expect(Number(last.leftover_users)).toBe(0);
    } finally {
      await c.end();
    }
  });
});
