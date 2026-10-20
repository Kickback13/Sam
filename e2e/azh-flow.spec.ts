import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { E2E_AZH_SLUG, resetAzhWorkspace, sql, TINY_PNG } from "./azh-helpers";
import { expectToast, goto, hydrated, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

const base = `/w/${E2E_AZH_SLUG}`;

function tomorrow(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(
    new Date(Date.now() + 86400_000),
  );
}

test.beforeAll(async () => {
  await resetAzhWorkspace();
});

test("AZH end to end: public form + photo → inbox → visit → project → estimate → PDF → Bid Sent → change order → budget vs actual", async ({
  browser,
  page,
}) => {
  // 1) Homeowner submits the public form with a photo (no login, separate browser context).
  const visitor = await browser.newContext();
  const form = await visitor.newPage();
  await form.goto(`/r/${E2E_AZH_SLUG}`);
  await hydrated(form);
  await form.getByLabel(/Full name/).fill("Sample Endtoend");
  await form.getByLabel(/^Phone/).fill("(760) 555-0139");
  await form.getByLabel(/Email/).fill("sample.endtoend@example.com");
  await form.getByLabel(/Job address/).fill("77 Example Ln");
  await form.getByLabel(/ZIP code/).fill("92028");
  await form.getByLabel(/Type of work/).selectOption("Renovation");
  await form
    .getByLabel(/Describe the work/)
    .fill("Bathroom renovation: new tile, vanity and drywall repair.");
  await form
    .getByTestId("photo-input")
    .setInputFiles({ name: "bathroom.png", mimeType: "image/png", buffer: TINY_PNG });
  await form.getByTestId("submit-request").click();
  await form.waitForURL(/\/thanks\?lang=en$/);
  await visitor.close();

  // 2) It lands in the inbox, routed to Fallbrook, with the photo.
  await signIn(page);
  await goto(page, `${base}/requests`);
  const row = page.getByTestId("request-row").filter({ hasText: "Sample Endtoend" });
  await expect(row).toContainText("Fallbrook");
  await expect(row).toContainText("1 photo");
  await row.click();
  const drawer = page.getByTestId("request-drawer");
  await expect(drawer.getByTestId("request-photos").locator("img")).toHaveCount(1);
  await expect
    .poll(() =>
      drawer
        .getByTestId("request-photos")
        .locator("img")
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);

  // 3) Schedule an estimate visit.
  await drawer.getByTestId("schedule-visit").click();
  await page.locator("#visit-date").fill(tomorrow());
  await page.locator("#visit-time").fill("10:00");
  await page.getByTestId("save-visit").click();
  await expectToast(page, "Estimate visit scheduled");
  await expect(drawer.locator("#req-status")).toHaveValue("estimate_scheduled");

  // 4) Convert to a project.
  await drawer.getByTestId("convert-request").click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/);
  const projectUrl = page.url();
  const dealId = projectUrl.split("/").pop()!;
  await page.locator("#contract_value").fill("12,000");
  await page.getByTestId("save-project").click();
  await expectToast(page, "Project saved");

  // 5) Build the estimate.
  await goto(page, `${projectUrl}?tab=estimates`);
  await page.getByTestId("new-estimate").click();
  await page.getByLabel("Line 1 description").fill("Demo and haul-away");
  await page.getByLabel("Line 1 quantity").fill("1");
  await page.getByLabel("Line 1 unit price").fill("1,450");
  await page.getByTestId("add-line").click();
  await page.getByLabel("Line 2 description").fill("Tile (supply + install)");
  await page.getByLabel("Line 2 quantity").fill("85");
  await page.getByLabel("Line 2 unit", { exact: true }).fill("sq ft");
  await page.getByLabel("Line 2 unit price").fill("24.75");
  await page.locator("#tax").fill("7.75");
  // 1450 + 2103.75 = 3553.75; tax 275.415625 → 275.42; total 3829.17
  await expect(page.getByTestId("estimate-total-value")).toHaveText("$3,829.17");
  await page.getByTestId("save-estimate").click();
  await expectToast(page, "Estimate saved · $3,829.17");

  // 6) The PDF downloads.
  const dl = page.waitForEvent("download");
  await page.getByTestId("estimate-pdf").click();
  const pdf = await dl;
  expect(
    readFileSync((await pdf.path())!)
      .subarray(0, 5)
      .toString(),
  ).toBe("%PDF-");

  // 7) Move the project to Bid Sent on the board.
  await goto(page, `${base}/pipeline?deal=${dealId}`);
  const dealDrawer = page.getByTestId("deal-drawer");
  await dealDrawer
    .getByRole("combobox", { name: "Stage", exact: true })
    .selectOption({ label: "Bid Sent" });
  await expectToast(page, "Moved to Bid Sent");
  const [{ stage }] = await sql<{ stage: string }>(
    `select s.name as stage from public.deals d join public.pipeline_stages s on s.id = d.stage_id where d.id = $1`,
    [dealId],
  );
  expect(stage).toBe("Bid Sent");

  // 8) Add and approve a change order → contract value goes up.
  await goto(page, `${projectUrl}?tab=budget`);
  await expect(page.getByTestId("stat-contract-value")).toHaveText("$12,000.00");
  await page.getByLabel("Change order description").fill("Add niche in shower");
  await page.getByLabel("Change order amount").fill("650");
  await page.getByTestId("add-change-order").click();
  await expectToast(page, "Change order added");
  await page.getByTestId("change-order-row").getByRole("button", { name: "Approve" }).click();
  await expectToast(page, "Change order #1 approved");
  await expect(page.getByTestId("stat-contract-value")).toHaveText("$12,650.00");

  // 9) Budget vs. actual updates.
  await page.getByLabel("Budget category").fill("Tile");
  await page.getByLabel("Budgeted amount").fill("2,000");
  await page.getByTestId("add-budget-line").click();
  await expectToast(page, "Budget line added");
  await expect(page.getByTestId("variance-total")).toHaveText("$2,000.00");
  await page.locator("#cost-vendor").fill("Example Tile Supply");
  await page.locator("#cost-amount").fill("2,240.10");
  await page.locator("#cost-category").fill("Tile");
  await page.getByTestId("add-cost").click();
  await expectToast(page, "Cost added");
  await expect(page.getByTestId("variance-total")).toHaveText("-$240.10");
  await expect(page.getByTestId("stat-variance")).toContainText("Over budget");
});
