import { expect, test } from "@playwright/test";

import { E2E_REALTY, seedListing } from "./h4a-helpers";
import { goto, signIn } from "./helpers";

test("Deal Finder works at 390px: list, listing detail, alerts, buy box, tools — no sideways scroll", async ({
  page,
}) => {
  const id = await seedListing("77 Mobile Test St", "92104");
  await signIn(page);
  const base = `/w/${E2E_REALTY}`;
  for (const url of [
    `${base}/deal-finder`,
    `${base}/deal-finder/${id}`,
    `${base}/alerts`,
    `${base}/settings/buy-box`,
    `${base}/deal-finder/paste`,
    `${base}/deal-finder/new`,
    `${base}/deal-finder/import`,
    `${base}/deal-finder/emails`,
    `${base}/settings/integrations`,
  ]) {
    await goto(page, url);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, `horizontal overflow on ${url}`).toBeLessThanOrEqual(1);
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  }

  // The list card and the detail page are usable at this width.
  await goto(page, `${base}/deal-finder?status=all`);
  const card = page.locator('[data-testid=listing-card][data-address="77 Mobile Test St"]');
  await expect(card.getByRole("link", { name: "77 Mobile Test St" })).toBeVisible();
  await expect(card.getByTestId("score-badge").locator("visible=true")).toBeVisible();
  await card.getByRole("link", { name: "77 Mobile Test St" }).click();
  await expect(page.getByTestId("score-breakdown")).toBeVisible();
  await expect(page.getByTestId("verification-panel")).toBeVisible();
  await expect(page.getByTestId("listing-actions")).toBeVisible();
});
