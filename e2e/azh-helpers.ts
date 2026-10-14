import { Client } from "pg";

import { LOCAL_DB_URL } from "./fixtures/constants";

/** Direct SQL against the LOCAL stack only (AZH e2e setup/verification). */
export async function sql<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const url = process.env.SUPABASE_DB_URL ?? LOCAL_DB_URL;
  if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname))
    throw new Error("AZH e2e helpers only run against the local database");
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    return (await c.query(text, params)).rows as T[];
  } finally {
    await c.end();
  }
}

export const E2E_AZH_SLUG = "e2e-builders";

/** Reset AZH data in the e2e construction workspace (deals cascade to projects/estimates/…). */
export async function resetAzhWorkspace(slug = E2E_AZH_SLUG) {
  const ws = `(select id from public.workspaces where slug = $1)`;
  await sql(`delete from public.azh_requests where workspace_id = ${ws}`, [slug]);
  await sql(`delete from public.azh_intake where workspace_id = ${ws}`, [slug]);
  await sql(`delete from public.deals where workspace_id = ${ws}`, [slug]);
  await sql(`delete from public.tasks where workspace_id = ${ws}`, [slug]);
  await sql(`delete from public.contacts where workspace_id = ${ws}`, [slug]);
  await sql(`delete from public.azh_zip_routes where workspace_id = ${ws}`, [slug]);
  await sql(`select app_private.azh_init_workspace(${ws})`, [slug]);
  await sql(
    `update public.azh_settings set cslb_license = null, intake_enabled = true,
       service_types = app_private.azh_default_service_types(),
       san_diego_assignee = null, fallbrook_assignee = null
     where workspace_id = ${ws}`,
    [slug],
  );
}

/** A 1×1 PNG for photo uploads. */
export const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
  "base64",
);
