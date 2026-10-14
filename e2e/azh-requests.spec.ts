import { expect, test } from "@playwright/test";

import { E2E_AZH_SLUG, resetAzhWorkspace, seedRequest } from "./azh-helpers";
import { expectToast, goto, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await resetAzhWorkspace();
  await seedRequest({
    name: "Sample Northcounty",
    phone: "(760) 555-0131",
    zip: "92028",
    service: "Drywall",
  });
  await seedRequest({
    name: "Sample Southbay",
    phone: "(619) 555-0132",
    zip: "91910",
    service: "Painting",
  });
});

test("requests inbox: filter → drawer → log call → assign → convert to project", async ({
  page,
}) => {
  await signIn(page);
  await goto(page, `/w/${E2E_AZH_SLUG}/requests`);
  await expect(page.getByTestId("request-row")).toHaveCount(2);

  await page.getByLabel("Office").selectOption("fallbrook");
  await page.waitForURL(/office=fallbrook/);
  await expect(page.getByTestId("request-row")).toHaveCount(1);
  await expect(page.getByTestId("request-row")).toContainText("Sample Northcounty");
  await page.getByLabel("Office").selectOption("");
  await page.waitForURL((u) => !u.search.includes("office="));
  await page.getByLabel("Service").selectOption("Painting");
  await page.waitForURL(/service=Painting/);
  await expect(page.getByTestId("request-row")).toHaveCount(1);
  await expect(page.getByTestId("request-row")).toContainText("Sample Southbay");
  await page.getByLabel("Service").selectOption("");
  await page.waitForURL((u) => !u.search.includes("service="));
  await page.getByLabel("Status").selectOption("new");
  await page.waitForURL(/status=new/);
  await expect(page.getByTestId("request-row")).toHaveCount(2);

  await page.getByTestId("request-row").filter({ hasText: "Sample Northcounty" }).click();
  const drawer = page.getByTestId("request-drawer");
  await expect(drawer).toContainText("Fallbrook office");
  await expect(drawer.getByTestId("request-consent")).toContainText("No — call or email only");

  await drawer.getByPlaceholder("What did you discuss?").fill("Wants estimate next week.");
  await drawer.getByTestId("log-call").click();
  await expectToast(page, "Call logged");
  await expect(drawer.locator("#req-status")).toHaveValue("contacted");
  await expect(drawer).toContainText("Reached — Wants estimate next week.");

  await drawer.locator("#req-assignee").selectOption({ label: "Erin Tester" });
  await expectToast(page, "Assignment updated");

  await drawer.getByTestId("convert-request").click();
  await expectToast(page, "Converted to a project");
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Estimate", { exact: true }).first()).toBeVisible();
  await expect(page.locator("#office")).toHaveValue("fallbrook");
  await expect(page.locator("#job_zip")).toHaveValue("92028");

  await goto(page, `/w/${E2E_AZH_SLUG}/requests?status=converted`);
  await expect(page.getByTestId("request-row")).toHaveCount(1);
});
