import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { E2E_AZH_SLUG, resetAzhWorkspace } from "./azh-helpers";
import { expectToast, goto, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

const base = `/w/${E2E_AZH_SLUG}`;

test.beforeAll(async () => {
  await resetAzhWorkspace();
});

test("AZH projects: details → estimate (live totals, PDF, versions) → board card → settings", async ({
  page,
}) => {
  await signIn(page);

  // Create a project on the board and open its project page from the drawer.
  await goto(page, `${base}/pipeline`);
  await page.getByTestId("new-deal").click();
  await page.locator("#deal-title").fill("E2E Kitchen remodel");
  await page.getByTestId("create-deal").click();
  await expectToast(page, "Project created");
  await page.getByTestId("open-project").click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name: "E2E Kitchen remodel" })).toBeVisible();
  const projectUrl = page.url();

  // Overview: job details.
  await page.locator("#job_address").fill("123 Example St");
  await page.locator("#job_zip").fill("92028");
  await page.getByLabel("Drywall").check();
  await page.getByLabel("Painting").check();
  await page.locator("#office").selectOption("fallbrook");
  await page.locator("#contract_value").fill("48,000");
  await page.getByTestId("save-project").click();
  await expectToast(page, "Project saved");
  await expect(page.getByTestId("project-value")).toHaveText("$48,000.00");

  // Estimates: three lines, markup + tax, totals to the cent.
  await page.getByRole("link", { name: "Estimates" }).click();
  await page.getByTestId("new-estimate").click();
  await expect(page.getByTestId("estimate-editor")).toBeVisible();
  const lines = [
    ["Drywall sheets", "120", "sheet", "2.35"],
    ["Labor", "16", "hr", "65"],
    ["Fixture", "1", "", "349.99"],
  ];
  for (const [i, [desc, qty, unit, price]] of lines.entries()) {
    if (i > 0) await page.getByTestId("add-line").click();
    await page.getByLabel(`Line ${i + 1} description`).fill(desc);
    await page.getByLabel(`Line ${i + 1} quantity`).fill(qty);
    await page.getByLabel(`Line ${i + 1} unit`, { exact: true }).fill(unit);
    await page.getByLabel(`Line ${i + 1} unit price`).fill(price);
  }
  await page.locator("#markup").fill("12.5");
  await page.locator("#tax").fill("7.75");
  await expect(page.getByTestId("estimate-total-value")).toHaveText("$2,026.77");
  await page.getByTestId("save-estimate").click();
  await expectToast(page, "Estimate saved · $2,026.77");

  // PDF downloads.
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("estimate-pdf").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^estimate-v1-E2E-Kitchen-remodel\.pdf$/);
  expect(
    readFileSync((await download.path())!)
      .subarray(0, 5)
      .toString(),
  ).toBe("%PDF-");

  // Send it → locked; duplicate to revise → v2 draft.
  await page.locator("#estimate-status").selectOption("sent");
  await expectToast(page, "Status updated");
  await expect(page.getByText(/so it.s locked/)).toBeVisible();
  await page.getByTestId("duplicate-estimate").click();
  await expectToast(page, "Version 2 created as a draft");
  await expect(page.getByRole("heading", { name: /Version 2/ })).toBeVisible();
  await expect(page.getByLabel("Estimate versions").getByRole("link")).toHaveCount(2);

  // Board card shows office + services + value.
  await goto(page, `${base}/pipeline`);
  const card = page.getByTestId("deal-card").filter({ hasText: "E2E Kitchen remodel" });
  await expect(card.getByTestId("card-azh")).toContainText("Fallbrook office");
  await expect(card.getByTestId("card-azh")).toContainText("Drywall, Painting");
  await expect(card).toContainText("$48,000");

  // AZH settings tab (construction only) with CSLB, service list and ZIP routing.
  await goto(page, `${base}/settings/azh`);
  await expect(page.getByRole("link", { name: "AZH" })).toHaveAttribute("aria-current", "page");
  await page.locator("#cslb").fill("TEST-0000");
  await page.getByLabel("New service type").fill("Roofing");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByTestId("save-azh-settings").click();
  await expectToast(page, "AZH settings saved");
  await expect(page.getByTestId("service-types")).toContainText("Roofing");
  await page.locator("#zips").fill("92028, 92003 92059");
  await page.getByTestId("save-zips").click();
  await expectToast(page, "3 ZIPs now route to Fallbrook");
  await expect(page.getByTestId("embed-snippet")).toHaveValue(/\/r\/e2e-builders\/embed/);

  // The new service shows up on the project form.
  await goto(page, projectUrl);
  await expect(page.getByLabel("Roofing")).toBeVisible();
});

test("AZH settings tab is hidden for real-estate workspaces", async ({ page }) => {
  await signIn(page);
  await goto(page, "/w/e2e-realty/settings");
  await expect(page.getByRole("navigation", { name: "Settings" })).not.toContainText("AZH");
  const res = await page.goto("/w/e2e-realty/settings/azh");
  expect(res?.status()).toBe(404);
});
