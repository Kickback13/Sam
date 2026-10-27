import { expect, test } from "@playwright/test";

import { E2E_AZH_SLUG, resetAzhWorkspace, sql } from "./azh-helpers";
import { expectToast, goto, hydrated, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await resetAzhWorkspace();
});

test("two San Diego assignees both get a task for every new request", async ({ browser, page }) => {
  // Admin picks two people for San Diego.
  await signIn(page);
  await goto(page, `/w/${E2E_AZH_SLUG}/settings/azh`);
  const sd = page.getByTestId("assignees-san_diego_assignees");
  await expect(sd).toContainText(
    "Nobody yet. Each new San Diego request creates one unassigned task.",
  );
  await sd.getByLabel("Erin Tester").check();
  await sd.getByLabel("Oscar Outsider").check();
  await expect(sd).toContainText(
    "New San Diego requests go to Erin Tester and Oscar Outsider (one task each). Erin Tester owns the request.",
  );
  await page.getByTestId("save-azh-settings").click();
  await expectToast(page, "AZH settings saved");
  await page.reload();
  await expect(
    page.getByTestId("assignees-san_diego_assignees").getByLabel("Oscar Outsider"),
  ).toBeChecked();

  // A homeowner submits the public form (local stack only).
  const visitor = await browser.newContext();
  const form = await visitor.newPage();
  await form.goto(`/r/${E2E_AZH_SLUG}`);
  await hydrated(form);
  await form.getByLabel(/Full name/).fill("Sample Twoassignees");
  await form.getByLabel(/^Phone/).fill("(619) 555-0147");
  await form.getByLabel(/Job address/).fill("12 Example Ave");
  await form.getByLabel(/ZIP code/).fill("92104");
  await form.getByLabel(/Type of work/).selectOption("Painting");
  await form.getByLabel(/Describe the work/).fill("Repaint the living room.");
  await form.getByTestId("submit-request").click();
  await form.waitForURL(/\/thanks\?lang=en$/);
  await visitor.close();

  // Exactly one task each, and the request is owned by the first person.
  const rows = await sql<{ email: string }>(
    `select p.email::text as email from public.tasks t join public.profiles p on p.id = t.assigned_to
     where t.title like '%Sample Twoassignees (San Diego office)%' order by p.email`,
  );
  expect(rows.map((r) => r.email)).toEqual(["e2e-admin@example.test", "e2e-outsider@example.test"]);
  const [{ owner }] = await sql<{ owner: string }>(
    `select p.email::text as owner from public.azh_requests r join public.profiles p on p.id = r.assigned_to
     join public.contacts c on c.id = r.contact_id where c.last_name = 'Twoassignees'`,
  );
  expect(owner).toBe("e2e-admin@example.test");

  // Both people see it in My tasks.
  await goto(page, `/w/${E2E_AZH_SLUG}/tasks`);
  await expect(page.getByText(/Sample Twoassignees \(San Diego office\)/)).toBeVisible();
  const other = await browser.newContext();
  const oscar = await other.newPage();
  await signIn(oscar, "e2e-outsider@example.test");
  await goto(oscar, `/w/${E2E_AZH_SLUG}/tasks`);
  await expect(oscar.getByText(/Sample Twoassignees \(San Diego office\)/)).toBeVisible();
  await other.close();
});
