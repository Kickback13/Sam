import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { assertSafeTarget, db } from "./env";

/**
 * Phase 9A security invariants, checked against the local stack with every migration applied.
 * A new table, function or bucket that breaks one of these rules fails CI (docs/SECURITY.md).
 */

// Tenancy roots: every other public table hangs off one of these via workspace_id.
const NO_WORKSPACE_ID = ["profiles", "workspaces"];

// SECURITY DEFINER functions that the anonymous role may call on purpose. Each one is guarded
// inside (a per-workspace token, an invite/unsubscribe token, a public slug, or auth.uid()).
const ANON_DEFINER_ALLOWED = [
  "accept_network_invite", // refuses without a signed-in user
  "azh_issue_upload_tickets", // public AZH request form (slug + rate limits)
  "azh_public_form", // public AZH request form settings
  "booking_feed", // private calendar feed (random token)
  "booking_public_book", // public booking page (slug, page on, open slot, rate limits)
  "booking_public_page", // public booking page text (only while on)
  "booking_public_slots", // public booking page open times (only while on)
  "get_invite", // invite link page
  "get_network_invite", // network invite link page
  "ghl_connection", // owner/admin check inside
  "ghl_disconnect", // owner/admin check inside
  "ghl_record_error", // owner/admin check inside
  "ghl_save_connection", // owner/admin check inside
  "h4a_inbound_ingest", // inbound email webhook (workspace token)
  "h4a_inbound_receive",
  "h4a_inbound_save_scores",
  "h4a_inbound_set_alert_email_status",
  "h4a_inbound_update_email",
  "my_networks", // returns only the signed-in member's networks
  "network_brand", // public network branding (PWA manifest/icon)
  "network_business_type", // which business a community belongs to (labels only)
  "network_context", // returns nothing without a member session
  "outreach_unsubscribe", // unsubscribe link (random token)
  "outreach_unsubscribe_info",
  "receptionist_config", // Twilio/ElevenLabs webhooks (workspace token)
  "receptionist_create_token", // owner/admin check inside
  "receptionist_record_call",
];

async function rows<T>(sql: string): Promise<T[]> {
  const c = await db();
  try {
    return (await c.query(sql)).rows as T[];
  } finally {
    await c.end();
  }
}

describe("database security invariants", () => {
  it("every public table has row-level security and at least one policy", async () => {
    assertSafeTarget();
    const bad = await rows<{ relname: string; problem: string }>(`
      select c.relname, case when not c.relrowsecurity then 'RLS off' else 'no policies' end as problem
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')
        and (not c.relrowsecurity
             or not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname))`);
    expect(bad).toEqual([]);
  });

  it("every public table except the tenancy roots has workspace_id", async () => {
    const missing = await rows<{ relname: string }>(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and not exists (select 1 from information_schema.columns k
                        where k.table_schema = 'public' and k.table_name = c.relname and k.column_name = 'workspace_id')
      order by 1`);
    expect(missing.map((r) => r.relname)).toEqual(NO_WORKSPACE_ID);
  });

  it("the anonymous role has no direct table privileges", async () => {
    const grants = await rows<{ table_name: string }>(`
      select distinct table_name from information_schema.role_table_grants
      where grantee = 'anon' and table_schema = 'public'`);
    expect(grants).toEqual([]);
  });

  it("every SECURITY DEFINER function pins search_path", async () => {
    const bad = await rows<{ fn: string }>(`
      select n.nspname || '.' || p.proname as fn
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where p.prosecdef and n.nspname in ('public', 'app_private')
        and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')`);
    expect(bad).toEqual([]);
  });

  it("anon can call only the reviewed SECURITY DEFINER functions", async () => {
    const callable = await rows<{ proname: string }>(`
      select distinct p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')
      order by 1`);
    const unexpected = callable
      .map((r) => r.proname)
      .filter((f) => !ANON_DEFINER_ALLOWED.includes(f));
    expect(unexpected).toEqual([]);
  });

  it("app_private (trigger + RLS helper functions) is not exposed through the Data API", () => {
    // Policies call app_private helpers, so roles keep USAGE on the schema; what keeps those
    // functions off the internet is that the API serves only these schemas. Hosted: Settings → API.
    const toml = readFileSync(path.join(process.cwd(), "supabase/config.toml"), "utf8");
    const schemas = toml.match(/^schemas\s*=\s*\[([^\]]*)\]/m)?.[1] ?? "";
    expect(schemas).not.toContain("app_private");
    expect(schemas).toContain('"public"');
  });

  it("every storage bucket is private with a size limit and a file-type allow-list", async () => {
    const bad = await rows<{ id: string }>(`
      select id from storage.buckets
      where public or file_size_limit is null or allowed_mime_types is null`);
    expect(bad).toEqual([]);
  });
});
