import { expect, test } from "@playwright/test";

import { E2E_REALTY, sql } from "./h4a-helpers";
import { goto, signIn } from "./helpers";

test("Deal analysis works at 390px: inputs, results, flags, comps — no sideways scroll", async ({
  page,
}) => {
  const [p] = await sql<{ id: string }>(
    `insert into public.properties (workspace_id, address, zip, units)
     values ((select id from public.workspaces where slug = $1), '390 Mobile Analysis St', '92104', 6)
     returning id`,
    [E2E_REALTY],
  );
  // A nearby sale on file, so a suggested comp shows (long addresses must wrap, not scroll).
  await sql(
    `insert into public.properties (workspace_id, address, city, zip, units, last_sale_price, last_sale_date, field_sources)
     values ((select id from public.workspaces where slug = $1),
       '391 Mobile Analysis Street With A Rather Long Name Unit Block B', 'San Diego', '92104', 6,
       1680000, current_date - 90,
       jsonb_build_object('last_sale_price', jsonb_build_object('source', 'county',
         'label', 'County record (e2e mobile)', 'fetched_at', now()::text)))`,
    [E2E_REALTY],
  );
  await signIn(page);
  await goto(page, `/w/${E2E_REALTY}/properties/${p.id}/analysis`);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, "horizontal overflow on the analysis page").toBeLessThanOrEqual(1);
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();

  await page.getByTestId("uw-price").fill("1500000");
  await expect(page.getByTestId("uw-value-pricePerUnit")).toHaveText("$250,000");
  await page.getByTestId("uw-add-unit-type").click();
  await expect(page.getByTestId("uw-unit-mix").locator("input").first()).toBeVisible();
  const overflowAfter = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflowAfter, "horizontal overflow with a unit-mix row").toBeLessThanOrEqual(1);
  await expect(page.getByTestId("uw-flags")).toBeVisible();
  await expect(page.getByTestId("comps-panel")).toBeVisible();
  await expect(page.getByTestId("suggested-comp").first()).toBeVisible();
  const overflowComps = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflowComps, "horizontal overflow with suggested comps").toBeLessThanOrEqual(1);

  await goto(page, `/w/${E2E_REALTY}/analyze`);
  const listOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(listOverflow, "horizontal overflow on Analyze").toBeLessThanOrEqual(1);
});
