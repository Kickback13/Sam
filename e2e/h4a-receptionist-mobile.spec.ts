import { expect, test } from "@playwright/test";

import { E2E_REALTY } from "./h4a-helpers";
import { goto, signIn } from "./helpers";

test("Receptionist works at 390px: calls and setup, no sideways scroll", async ({ page }) => {
  await signIn(page);
  for (const path of [`/w/${E2E_REALTY}/receptionist`, `/w/${E2E_REALTY}/receptionist?tab=setup`]) {
    await goto(page, path);
    await expect(page.getByTestId("receptionist-status")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(1);
  }
});
