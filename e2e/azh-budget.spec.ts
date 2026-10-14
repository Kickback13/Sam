import { expect, test } from "@playwright/test";

import { E2E_AZH_SLUG, resetAzhWorkspace, seedRequest, sql, TINY_PNG } from "./azh-helpers";
import { expectToast, goto, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

let dealId = "";
test.beforeAll(async () => {
  await resetAzhWorkspace();
  await seedRequest({
    name: "Sample Budgeter",
    phone: "(619) 555-0138",
    zip: "92104",
    service: "Renovation",
  });
  [{ deal_id: dealId }] = await sql<{ deal_id: string }>(
    `select deal_id from public.azh_requests where workspace_id = (select id from public.workspaces where slug = $1)`,
    [E2E_AZH_SLUG],
  );
  await sql(`update public.azh_projects set contract_value = 20000 where deal_id = $1`, [dealId]);
});

test("budget: lines, costs with receipt, variance, change orders add to the contract value", async ({
  page,
}) => {
  await signIn(page);
  await goto(page, `/w/${E2E_AZH_SLUG}/projects/${dealId}?tab=budget`);
  await expect(page.getByTestId("stat-contract-value")).toHaveText("$20,000.00");

  for (const [cat, amt] of [
    ["Framing", "5000"],
    ["Drywall", "2,500.50"],
  ]) {
    await page.getByLabel("Budget category").fill(cat);
    await page.getByLabel("Budgeted amount").fill(amt);
    await page.getByTestId("add-budget-line").click();
    await expectToast(page, "Budget line added");
  }
  await expect(page.getByTestId("stat-budget-value")).toHaveText("$7,500.50");

  await page.locator("#cost-vendor").fill("Example Lumber Co.");
  await page.locator("#cost-amount").fill("5,200.25");
  await page.locator("#cost-category").fill("Framing");
  await page
    .locator("#cost-receipt")
    .setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: TINY_PNG });
  await page.getByTestId("add-cost").click();
  await expectToast(page, "Cost added");
  await expect(page.getByTestId("cost-row")).toContainText("Receipt");

  const framing = page.getByTestId("variance-row").filter({ hasText: "Framing" });
  await expect(framing).toContainText("-$200.25");
  await expect(framing).toContainText("104%");
  await expect(page.getByTestId("variance-total")).toHaveText("$2,300.25");
  await expect(page.getByTestId("stat-actual-value")).toHaveText("$5,200.25");

  // Change orders: approved ones add to the contract; credits subtract.
  await page.getByLabel("Change order description").fill("Add recessed lighting");
  await page.getByLabel("Change order amount").fill("1,250");
  await page.getByTestId("add-change-order").click();
  await expectToast(page, "Change order added");
  await page.getByLabel("Change order description").fill("Credit: owner supplies tile");
  await page.getByLabel("Change order amount").fill("-300");
  await page.getByTestId("add-change-order").click();
  await expectToast(page, "Change order added");
  await expect(page.getByTestId("stat-contract-value")).toHaveText("$20,000.00");

  for (const n of ["#1", "#2"]) {
    await page
      .getByTestId("change-order-row")
      .filter({ hasText: n })
      .getByRole("button", { name: "Approve" })
      .click();
    await expectToast(page, `Change order ${n} approved`);
  }
  await expect(page.getByTestId("stat-contract-value")).toHaveText("$20,950.00");
  await expect(page.getByTestId("project-value")).toHaveText("$20,950.00");

  // The deal value on the board follows.
  const [{ value }] = await sql<{ value: string }>(
    `select value::text from public.deals where id = $1`,
    [dealId],
  );
  expect(value).toBe("20950.00");
});
