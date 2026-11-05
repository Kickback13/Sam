import { expect, test } from "@playwright/test";

import { E2E_AZH_SLUG, resetAzhWorkspace, seedRequest, sql } from "./azh-helpers";
import { goto, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

const base = `/w/${E2E_AZH_SLUG}`;
let contactId = "";

test.beforeAll(async () => {
  await resetAzhWorkspace();
  // A homeowner request through the real intake trigger: contact + project + request.
  await seedRequest({
    name: "Hub Homeowner",
    phone: "(760) 555-0142",
    zip: "92028",
    service: "Drywall",
  });
  const [req] = await sql<{ contact_id: string; deal_id: string; workspace_id: string }>(
    `select contact_id, deal_id, workspace_id from public.azh_requests
     where workspace_id = (select id from public.workspaces where slug = $1)`,
    [E2E_AZH_SLUG],
  );
  contactId = req.contact_id;
  // An estimate visit and a sent estimate on that project.
  await sql(
    `insert into public.azh_visits (workspace_id, deal_id, starts_at, ends_at, office, address, status)
     values ($1, $2, now() - interval '2 days', now() - interval '2 days' + interval '1 hour', 'fallbrook', '10 Example Ct', 'completed')`,
    [req.workspace_id, req.deal_id],
  );
  await sql(
    `insert into public.azh_estimates (workspace_id, deal_id, title, status, sent_on)
     values ($1, $2, 'Drywall estimate', 'sent', current_date - 1)`,
    [req.workspace_id, req.deal_id],
  );
});

test("AZH communication hub: one timeline per contact with filters", async ({ page }) => {
  await signIn(page);
  await goto(page, `${base}/people/${contactId}`);

  const hub = page.getByTestId("contact-hub");
  await expect(hub).toBeVisible();
  const timeline = hub.getByTestId("hub-timeline");
  await expect(timeline).toContainText("Request received — Drywall");
  await expect(timeline).toContainText("Fallbrook office");
  await expect(timeline).toContainText("Project opened — Drywall");
  await expect(timeline).toContainText("Estimate visit — completed");
  await expect(timeline).toContainText("Estimate sent — Drywall estimate v1");
  // The intake trigger's own log lines (contact + project) show up too.
  await expect(timeline.locator("[data-activity-type=system]").first()).toBeVisible();

  // Log a call: it lands in the same timeline.
  const log = page.getByTestId("log-activity");
  await log.getByRole("tab", { name: "Log call" }).click();
  await log.getByPlaceholder("What was discussed?").fill("Walked through the drywall scope");
  await log.getByRole("button", { name: "Log call" }).click();
  await expect(timeline.locator("[data-activity-type=call]")).toContainText(
    "Walked through the drywall scope",
  );

  // Filters narrow the list.
  await hub.getByTestId("hub-filter-calls").click();
  await expect(timeline.locator("li")).toHaveCount(1);
  await hub.getByTestId("hub-filter-estimate").click();
  await expect(timeline.locator("[data-hub-kind=estimate]")).toHaveCount(2);
  await expect(timeline.locator("[data-activity-type]")).toHaveCount(0);
  await hub.getByTestId("hub-filter-visit").click();
  await expect(timeline.locator("li")).toHaveCount(1);

  // Entries link to their source record.
  await timeline.getByRole("link", { name: "Estimate visit — completed" }).click();
  await page.waitForURL(/\/schedule$/);
  await goto(page, `${base}/people/${contactId}`);
  await hub.getByTestId("hub-filter-estimate").click();
  await timeline.getByRole("link", { name: /Estimate sent/ }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}\/estimates$/);

  // Messaging is labeled, not faked.
  await goto(page, `${base}/people/${contactId}`);
  await expect(hub.getByTestId("hub-messaging-status")).toContainText(
    "Texts and emails: not connected.",
  );

  // Works at phone width.
  await page.setViewportSize({ width: 390, height: 844 });
  await goto(page, `${base}/people/${contactId}`);
  await expect(hub).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("Housing4All contacts keep the plain timeline", async ({ page }) => {
  const ws = `(select id from public.workspaces where slug = 'e2e-realty')`;
  await sql(
    `delete from public.contacts where workspace_id = ${ws} and full_name = 'Hub Realty Contact'`,
  );
  const [{ id }] = await sql<{ id: string }>(
    `insert into public.contacts (workspace_id, first_name, last_name) values (${ws}, 'Hub', 'Realty Contact') returning id`,
  );
  await signIn(page);
  await goto(page, `/w/e2e-realty/people/${id}`);
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();
  await expect(page.getByTestId("contact-hub")).toHaveCount(0);
});
