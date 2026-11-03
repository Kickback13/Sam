import type { Server } from "node:http";

import { expect, test } from "@playwright/test";

import { createGhlMockState, GHL_LOCATION, GHL_TOKEN, startGhlMock } from "./ghl-mock";
import { sql } from "./h4a-helpers";
import { expectToast, goto, signIn } from "./helpers";

const AZH = "e2e-builders";
const WS = `(select id from public.workspaces where slug = $1)`;
const PAGE = `/w/${AZH}/settings/integrations/gohighlevel`;

test.describe.configure({ mode: "serial" });

const state = createGhlMockState();
let mock: Server;
test.beforeAll(async () => {
  mock = await startGhlMock(state);
});
test.afterAll(async () => {
  await new Promise((r) => mock.close(r));
});

async function reset() {
  await sql(`delete from public.deals where workspace_id = ${WS} and source like 'GoHighLevel%'`, [
    AZH,
  ]);
  for (const t of ["ghl_links", "ghl_sync_state", "ghl_sync_settings", "outreach_suppressions"])
    await sql(`delete from public.${t} where workspace_id = ${WS}`, [AZH]);
  await sql(
    `delete from public.contacts where workspace_id = ${WS}
       and (ghl_contact_id is not null or email_keys && array['existing.person@example.test'])`,
    [AZH],
  );
  await sql(
    `delete from public.imports where workspace_id = ${WS} and filename like 'GoHighLevel%'`,
    [AZH],
  );
  await sql(
    `delete from public.integrations where workspace_id = ${WS} and provider = 'gohighlevel'`,
    [AZH],
  );
  await sql(`delete from vault.secrets where name = 'ghl_token:' || ${WS}::text`, [AZH]);
  await sql(
    `insert into public.contacts (workspace_id, first_name, last_name, emails, tags)
     values (${WS}, 'Existing', 'Person', '[{"value":"existing.person@example.test","is_primary":true}]', '{local}')`,
    [AZH],
  );
}

const dealStage = async (title: string) =>
  (
    await sql<{ stage: string }>(
      `select s.name as stage from public.deals d join public.pipeline_stages s on s.id = d.stage_id
       where d.workspace_id = ${WS} and d.title = $2 and d.deleted_at is null`,
      [AZH, title],
    )
  )[0]?.stage;

test("Phase 5B: automatic import — first run, no-change run, GHL changes win only where GHL changed", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await reset();
  await signIn(page);
  await goto(page, PAGE);
  await page.getByLabel("Private Integration token").fill(GHL_TOKEN);
  await page.getByLabel("Location ID").fill(GHL_LOCATION);
  await page.getByTestId("ghl-connect").click();
  await expect(page.getByTestId("ghl-status")).toHaveText("Connected");

  const card = page.getByTestId("ghl-auto-import");
  await expect(card.getByTestId("ghl-auto-status")).toHaveText("Off");
  await expect(card.getByTestId("ghl-auto-last")).toHaveText("Not run yet.");
  await card.getByTestId("ghl-auto-enabled").check();
  await expectToast(page, "Automatic import is on");
  await expect(card.getByTestId("ghl-auto-status")).toHaveText("On");

  // First run: everything is new (stages match by name, else the first open stage).
  await card.getByTestId("ghl-auto-run").click();
  await expectToast(page, "Import finished: 100 new / 1 updated contacts · 3 new deals");
  await expect(card.getByTestId("ghl-auto-last")).toContainText("100 new / 1 updated contacts");
  expect(await dealStage("Kitchen remodel")).toBe("Estimate");
  expect(await dealStage("ADU build")).toBe("Won");
  expect(await dealStage("Paused job")).toBe("Lead");

  // Nothing changed in GHL → nothing is written.
  await card.getByTestId("ghl-auto-run").click();
  await expectToast(page, "Import finished: No changes in GoHighLevel");

  // Someone moves a deal here; meanwhile GHL gets a new lead and moves a different opportunity.
  await sql(
    `update public.deals set stage_id = (select id from public.pipeline_stages
       where workspace_id = ${WS} and name = 'Bid Sent')
     where workspace_id = ${WS} and title = 'Paused job'`,
    [AZH],
  );
  state.contacts.push({
    id: "ghl_new_lead",
    firstName: "Nora",
    lastName: "Newlead",
    email: "nora.newlead@example.test",
    tags: ["website"],
  });
  state.opportunities[0] = { ...state.opportunities[0], pipelineStageId: "gs_new" }; // Kitchen remodel → New Lead

  await card.getByTestId("ghl-auto-run").click();
  await expectToast(page, "Import finished: 1 new / 0 updated contacts · 1 deal moved");
  expect(await dealStage("Kitchen remodel")).toBe("Lead"); // GHL moved it
  expect(await dealStage("Paused job")).toBe("Bid Sent"); // local move kept: unchanged in GHL
  const [lead] = await sql<{ source: string; tags: string[] }>(
    `select source, tags from public.contacts where workspace_id = ${WS} and ghl_contact_id = 'ghl_new_lead'`,
    [AZH],
  );
  expect(lead.tags).toContain("website");

  // Each run that changed contacts has its import report; no-change runs leave none.
  const [{ n: reports }] = await sql<{ n: string }>(
    `select count(*) as n from public.imports where workspace_id = ${WS} and filename = 'GoHighLevel (automatic import)'`,
    [AZH],
  );
  expect(Number(reports)).toBe(2);

  // Works at phone width.
  await page.setViewportSize({ width: 390, height: 844 });
  await goto(page, PAGE);
  await expect(card).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("Phase 5B: a due import runs in the background when an admin opens the app", async ({
  page,
}) => {
  test.setTimeout(90_000);
  // Make a run due (last one "2 hours ago", hourly) and add a lead in GHL.
  await sql(
    `update public.ghl_sync_settings set interval_minutes = 60, last_started_at = now() - interval '2 hours'
     where workspace_id = ${WS}`,
    [AZH],
  );
  state.contacts.push({ id: "ghl_bg_lead", firstName: "Bea", lastName: "Background" });

  await signIn(page);
  await goto(page, `/w/${AZH}/today`); // any page: the app shell asks if a run is due
  await expect
    .poll(
      async () =>
        Number(
          (
            await sql<{ n: string }>(
              `select count(*) as n from public.contacts where workspace_id = ${WS} and ghl_contact_id = 'ghl_bg_lead'`,
              [AZH],
            )
          )[0].n,
        ),
      { timeout: 45_000 },
    )
    .toBe(1);
  await expect
    .poll(
      async () =>
        (
          await sql<{ s: string }>(
            `select last_status || ':' || (lock_until is null)::text as s from public.ghl_sync_settings where workspace_id = ${WS}`,
            [AZH],
          )
        )[0].s,
      { timeout: 30_000 },
    )
    .toBe("ok:true");

  // Turning it off stops background runs.
  await goto(page, PAGE);
  await page.getByTestId("ghl-auto-enabled").uncheck();
  await expectToast(page, "Automatic import is off");
});
