import { expect, test } from "@playwright/test";

import { E2E_REALTY, sql } from "./h4a-helpers";
import { expectToast, goto, signIn } from "./helpers";
import { RENTCAST_KEY, startRentCastMock, type RentCastMock } from "./rentcast-mock";

const WS = `(select id from public.workspaces where slug = $1)`;

test.describe.configure({ mode: "serial" });

let mock: RentCastMock;
let propertyId = "";

test.beforeAll(async () => {
  mock = await startRentCastMock();
  await sql(`delete from public.property_data_pulls where workspace_id = ${WS}`, [E2E_REALTY]);
  await sql(
    `delete from public.integrations where workspace_id = ${WS} and provider = 'data_api'`,
    [E2E_REALTY],
  );
  await sql(`delete from vault.secrets where name = 'data_api_key:' || ${WS}::text`, [E2E_REALTY]);
  await sql(
    `delete from public.properties where workspace_id = ${WS} and address = '100 Rentcast Way'`,
    [E2E_REALTY],
  );
  // year_built is already known (entered by hand): RentCast must not overwrite it.
  [{ id: propertyId }] = await sql<{ id: string }>(
    `insert into public.properties (workspace_id, address, city, zip, units, year_built)
     values (${WS}, '100 Rentcast Way', 'San Diego', '92104', 24, 1970) returning id`,
    [E2E_REALTY],
  );
});

test.afterAll(async () => {
  await new Promise((r) => mock.server.close(r));
});

test("Phase 3B: connect RentCast (Vault), fetch record + value with sources, monthly limit stops spending", async ({
  page,
}) => {
  await signIn(page);

  // Not connected yet: the analysis card says so and offers no buttons.
  await goto(page, `/w/${E2E_REALTY}/properties/${propertyId}/analysis`);
  const card = page.getByTestId("property-data-card");
  await expect(card).toContainText("Not connected");
  await expect(card.getByTestId("fetch-record")).toHaveCount(0);

  // Connect with a limit of 2 requests. Saving makes no request.
  await goto(page, `/w/${E2E_REALTY}/settings/integrations`);
  await page.getByTestId("data-api-setup-link").click();
  await page.waitForURL(/\/integrations\/property-data$/);
  await page.getByLabel("RentCast API key").fill(RENTCAST_KEY);
  await page.getByLabel("Monthly request limit").fill("2");
  await page.getByTestId("data-api-save").click();
  await expectToast(page, "RentCast connected");
  await expect(page.getByTestId("data-api-status")).toHaveText("Connected");
  await expect(page.getByTestId("data-api-usage")).toContainText("0 of 2");
  expect(mock.requests).toHaveLength(0);
  const [{ n: inColumns }] = await sql<{ n: string }>(
    `select count(*) as n from public.integrations where workspace_id = ${WS} and config::text like '%' || $2 || '%'`,
    [E2E_REALTY, RENTCAST_KEY],
  );
  expect(Number(inColumns)).toBe(0);

  // Fetch the property record: blanks are filled and stamped "RentCast", year built is kept.
  await goto(page, `/w/${E2E_REALTY}/properties/${propertyId}/analysis`);
  await expect(card.getByTestId("data-usage")).toContainText("0 of 2 requests");
  await card.getByTestId("fetch-record").click();
  await expectToast(page, /Property record fetched · filled \d+ blank fields/);
  const record = card.getByTestId("data-record");
  await expect(record).toContainText("Example Family Trust");
  await expect(record).toContainText("PO Box 100, La Jolla, CA 92037");
  await expect(record).toContainText("$29,600");
  await expect(record).toContainText("Source: RentCast");
  const [prop] = await sql<{
    last_sale_date: string;
    year_built: number;
    label: string;
    apn: string;
  }>(
    `select last_sale_date::text, year_built, apn, field_sources -> 'last_sale_date' ->> 'label' as label
     from public.properties where id = $1`,
    [propertyId],
  );
  expect(prop).toMatchObject({
    last_sale_date: "2004-06-15",
    year_built: 1970,
    apn: "453-000-11-00",
    label: "RentCast property record",
  });

  // Value estimate: the second and last allowed request this month.
  await card.getByTestId("fetch-value").click();
  await expectToast(page, "Value estimate fetched");
  await expect(card.getByTestId("data-value")).toContainText("$6,100,000");
  await expect(card.getByTestId("data-value")).toContainText("200 Sample St");
  await expect(card.getByTestId("data-usage")).toContainText("2 of 2 requests");
  await expect(card.getByTestId("fetch-rent")).toBeDisabled();
  await expect(card).toContainText("This month's limit is used up");

  // Exactly two requests reached "RentCast", both with the stored key.
  expect(mock.requests.map((r) => r.path)).toEqual(["/v1/properties", "/v1/avm/value"]);
  expect(mock.requests.every((r) => r.key === RENTCAST_KEY)).toBe(true);

  // An admin raises the limit without re-entering the key; one more request is allowed.
  await goto(page, `/w/${E2E_REALTY}/settings/integrations/property-data`);
  await page.getByLabel("Monthly request limit").fill("3");
  await page.getByTestId("data-api-save").click();
  await expectToast(page, "Monthly limit saved");
  await goto(page, `/w/${E2E_REALTY}/properties/${propertyId}/analysis`);
  await card.getByTestId("fetch-rent").click();
  await expectToast(page, "Rent estimate fetched");
  await expect(card.getByTestId("data-rent")).toContainText("$2,150");

  // Works at phone width.
  await page.setViewportSize({ width: 390, height: 844 });
  await goto(page, `/w/${E2E_REALTY}/properties/${propertyId}/analysis`);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  // Disconnect deletes the key.
  await goto(page, `/w/${E2E_REALTY}/settings/integrations/property-data`);
  await page.getByTestId("data-api-disconnect").click();
  await expectToast(page, "RentCast disconnected");
  const [{ n: keys }] = await sql<{ n: string }>(
    `select count(*) as n from vault.secrets where name = 'data_api_key:' || ${WS}::text`,
    [E2E_REALTY],
  );
  expect(Number(keys)).toBe(0);
});
