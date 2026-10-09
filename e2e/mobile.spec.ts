import { expect, test } from "@playwright/test";

import { goto, signIn } from "./helpers";

test("works at 390px: bottom nav, stage list instead of board, no sideways scroll", async ({
  page,
}) => {
  await signIn(page);
  for (const url of [
    "/w/e2e-realty/today",
    "/w/e2e-realty/people",
    "/w/e2e-realty/pipeline",
    "/w/e2e-realty/settings",
  ]) {
    await goto(page, url);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, `horizontal overflow on ${url}`).toBeLessThanOrEqual(1);
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  }
  await goto(page, "/w/e2e-realty/pipeline");
  await expect(page.getByTestId("stage-list")).toBeVisible();
  await expect(page.getByTestId("kanban")).toBeHidden();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("dialog").getByRole("link", { name: /Properties/ })).toBeVisible();
});
