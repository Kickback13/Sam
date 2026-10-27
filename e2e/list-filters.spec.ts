import { expect, test } from "@playwright/test";

import { E2E_REALTY } from "./h4a-helpers";
import { goto, signIn } from "./helpers";

test("list filters: two quick changes keep both, even on a slow connection", async ({ page }) => {
  await signIn(page);
  await goto(page, `/w/${E2E_REALTY}/deal-finder`);

  // Slow every page-data request so the second change happens mid-navigation.
  await page.route("**/*", async (route) => {
    if (route.request().headers()["rsc"]) await new Promise((r) => setTimeout(r, 1200));
    await route.continue();
  });

  await page.getByRole("combobox", { name: "Status", exact: true }).selectOption("all");
  await page.getByRole("combobox", { name: "Score", exact: true }).selectOption("high");
  await page.getByRole("combobox", { name: "Source", exact: true }).selectOption("csv");

  await expect(page).toHaveURL(/status=all/);
  await expect(page).toHaveURL(/band=high/);
  await expect(page).toHaveURL(/origin=csv/);
  // The selects show what was picked once loading is done.
  await expect(page.getByRole("combobox", { name: "Status", exact: true })).toHaveValue("all");
  await expect(page.getByRole("combobox", { name: "Score", exact: true })).toHaveValue("high");
  await expect(page.getByRole("combobox", { name: "Source", exact: true })).toHaveValue("csv");
  await page.unroute("**/*");

  // Opening a filtered link directly shows exactly that URL's filters.
  await goto(page, `/w/${E2E_REALTY}/deal-finder?origin=email`);
  await expect(page.getByRole("combobox", { name: "Source", exact: true })).toHaveValue("email");
  await expect(page.getByRole("combobox", { name: "Score", exact: true })).toHaveValue("");
});
