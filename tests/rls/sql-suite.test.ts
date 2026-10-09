import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { assertSafeTarget, db } from "./env";

/** Runs supabase/tests/rls_isolation.sql (the same suite run on the hosted project) and requires 0 failures. */
describe("SQL RLS suite", () => {
  it("passes every assertion", async () => {
    assertSafeTarget();
    const sql = readFileSync(path.join(process.cwd(), "supabase/tests/rls_isolation.sql"), "utf8");
    const c = await db();
    try {
      const results = await c.query(sql);
      const last = (Array.isArray(results) ? results[results.length - 1] : results).rows[0];
      expect(last.failures).toBe("");
      expect(Number(last.failed)).toBe(0);
      expect(Number(last.passed)).toBeGreaterThanOrEqual(42);
      expect(Number(last.leftover_workspaces)).toBe(0);
    } finally {
      await c.end();
    }
  });
});
