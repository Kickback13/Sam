import { expect, test } from "@playwright/test";

import { E2E_REALTY, resetDealFinder, sql } from "./h4a-helpers";
import { expectToast, goto, signIn } from "./helpers";

const WS = `(select id from public.workspaces where slug = $1)`;

test.describe.configure({ mode: "serial" });

async function listing(over: {
  address: string;
  broker_name?: string;
  broker_company?: string;
  broker_email?: string;
  broker_phone?: string;
  units: number;
  price: number;
  score: number;
  zip: string;
  received_at: string;
  deal_id?: string | null;
}) {
  await sql(
    `insert into public.h4a_listings (workspace_id, origin, source_label, address, street_key, city, zip,
       units, price, score, received_at, broker_name, broker_company, broker_email, broker_phone, deal_id)
     values (${WS}, 'csv', 'CSV: e2e.csv', $2, lower($2), 'San Diego', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      E2E_REALTY,
      over.address,
      over.zip,
      over.units,
      over.price,
      over.score,
      over.received_at,
      over.broker_name ?? null,
      over.broker_company ?? null,
      over.broker_email ?? null,
      over.broker_phone ?? null,
      over.deal_id ?? null,
    ],
  );
}

test.beforeAll(async () => {
  await resetDealFinder();
  await sql(
    `delete from public.contacts where workspace_id = ${WS}
       and (email_keys && array['ana.broker@example.test'] or 'prospects-e2e' = any(tags))`,
    [E2E_REALTY],
  );

  // A closed deal that came from Ben's listing.
  const [{ id: dealId }] = await sql<{ id: string }>(
    `insert into public.deals (workspace_id, pipeline_id, stage_id, title, status)
     select w.id, p.id, s.id, 'Closed fourplex', 'won'
     from public.workspaces w join public.pipelines p on p.workspace_id = w.id and p.is_default
     join public.pipeline_stages s on s.pipeline_id = p.id and s.is_won
     where w.slug = $1 limit 1 returning id`,
    [E2E_REALTY],
  );
  await listing({
    address: "100 Example Ave",
    broker_name: "Ana Broker",
    broker_company: "Example Realty",
    broker_email: "ana.broker@example.test",
    units: 24,
    price: 6_000_000,
    score: 85,
    zip: "92104",
    received_at: "2026-10-20T00:00:00Z",
  });
  await listing({
    address: "200 Example Ave",
    broker_name: "Ana Broker",
    broker_email: "ANA.BROKER@example.test",
    broker_phone: "(619) 555-0190",
    units: 30,
    price: 7_500_000,
    score: 40,
    zip: "92104",
    received_at: "2026-10-28T00:00:00Z",
  });
  await listing({
    address: "300 Sample St",
    broker_name: "Ben Seller",
    broker_company: "Sample CRE",
    units: 4,
    price: 1_200_000,
    score: 75,
    zip: "92116",
    received_at: "2026-09-01T00:00:00Z",
    deal_id: dealId,
  });

  // Long-hold owners: one held since 2001 (owner on the do-not-call list), one recent, one unknown.
  const [{ id: ownerId }] = await sql<{ id: string }>(
    `insert into public.contacts (workspace_id, first_name, last_name, dnc, tags, phones)
     values (${WS}, 'Olive', 'Longtime', true, '{prospects-e2e}', '[{"value":"(619) 555-0191","type":"mobile","is_primary":true}]')
     returning id`,
    [E2E_REALTY],
  );
  await sql(
    `insert into public.properties (workspace_id, address, city, zip, units, last_sale_date, last_sale_price,
       owner_contact_id, field_sources)
     values
       (${WS}, '400 Heritage Rd', 'San Diego', '92104', 24, '2001-05-01', 1800000, $2,
        '{"last_sale_date":{"source":"San Diego County Assessor","fetched_at":"2026-10-30T00:00:00Z"}}'),
       (${WS}, '500 Recent Way', 'San Diego', '92104', 12, '2021-03-15', 3000000, null, '{}'),
       (${WS}, '600 Unknown Ct', 'San Diego', '92116', 8, null, null, null, '{}')`,
    [E2E_REALTY, ownerId],
  );
});

test("Phase 4B brokers: ranked from listings, sortable, add to People", async ({ page }) => {
  await signIn(page);
  await goto(page, `/w/${E2E_REALTY}/prospects`);
  await expect(page.getByRole("heading", { level: 1, name: "Prospects" })).toBeVisible();
  await expect(page.getByTestId("broker-summary")).toContainText("2 brokers from 3 listings");

  const rows = page.getByTestId("broker-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("Ana Broker");
  await expect(rows.first()).toContainText("Example Realty");
  await expect(rows.first()).toContainText("$13,500,000");
  await expect(rows.first()).toContainText("mostly 92104");

  await page.getByRole("link", { name: "Most closed deals" }).click();
  await page.waitForURL(/sort=closed$/);
  await expect(rows.first()).toContainText("Ben Seller");

  // Add Ana to People: becomes a Broker contact, then the row links to her.
  await page.getByRole("link", { name: "Most listings" }).click();
  await page.waitForURL(/\/prospects$/);
  await expect(rows.first()).toContainText("Ana Broker");
  await expect(page.getByRole("link", { name: "Most listings" })).toHaveAttribute(
    "aria-current",
    "true",
  );
  await rows.first().getByTestId("add-broker").click();
  await expectToast(page, "Ana Broker added to People");
  await expect(rows.first().getByTestId("broker-contact")).toBeVisible();
  const [ana] = await sql<{ roles: string[]; tags: string[]; phone_keys: string[] }>(
    `select roles, tags, phone_keys from public.contacts
     where workspace_id = ${WS} and email_keys && array['ana.broker@example.test'] and deleted_at is null`,
    [E2E_REALTY],
  );
  expect(ana.roles).toContain("broker");
  expect(ana.tags).toContain("broker");
  expect(ana.phone_keys).toContain("+16195550190");
});

test("Phase 4B long-hold owners: years held with the sale-date source, filters, 390px", async ({
  page,
}) => {
  await signIn(page);
  await goto(page, `/w/${E2E_REALTY}/prospects?tab=owners`);
  const rows = page.getByTestId("owner-row");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("400 Heritage Rd");
  await expect(rows.first()).toContainText(/Held 2\d years/);
  await expect(rows.first()).toContainText("source: San Diego County Assessor");
  await expect(rows.first()).toContainText("Olive Longtime");
  await expect(rows.first()).toContainText("Do not call");
  await expect(page.getByTestId("owners-missing")).toContainText(
    "1 property has no last sale date",
  );

  // Stricter filter → empty; a lower bar brings in the recent one too.
  await page.getByLabel("Held at least (years)").fill("40");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("No properties held 40+ years")).toBeVisible();
  await goto(page, `/w/${E2E_REALTY}/prospects?tab=owners&years=3&units=10`);
  await expect(rows).toHaveCount(2);

  await page.setViewportSize({ width: 390, height: 844 });
  await goto(page, `/w/${E2E_REALTY}/prospects?tab=owners`);
  await expect(rows.first()).toBeVisible();
  for (const path of ["prospects?tab=owners", "prospects"]) {
    await goto(page, `/w/${E2E_REALTY}/${path}`);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

test("Prospects is real-estate only", async ({ page }) => {
  await signIn(page);
  const res = await page.goto(`/w/e2e-builders/prospects`);
  expect(res?.status()).toBe(404);
});
