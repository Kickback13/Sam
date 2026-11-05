import { expect, test } from "@playwright/test";

import { E2E_AZH_SLUG } from "./azh-helpers";
import { E2E_REALTY } from "./h4a-helpers";
import { goto, hydrated, signIn } from "./helpers";

test("Reports: live counts per workspace, period switch, table view, phone width", async ({
  page,
}) => {
  await signIn(page);
  await goto(page, `/w/${E2E_REALTY}/reports`);
  await expect(page.getByRole("heading", { level: 1, name: "Reports" })).toBeVisible();
  for (const id of ["stat-open", "stat-won", "stat-winrate", "stat-listings", "stat-bookings"])
    await expect(page.getByTestId(id)).toBeVisible();
  await expect(page.getByTestId("chart-listings")).toBeVisible();
  await expect(page.getByTestId("stage-bars")).toContainText("New Deal");

  // Period switch.
  await page.getByTestId("period-365").click();
  await expect(page).toHaveURL(/days=365/);
  await expect(page.getByTestId("period-365")).toHaveAttribute("aria-current", "page");

  // Every chart has a table view.
  const chart = page.getByTestId("chart-contacts");
  await chart.getByText("Show as table").click();
  await expect(chart.locator("table tbody tr").first()).toBeVisible();

  // AZH sees its own measures.
  await goto(page, `/w/${E2E_AZH_SLUG}/reports`);
  await expect(page.getByTestId("stat-requests")).toBeVisible();
  await expect(page.getByTestId("stat-estimates")).toBeVisible();
  await expect(page.getByTestId("stat-listings")).toHaveCount(0);
  await expect(page.getByTestId("requests-by-office")).toBeVisible();

  // Phone width.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await hydrated(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
