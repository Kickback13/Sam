import { expect, test } from "@playwright/test";

import { E2E_AZH_SLUG, resetAzhWorkspace, seedRequest, sql } from "./azh-helpers";
import { expectToast, goto, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

let dealId = "";
test.beforeAll(async () => {
  await resetAzhWorkspace();
  await seedRequest({
    name: "Sample Milestoner",
    phone: "(619) 555-0137",
    zip: "92104",
    service: "ADU",
  });
  [{ deal_id: dealId }] = await sql<{ deal_id: string }>(
    `select deal_id from public.azh_requests where workspace_id = (select id from public.workspaces where slug = $1)`,
    [E2E_AZH_SLUG],
  );
});

test("project schedule: milestones (late / done), upcoming list, site visit from the project", async ({
  page,
}) => {
  await signIn(page);
  await goto(page, `/w/${E2E_AZH_SLUG}/projects/${dealId}?tab=schedule`);
  const panel = page.getByTestId("milestones");
  await expect(panel).toContainText("No milestones yet");

  await page.getByLabel("New milestone name").fill("Demo & haul-away");
  await page.getByLabel("New milestone planned date").fill("2020-01-15");
  await page.getByTestId("add-milestone").click();
  await expectToast(page, "Milestone added");
  await page.getByLabel("New milestone name").fill("Framing inspection");
  await page.getByLabel("New milestone planned date").fill("2099-06-01");
  await page.getByTestId("add-milestone").click();
  await expect(panel.getByTestId("milestone-row")).toHaveCount(2);
  await expect(panel.getByTestId("milestone-row").first()).toContainText("Late");

  await page.getByLabel("Status of Demo & haul-away").selectOption("done");
  await expectToast(page, "Milestone updated");
  await expect(panel).toContainText("1 of 2 done");
  await expect(panel.getByTestId("milestone-row").first()).toContainText("Done");

  await goto(page, `/w/${E2E_AZH_SLUG}/schedule`);
  const upcoming = page.getByTestId("upcoming-milestones");
  await expect(upcoming).toContainText("Framing inspection");
  await expect(upcoming).not.toContainText("Demo & haul-away");

  await goto(page, `/w/${E2E_AZH_SLUG}/projects/${dealId}?tab=schedule`);
  await page.getByTestId("schedule-visit").click();
  await page.locator("#visit-time").fill("13:00");
  await page.getByTestId("save-visit").click();
  await expectToast(page, "Estimate visit scheduled");
  await expect(page.getByTestId("visit-list").getByTestId("visit-card")).toHaveCount(1);
});
