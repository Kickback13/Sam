import { expect, test } from "@playwright/test";

import { goto, signIn } from "./helpers";

test("GoHighLevel import page works at 390px with no sideways scroll", async ({ page }) => {
  await signIn(page);
  await goto(page, "/w/e2e-builders/settings/integrations/gohighlevel");
  await expect(page.getByTestId("ghl-status")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, "horizontal overflow on the GHL page").toBeLessThanOrEqual(1);
});
