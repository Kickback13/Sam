import { expect, test, type Page } from "@playwright/test";

import { sql } from "./azh-helpers";
import { goto, signIn } from "./helpers";

// Runs in the "mobile" project (390px) — see playwright.config.ts testMatch.
const shots = process.env.AZH_SCREENSHOTS === "1";

test.beforeAll(async () => {
  // Local stack only: let the e2e admin see the AZH Demo workspace (real sample data).
  await sql(
    `insert into public.workspace_members (workspace_id, user_id, role)
     select id, 'e2e00000-0000-4000-a000-000000000001', 'admin' from public.workspaces where slug = 'demo-azh'
     on conflict (workspace_id, user_id) do nothing`,
  );
});

async function noSidewaysScroll(page: Page, label: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, `horizontal overflow on ${label}`).toBeLessThanOrEqual(1);
  if (shots)
    await page.screenshot({
      path: `test-results/azh-390-${label.replace(/\W+/g, "_")}.png`,
      fullPage: true,
    });
}

test("AZH screens work at 390px with no sideways scroll", async ({ page }) => {
  // Public form (no login).
  for (const url of [
    "/r/demo-azh",
    "/r/demo-azh?lang=es",
    "/r/demo-azh/embed",
    "/r/demo-azh/thanks",
  ]) {
    await goto(page, url);
    await noSidewaysScroll(page, url);
  }

  await signIn(page);
  const [{ id: dealId }] = await sql<{ id: string }>(
    `select d.id from public.deals d join public.workspaces w on w.id = d.workspace_id
     where w.slug = 'demo-azh' and d.title like 'Full renovation%'`,
  );
  for (const url of [
    "/w/demo-azh/today",
    "/w/demo-azh/requests",
    "/w/demo-azh/pipeline",
    "/w/demo-azh/schedule",
    "/w/demo-azh/settings/azh",
    ...["overview", "estimates", "files", "schedule", "budget", "tasks", "activity"].map(
      (t) => `/w/demo-azh/projects/${dealId}?tab=${t}`,
    ),
  ]) {
    await goto(page, url);
    await noSidewaysScroll(page, url);
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  }

  // Request drawer at 390px.
  await goto(page, "/w/demo-azh/requests");
  await page.getByTestId("request-row").first().click();
  await expect(page.getByTestId("request-drawer")).toBeVisible();
  await noSidewaysScroll(page, "request-drawer");

  // Requests + Schedule are reachable from the "More" drawer.
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("dialog").getByRole("link", { name: /Requests/ })).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("link", { name: /Schedule/ })).toBeVisible();
});
