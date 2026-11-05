import { expect, test } from "@playwright/test";

import { E2E_REALTY, sql } from "./h4a-helpers";
import { goto, signIn } from "./helpers";

const WS = `(select id from public.workspaces where slug = $1)`;

async function cleanup() {
  await sql(`delete from public.contacts where workspace_id = ${WS} and last_name = 'PmTest'`, [
    E2E_REALTY,
  ]);
  await sql(
    `delete from public.companies where workspace_id = ${WS} and name in ('E2E Bayview PM', 'E2E Broker Co')`,
    [E2E_REALTY],
  );
}

test.beforeAll(async () => {
  await cleanup();
  const [{ id: pm }] = await sql<{ id: string }>(
    `insert into public.companies (workspace_id, name, type, city) values (${WS}, 'E2E Bayview PM', 'property_management', 'San Diego') returning id`,
    [E2E_REALTY],
  );
  await sql(
    `insert into public.companies (workspace_id, name, type) values (${WS}, 'E2E Broker Co', 'brokerage')`,
    [E2E_REALTY],
  );
  const [{ id: ann }] = await sql<{ id: string }>(
    `insert into public.contacts (workspace_id, first_name, last_name, company_id) values (${WS}, 'Ann', 'PmTest', $2) returning id`,
    [E2E_REALTY, pm],
  );
  await sql(
    `insert into public.contacts (workspace_id, first_name, last_name, roles) values (${WS}, 'Cy', 'PmTest', array['property_manager'])`,
    [E2E_REALTY],
  );
  await sql(
    `insert into public.activities (workspace_id, type, subject_type, subject_id, body, occurred_at)
     values (${WS}, 'call', 'contact', $2, 'Talked about the 24-unit on Park', now() - interval '3 days')`,
    [E2E_REALTY, ann],
  );
});

test.afterAll(cleanup);

test("Prospects → Property managers: companies with their people, last talked, follow-up sort", async ({
  page,
}) => {
  await signIn(page);
  await goto(page, `/w/${E2E_REALTY}/prospects`);
  await page.getByRole("link", { name: "Property managers" }).click();
  await expect(page).toHaveURL(/tab=managers/);

  const rows = page.getByTestId("pm-row");
  const bay = rows.filter({ hasText: "E2E Bayview PM" });
  await expect(bay).toContainText("Ann PmTest");
  await expect(bay).toContainText("San Diego");
  await expect(bay.getByTestId("pm-last")).toContainText(/3 days ago|days ago/);
  const cy = rows.filter({ hasText: "Cy PmTest" });
  await expect(cy).toContainText("Independent");
  await expect(cy.getByTestId("pm-last")).toHaveText("Never");
  await expect(rows.filter({ hasText: "E2E Broker Co" })).toHaveCount(0);

  // Follow-up order: never-contacted before recently contacted.
  await page.getByTestId("pm-sort-stale").click();
  await expect(page).toHaveURL(/sort=stale/);
  const names = await rows.allTextContents();
  expect(names.findIndex((t) => t.includes("Cy PmTest"))).toBeLessThan(
    names.findIndex((t) => t.includes("E2E Bayview PM")),
  );
});
