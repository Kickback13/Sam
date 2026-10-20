import { expect, test, type Page } from "@playwright/test";

import { E2E_AZH_SLUG, resetAzhWorkspace, seedRequest } from "./azh-helpers";
import { expectToast, goto, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

/** Tomorrow's date in San Diego. */
function tomorrow(): string {
  const d = new Date(Date.now() + 86400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(d);
}

test.beforeAll(async () => {
  await resetAzhWorkspace();
  await seedRequest({ name: "Sample Visitone", phone: "(619) 555-0135", zip: "92104" });
  await seedRequest({ name: "Sample Visittwo", phone: "(760) 555-0136", zip: "92028" });
});

async function book(page: Page, name: string, time: string) {
  await goto(page, `/w/${E2E_AZH_SLUG}/requests`);
  await page.getByTestId("request-row").filter({ hasText: name }).click();
  const drawer = page.getByTestId("request-drawer");
  await drawer.getByTestId("schedule-visit").click();
  await page.locator("#visit-date").fill(tomorrow());
  await page.locator("#visit-time").fill(time);
  await page.locator("#visit-estimator").selectOption({ label: "Erin Tester" });
  await page.getByTestId("save-visit").click();
}

test("book visits from requests, warn on double-booking, see them in the week view", async ({
  page,
}) => {
  await signIn(page);

  await book(page, "Sample Visitone", "09:00");
  await expectToast(page, "Estimate visit scheduled");
  const drawer = page.getByTestId("request-drawer");
  await expect(drawer.locator("#req-status")).toHaveValue("estimate_scheduled");
  await expect(drawer.getByTestId("visit-list")).toContainText("Erin Tester");

  await book(page, "Sample Visittwo", "09:30");
  await expect(page.getByTestId("visit-conflict")).toContainText("Double-booked");
  await page.getByTestId("book-anyway").click();
  await expectToast(page, "Estimate visit scheduled");

  await goto(page, `/w/${E2E_AZH_SLUG}/schedule?week=${tomorrow()}`);
  const day = page.locator(`[data-testid="week-day"][data-date="${tomorrow()}"]`);
  await expect(day.getByTestId("visit-card")).toHaveCount(2);
  await expect(day.getByTestId("double-booked")).toHaveCount(2);

  // Per-office view.
  await page.getByRole("link", { name: "Fallbrook" }).click();
  await expect(day.getByTestId("visit-card")).toHaveCount(1);

  // Cancel one → no longer double-booked.
  await page.getByRole("link", { name: "Both offices" }).click();
  await day.getByTestId("visit-card").first().getByRole("button", { name: "Cancel visit" }).click();
  await expectToast(page, "Visit canceled");
  await expect(day.getByTestId("double-booked")).toHaveCount(0);
});
