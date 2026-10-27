import { expect, test, type Page } from "@playwright/test";

import { E2E_REALTY, resetDealFinder, seedListing, sql } from "./h4a-helpers";
import { expectToast, goto, signIn } from "./helpers";

const BASE = `/w/${E2E_REALTY}`;

test.describe.configure({ mode: "serial" });

/** A property with 8 units (entered by hand) and a promoted listing asking $2,000,000. */
async function seedProperty(): Promise<string> {
  await resetDealFinder();
  const listingId = await seedListing("500 Analysis Test St", "92104");
  const [p] = await sql<{ id: string }>(
    `insert into public.properties (workspace_id, address, city, zip, units, field_sources)
     values ((select id from public.workspaces where slug = $1), '500 Analysis Test St', 'San Diego', '92104', 8,
       jsonb_build_object('units', jsonb_build_object('source', 'manual', 'label', 'Entered by E2E Seed',
         'fetched_at', now()::text)))
     returning id`,
    [E2E_REALTY],
  );
  await sql(
    `update public.h4a_listings set property_id = $1, status = 'promoted', promoted_at = now() where id = $2`,
    [p.id, listingId],
  );
  return p.id;
}

const value = (page: Page, key: string) => page.getByTestId(`uw-value-${key}`);

async function fill(page: Page, values: Record<string, string>) {
  for (const [k, v] of Object.entries(values)) await page.getByTestId(`uw-${k}`).fill(v);
}

test("Phase 3A: analyze → sources → live numbers → red flags → save → PDF → comps", async ({
  page,
}) => {
  const propertyId = await seedProperty();
  await signIn(page);

  // Entry point from the property page ---------------------------------------------
  await goto(page, `${BASE}/properties/${propertyId}`);
  await page.getByTestId("analyze-property").click();
  await page.waitForURL(/\/analysis$/);
  await expect(page.getByRole("heading", { level: 1, name: "Deal analysis" })).toBeVisible();

  // Prefill: only facts we have, each with its source ------------------------------
  await expect(page.getByTestId("uw-price")).toHaveValue("2000000");
  await expect(page.locator('[title^="CSV: e2e.csv · "]').first()).toBeVisible();
  await expect(page.getByTestId("uw-units")).toHaveValue("8");
  await expect(page.locator('[title^="Entered by E2E Seed · "]').first()).toBeVisible();
  await expect(page.getByTestId("uw-vacancyPct")).toHaveValue("");
  await expect(value(page, "pricePerUnit")).toHaveText("$250,000");
  await expect(value(page, "noi")).toHaveText("Needs input");

  // Enter the worked example (same as the unit test) --------------------------------
  for (const [label, count, rent] of [
    ["2BR", "4", "2000"],
    ["3BR", "4", "2500"],
  ]) {
    await page.getByTestId("uw-add-unit-type").click();
    const row = page.getByTestId("uw-unit-mix").locator("> div.grid").last();
    await row.locator("input").nth(0).fill(label);
    await row.locator("input").nth(1).fill(count);
    await row.locator("input").nth(2).fill(rent);
  }
  await fill(page, {
    otherIncomeMonthly: "300",
    vacancyPct: "5",
    taxRatePct: "1.2",
    insurance: "8000",
    utilities: "12000",
    repairs: "9000",
    managementPct: "4",
    otherExpenses: "2000",
    ltvPct: "65",
    interestRatePct: "6",
    amortYears: "30",
    closingCosts: "40000",
  });
  await expect(value(page, "noi")).toHaveText("$145,448");
  await expect(value(page, "capRate")).toHaveText("7.27%");
  await expect(value(page, "dscr")).toHaveText("1.56×");
  await expect(value(page, "cashOnCash")).toHaveText("7.02%");
  // Healthy numbers: the only note is that the listing hasn't been verified yet.
  await expect(page.locator('[data-testid^="uw-flag-"]')).toHaveCount(1);
  await expect(page.getByTestId("uw-flag-unverified")).toBeVisible();

  // Every number explains itself
  await page.getByTestId("uw-metric-capRate").locator("summary").click();
  await expect(page.getByTestId("uw-metric-capRate")).toContainText("NOI ÷ price");
  await expect(page.getByTestId("uw-metric-capRate")).toContainText("Vacancy %");

  // Red flag: Prop 13 tax reset -----------------------------------------------------
  await fill(page, { taxRatePct: "0.5" });
  await expect(page.getByTestId("uw-flag-tax_below_prop13")).toBeVisible();
  await fill(page, { taxRatePct: "1.2" });
  await expect(page.getByTestId("uw-flag-tax_below_prop13")).toHaveCount(0);

  // Save → persisted with sources --------------------------------------------------
  await page.getByTestId("uw-name").fill("Asking price");
  await page.getByTestId("uw-save").click();
  await expectToast(page, "Scenario saved");
  await page.waitForURL(/\?scenario=[0-9a-f-]{36}/);
  await page.reload();
  await expect(page.getByTestId("uw-vacancyPct")).toHaveValue("5");
  await expect(value(page, "noi")).toHaveText("$145,448");
  await expect(page.locator('[title^="CSV: e2e.csv · "]').first()).toBeVisible(); // unchanged price keeps its source
  const [saved] = await sql<{ vac: string; price: string }>(
    `select input_sources -> 'vacancyPct' ->> 'label' as vac, input_sources -> 'price' ->> 'label' as price
     from public.h4a_underwriting where property_id = $1`,
    [propertyId],
  );
  expect(saved.vac).toMatch(/^Entered by /);
  expect(saved.price).toBe("CSV: e2e.csv");

  // PDF: same numbers, downloadable ------------------------------------------------
  const pdfLink = page.getByTestId("uw-pdf");
  await expect(pdfLink).toBeVisible();
  const res = await page.request.get(
    new URL((await pdfLink.getAttribute("href"))!, page.url()).toString(),
  );
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/pdf");
  expect(res.headers()["content-disposition"]).toContain(
    "analysis-500-Analysis-Test-St-Asking-price.pdf",
  );
  expect((await res.body()).subarray(0, 5).toString()).toBe("%PDF-");

  // Comps: a sale comp needs a source and date; the median feeds the flags ----------
  await page.getByTestId("comp-add").click();
  await page.getByTestId("comp-address").fill("600 Comp Test St");
  await page.getByTestId("comp-price").fill("1600000");
  await page.getByTestId("comp-units").fill("8");
  await page.getByTestId("comp-save").click();
  await expect(page.getByTestId("comp-form")).toContainText("Say where this comp came from");
  await page.getByTestId("comp-source_label").fill("Broker OM (test)");
  await page.getByTestId("comp-as_of").fill("2026-10-01");
  await page.getByTestId("comp-save").click();
  await expectToast(page, "Comp added");
  await expect(page.getByTestId("comps-median-ppu")).toHaveText("$200,000");
  await expect(page.getByTestId("comps-panel")).toContainText("Broker OM (test)");
  await expect(page.getByTestId("uw-flag-above_comps")).toBeVisible(); // $250k/unit is 25% above $200k

  // Honest "Not connected" states --------------------------------------------------
  await expect(page.getByTestId("ai-summary-card")).toContainText("Not connected");
  await expect(page.getByTestId("property-data-card")).toContainText("Not connected");
});

test("analysis is real-estate only (404 in a construction workspace)", async ({ page }) => {
  await signIn(page);
  const res = await page.goto(
    `/w/e2e-builders/properties/00000000-0000-4000-8000-000000000000/analysis`,
  );
  expect(res?.status()).toBe(404);
});
