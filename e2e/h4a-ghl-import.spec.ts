import type { Server } from "node:http";

import { expect, test } from "@playwright/test";

import { GHL_LOCATION, GHL_TOKEN, startGhlMock } from "./ghl-mock";
import { sql } from "./h4a-helpers";
import { expectToast, goto, signIn } from "./helpers";

const AZH = "e2e-builders";
const WS = `(select id from public.workspaces where slug = $1)`;

test.describe.configure({ mode: "serial" });

let mock: Server;
test.beforeAll(async () => {
  mock = await startGhlMock();
});
test.afterAll(async () => {
  await new Promise((r) => mock.close(r));
});

async function reset() {
  await sql(`delete from public.deals where workspace_id = ${WS} and source like 'GoHighLevel%'`, [
    AZH,
  ]);
  await sql(`delete from public.ghl_links where workspace_id = ${WS}`, [AZH]);
  await sql(
    `delete from public.contacts where workspace_id = ${WS}
       and (ghl_contact_id is not null or 'ghl-e2e' = any(tags) or email_keys && array['existing.person@example.test'])`,
    [AZH],
  );
  await sql(`delete from public.outreach_suppressions where workspace_id = ${WS}`, [AZH]);
  await sql(
    `delete from public.imports where workspace_id = ${WS} and filename = 'GoHighLevel (API import)'`,
    [AZH],
  );
  await sql(
    `delete from public.integrations where workspace_id = ${WS} and provider = 'gohighlevel'`,
    [AZH],
  );
  await sql(`delete from vault.secrets where name = 'ghl_token:' || ${WS}::text`, [AZH]);
  // A contact that already exists here: the GHL import must merge into it, not duplicate it.
  await sql(
    `insert into public.contacts (workspace_id, first_name, last_name, emails, tags)
     values (${WS}, 'Existing', 'Person', '[{"value":"existing.person@example.test","is_primary":true}]', '{local}')`,
    [AZH],
  );
}

test("Phase 5A: connect GHL (token in Vault) → import 101 contacts (merge, DND) → opportunities → deals", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await reset();
  await signIn(page);

  await goto(page, `/w/${AZH}/settings/integrations`);
  await page.getByTestId("ghl-setup-link").click();
  await page.waitForURL(/\/integrations\/gohighlevel$/);
  await expect(page.getByTestId("ghl-status")).toHaveText("Not connected");

  // A wrong token is refused before anything is stored.
  await page.getByLabel("Private Integration token").fill("pit-wrong-token-000000");
  await page.getByLabel("Location ID").fill(GHL_LOCATION);
  await page.getByTestId("ghl-connect").click();
  await expect(page.getByTestId("ghl-connect-form").getByRole("alert")).toContainText(
    "rejected the token",
  );
  const [{ n: none }] = await sql<{ n: string }>(
    `select count(*) as n from vault.secrets where name = 'ghl_token:' || ${WS}::text`,
    [AZH],
  );
  expect(Number(none)).toBe(0);

  await page.getByLabel("Private Integration token").fill(GHL_TOKEN);
  await page.getByLabel("Label (optional)").fill("AZH GHL (mock)");
  await page.getByTestId("ghl-connect").click();
  await expectToast(page, "Connected · 101 contacts and 1 pipeline found");
  await expect(page.getByTestId("ghl-status")).toHaveText("Connected");
  // Stored encrypted in Vault, never in the integrations row.
  const [{ n: inConfig }] = await sql<{ n: string }>(
    `select count(*) as n from public.integrations
     where workspace_id = ${WS} and provider = 'gohighlevel' and config::text like '%' || $2 || '%'`,
    [AZH, GHL_TOKEN],
  );
  expect(Number(inConfig)).toBe(0);

  // Contacts: two pages through the CSV import engine ---------------------------
  await page.getByLabel("Tag every imported contact with").fill("ghl-e2e");
  await page.getByTestId("ghl-import-contacts").click();
  await expectToast(page, /Contacts imported · 100 new, 1 merged/);
  await expect(page.getByTestId("ghl-contacts-fetched")).toHaveText("101");

  const [merged] = await sql<{ n: string; tags: string[]; ghl: string; source: string }>(
    `select count(*) over () as n, tags, ghl_contact_id as ghl, source from public.contacts
     where workspace_id = ${WS} and email_keys && array['existing.person@example.test'] and deleted_at is null`,
    [AZH],
  );
  expect(Number(merged.n)).toBe(1);
  expect(merged.ghl).toBe("ghl_merge");
  expect(merged.tags).toEqual(expect.arrayContaining(["local", "vip", "ghl-e2e"]));

  const flags = await sql<{
    ghl: string;
    dnc: boolean;
    email_opt_out: boolean;
    sms_consent: string;
  }>(
    `select ghl_contact_id as ghl, dnc, email_opt_out, sms_consent::text from public.contacts
     where workspace_id = ${WS} and ghl_contact_id in ('ghl_dnd', 'ghl_emaildnd', 'ghl_smsdnd') order by 1`,
    [AZH],
  );
  expect(flags).toEqual([
    { ghl: "ghl_dnd", dnc: true, email_opt_out: false, sms_consent: "none" },
    { ghl: "ghl_emaildnd", dnc: false, email_opt_out: true, sms_consent: "none" },
    { ghl: "ghl_smsdnd", dnc: false, email_opt_out: false, sms_consent: "none" },
  ]);
  const [{ n: stopped }] = await sql<{ n: string }>(
    `select count(*) as n from public.outreach_suppressions
     where workspace_id = ${WS} and channel = 'sms' and value = '+16195550302'`,
    [AZH],
  );
  expect(Number(stopped)).toBe(1);

  // The import report is the same one CSV imports use.
  await page.getByRole("link", { name: "Open the import report" }).click();
  await page.waitForURL(/\/people\/import\/[0-9a-f-]+$/);
  await expect(page.getByText("GoHighLevel (API import)").first()).toBeVisible();

  // Opportunities: stage map → deals ---------------------------------------------
  await goto(page, `/w/${AZH}/settings/integrations/gohighlevel`);
  const map = page.getByTestId("ghl-stage-map");
  await expect(map.getByLabel("Estimate")).toHaveValue(
    (
      await sql<{ id: string }>(
        `select s.id from public.pipeline_stages s where s.workspace_id = ${WS} and s.name = 'Estimate'`,
        [AZH],
      )
    )[0].id,
  );
  await map.getByLabel("On Hold").selectOption({ label: "Don't import" });
  await page.getByTestId("ghl-import-opps").click();
  await expectToast(page, "2 deals created from GoHighLevel");
  await expect(page.getByTestId("ghl-opps-result")).toContainText("1 skipped");

  const deals = await sql<{ title: string; stage: string; value: string; contact: string | null }>(
    `select d.title, s.name as stage, d.value::text as value, c.ghl_contact_id as contact
     from public.deals d join public.pipeline_stages s on s.id = d.stage_id
     left join public.contacts c on c.id = d.primary_contact_id
     where d.workspace_id = ${WS} and d.source like 'GoHighLevel%' order by d.title`,
    [AZH],
  );
  expect(deals).toEqual([
    { title: "ADU build", stage: "Won", value: "180000.00", contact: "ghl_dnd" },
    { title: "Kitchen remodel", stage: "Estimate", value: "45000.00", contact: "ghl_merge" },
  ]);

  // Re-running is safe: nothing is duplicated.
  await page.getByTestId("ghl-import-opps").click();
  await expectToast(page, "0 deals created from GoHighLevel");
  await expect(page.getByTestId("ghl-opps-result")).toContainText("2 already imported");

  // Disconnect deletes the token.
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("ghl-disconnect").click();
  await expectToast(page, "GoHighLevel disconnected");
  const [{ n: after }] = await sql<{ n: string }>(
    `select count(*) as n from vault.secrets where name = 'ghl_token:' || ${WS}::text`,
    [AZH],
  );
  expect(Number(after)).toBe(0);
});

test("GHL import is owners/admins only (an agent sees no connect form)", async ({ page }) => {
  await signIn(page, "e2e-outsider@example.test");
  await goto(page, `/w/${AZH}/settings/integrations/gohighlevel`);
  await expect(page.getByText("Only owners and admins can connect GoHighLevel")).toBeVisible();
  await expect(page.getByTestId("ghl-connect-form")).toHaveCount(0);
});
