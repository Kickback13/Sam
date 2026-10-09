import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { brandAccent, goto, signIn } from "./helpers";

const CSV = path.join(__dirname, "fixtures/ghl-contacts.csv");

test.describe.configure({ mode: "serial" });

test("Phase 1 smoke: contact → CSV import → property → deal → drag → activity → workspace isolation + re-skin", async ({
  page,
}) => {
  await signIn(page);
  await goto(page, "/w/e2e-realty/today");
  const realtyAccent = await brandAccent(page);
  expect(realtyAccent).toBe("#00D9E1");

  // 1) Create a contact ------------------------------------------------------------
  await goto(page, "/w/e2e-realty/people/new");
  await page.locator("#first_name").fill("Jules");
  await page.locator("#last_name").fill("Manual");
  await page.getByLabel("Email 1", { exact: true }).fill("jules.manual@example.com");
  await page.getByLabel("Phone 1", { exact: true }).fill("(619) 555-0170");
  await page.getByRole("button", { name: "Owner", exact: true }).click();
  await page.getByTestId("save-contact").click();
  await page.waitForURL(/\/people\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name: "Jules Manual" })).toBeVisible();
  await expect(page.getByTestId("compliance")).toContainText("No SMS consent");

  // 2) Import a 10-row GoHighLevel CSV (1 duplicate of Jules, 1 invalid email) --------
  await goto(page, "/w/e2e-realty/people/import");
  await page.getByTestId("csv-input").setInputFiles(CSV);
  await expect(page.getByText("GoHighLevel export detected")).toBeVisible();
  await page.getByTestId("to-preview").click();
  const summary = page.getByTestId("import-summary");
  await expect(summary).toContainText("New contacts8");
  await expect(summary).toContainText("Match existing1");
  await expect(summary).toContainText("Invalid rows1");
  await page.getByTestId("run-import").click();
  await expect(page.getByTestId("import-result")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("created-count")).toHaveText("8");
  await expect(page.getByTestId("error-count")).toHaveText("1");
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("download-errors").click();
  const download = await downloadPromise;
  const report = readFileSync((await download.path())!, "utf8");
  expect(report).toContain("not-an-email");
  expect(report.split("\r\n")[0]).toContain("row,error");

  await goto(page, "/w/e2e-realty/people?q=fixture");
  await expect(page.getByTestId("contacts-table").locator("tbody tr")).toHaveCount(8);

  // 3) Create a property (values get "Entered by" source chips) ----------------------
  await goto(page, "/w/e2e-realty/properties/new");
  await page.locator("#address").fill("100 Example Way");
  await page.locator("#units").fill("12");
  await page.locator("#year_built").fill("1971");
  await page.getByTestId("save-property").click();
  await page.waitForURL(/\/properties\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("property-facts").getByTestId("source-chip").first()).toContainText(
    "Entered by Erin Tester",
  );

  // 4) Create a deal on that property ---------------------------------------------
  await goto(page, "/w/e2e-realty/pipeline");
  await page.getByTestId("new-deal").click();
  await page.locator("#deal-title").fill("E2E 12-unit acquisition");
  await page.locator("#deal-value").fill("2,400,000");
  await page.locator("#deal-property").click();
  await page.getByPlaceholder("Search properties…").fill("example way");
  await page.getByRole("option", { name: /100 Example Way/ }).click();
  await page.getByTestId("create-deal").click();
  await expect(page.getByTestId("deal-drawer").getByTestId("stage-history")).toContainText(
    "New Deal",
  );
  await page.keyboard.press("Escape");

  // 5) Drag it to the next stage ----------------------------------------------------
  const card = page.locator(
    '[data-testid=deal-card][data-deal-title="E2E 12-unit acquisition"] button',
  );
  const target = page.locator('[data-testid=stage-column][data-stage-name="Qualified"] ul');
  await expect(card).toBeVisible();
  const from = (await card.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 15, from.y + from.height / 2 + 5, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + 40, { steps: 20 });
  await page.mouse.up();
  await expect(
    page.locator(
      '[data-testid=stage-column][data-stage-name="Qualified"] [data-deal-title="E2E 12-unit acquisition"]',
    ),
  ).toBeVisible();
  await expect(
    page.locator("[data-sonner-toast]").filter({ hasText: "Moved to Qualified" }),
  ).toBeVisible();

  // Persisted after reload
  await page.reload();
  await expect(
    page.locator(
      '[data-testid=stage-column][data-stage-name="Qualified"] [data-deal-title="E2E 12-unit acquisition"]',
    ),
  ).toBeVisible();

  // 6) Stage history + activity were logged -----------------------------------------
  await page
    .locator('[data-testid=deal-card][data-deal-title="E2E 12-unit acquisition"] button')
    .click();
  const drawer = page.getByTestId("deal-drawer");
  await expect(drawer.getByTestId("stage-history")).toContainText("Qualified");
  await expect(drawer.locator("[data-activity-type=stage_change]")).toContainText(
    "Moved from New Deal to Qualified",
  );
  await page.keyboard.press("Escape");
  await goto(page, "/w/e2e-realty/today");
  await expect(page.getByTestId("activity-timeline")).toContainText(
    "Moved from New Deal to Qualified",
  );

  // 7) Switch workspace: isolation + re-skin ----------------------------------------
  await page.getByTestId("workspace-switcher").click();
  await page.getByTestId("switch-to-e2e-builders").click();
  await page.waitForURL(/\/w\/e2e-builders\/today/);
  await expect.poll(() => brandAccent(page)).toBe("#FFC20E");
  const sidebar = page.getByRole("complementary", { name: "Sidebar" });
  await expect(sidebar.getByRole("link", { name: /^Projects/ })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: /Deal Finder/ })).toHaveCount(0);

  await goto(page, "/w/e2e-builders/people?q=jules");
  await expect(page.getByText("No contacts match")).toBeVisible();
  await goto(page, "/w/e2e-builders/pipeline");
  await expect(page.locator('[data-deal-title="E2E 12-unit acquisition"]')).toHaveCount(0);

  // Not a member of Sam's workspaces → indistinguishable from not found.
  const res = await page.goto("/w/housing4all/today");
  expect(res?.status()).toBe(404);
});
