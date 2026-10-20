import { expect, test } from "@playwright/test";

import { E2E_AZH_SLUG, resetAzhWorkspace, seedRequest, sql } from "./azh-helpers";
import { goto, signIn } from "./helpers";

test.beforeAll(async () => {
  await resetAzhWorkspace();
  await seedRequest({
    name: "Sample Todaycard",
    phone: "(619) 555-0134",
    zip: "92104",
    service: "Carpentry",
  });
  const ws = `(select id from public.workspaces where slug = '${E2E_AZH_SLUG}')`;
  // One project in progress with a sent estimate and a visit tomorrow (still this week unless it's Sunday).
  await sql(`
    with p as (select id from public.pipelines where workspace_id = ${ws} and is_default),
         s as (select id from public.pipeline_stages where pipeline_id = (select id from p) and name = 'In Progress')
    insert into public.deals (workspace_id, pipeline_id, stage_id, title)
    values (${ws}, (select id from p), (select id from s), 'Sample ADU build')`);
  await sql(`
    insert into public.azh_estimates (workspace_id, deal_id, status)
    select workspace_id, id, 'sent' from public.deals where workspace_id = ${ws} and title = 'Sample ADU build'`);
  await sql(`
    insert into public.azh_visits (workspace_id, deal_id, starts_at, ends_at, office)
    select workspace_id, id, now() + interval '1 minute', now() + interval '61 minutes', 'san_diego'
    from public.deals where workspace_id = ${ws} and title = 'Sample ADU build'`);
});

test("construction Today shows the five AZH cards with real counts; real estate doesn't", async ({
  page,
}) => {
  await signIn(page);
  await goto(page, `/w/${E2E_AZH_SLUG}/today`);
  const cards = page.getByTestId("azh-today");
  await expect(cards).toBeVisible();
  await expect(page.getByTestId("today-requests-count")).toHaveText("1");
  await expect(page.getByTestId("today-requests")).toContainText("Sample Todaycard — Carpentry");
  await expect(page.getByTestId("today-estimates-count")).toHaveText("1");
  await expect(page.getByTestId("today-progress-count")).toHaveText("1");
  await expect(page.getByTestId("today-progress")).toContainText("Sample ADU build");
  await expect(page.getByTestId("today-visits-count")).toHaveText("1");
  // The request form created a task due tomorrow → not due yet.
  await expect(page.getByTestId("today-tasks-count")).toHaveText("0");

  await goto(page, "/w/e2e-realty/today");
  await expect(page.getByTestId("azh-today")).toHaveCount(0);
});
