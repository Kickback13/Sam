import { Client } from "pg";

import { LOCAL_DB_URL } from "./fixtures/constants";

/** Direct SQL against the LOCAL stack only (Deal Finder e2e setup). */
export async function sql<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const url = process.env.SUPABASE_DB_URL ?? LOCAL_DB_URL;
  if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname))
    throw new Error("Deal Finder e2e helpers only run against the local database");
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    return (await c.query(text, params)).rows as T[];
  } finally {
    await c.end();
  }
}

export const E2E_REALTY = "e2e-realty";

/** Empty Deal Finder in the e2e real-estate workspace (deals/properties are reset by global setup). */
export async function resetDealFinder(slug = E2E_REALTY) {
  const ws = `(select id from public.workspaces where slug = $1)`;
  for (const t of [
    "h4a_alerts",
    "h4a_listings",
    "h4a_inbound_emails",
    "h4a_imports",
    "h4a_buy_boxes",
    "h4a_inbound_addresses",
  ])
    await sql(`delete from public.${t} where workspace_id = ${ws}`, [slug]);
  await sql(`delete from public.deals where workspace_id = ${ws}`, [slug]);
  await sql(`delete from public.properties where workspace_id = ${ws}`, [slug]);
}

/** Insert a listing through the real ingest function (as the DB owner). */
export async function seedListing(address: string, zip: string, slug = E2E_REALTY) {
  const [row] = await sql<{ id: string }>(
    `select (app_private.h4a_ingest_one(
       (select id from public.workspaces where slug = $1), null,
       jsonb_build_object(
         'origin', 'csv', 'source', jsonb_build_object('label', 'CSV: e2e.csv'),
         'fields', jsonb_build_object('address', $2::text, 'city', 'San Diego', 'zip', $3::text,
           'price', 2000000, 'units', 10, 'year_built', 1970),
         'keys', jsonb_build_object('street_key', lower($2::text),
           'match_keys', jsonb_build_array('addr:' || lower($2::text) || '|' || $3::text))
       ), null) ->> 'listing_id') as id`,
    [slug, address, zip],
  );
  return row.id;
}
