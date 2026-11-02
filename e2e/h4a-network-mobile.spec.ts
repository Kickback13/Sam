import { expect, test } from "@playwright/test";

import { E2E_REALTY, sql } from "./h4a-helpers";
import { goto, hydrated, password } from "./helpers";

const BASE = `/n/${E2E_REALTY}`;

test("Network member app works at 390px: bottom tabs, no sideways scroll", async ({ page }) => {
  await sql(
    `insert into public.network_members (workspace_id, user_id, display_name)
     select w.id, u.id, 'Nina Member' from public.workspaces w, auth.users u
     where w.slug = $1 and u.email = 'e2e-member@example.test'
     on conflict (workspace_id, user_id) do update set status = 'active'`,
    [E2E_REALTY],
  );
  await goto(page, `/login?next=${encodeURIComponent(BASE)}`);
  await page.getByLabel("Work email").fill("e2e-member@example.test");
  await page.getByLabel(/Password/).fill(password());
  await page.getByTestId("login-submit").click();
  await page.waitForURL(new RegExp(`${BASE}$`));
  await hydrated(page);

  const tabs = page.getByRole("navigation", { name: "Network" });
  await expect(tabs).toBeVisible();
  for (const label of ["Feed", "Deals", "Events", "Members", "Me"])
    await expect(tabs.getByRole("link", { name: label, exact: true })).toBeVisible();

  for (const path of [BASE, `${BASE}/deals`, `${BASE}/events`, `${BASE}/members`, `${BASE}/me`]) {
    await goto(page, path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(1);
  }
});
