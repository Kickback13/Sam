import { expect, test, type Page } from "@playwright/test";

import { E2E_REALTY, sql } from "./h4a-helpers";
import { expectToast, goto, signIn } from "./helpers";

const AZH = "e2e-builders";
const BASE = `/w/${E2E_REALTY}`;
const WS = `(select id from public.workspaces where slug = $1)`;

test.describe.configure({ mode: "serial" });

/** Clean outreach state in both e2e workspaces + three tagged contacts in the realty one. */
async function seed(): Promise<{ olive: string }> {
  for (const slug of [E2E_REALTY, AZH]) {
    await sql(`delete from public.newsletters where workspace_id = ${WS}`, [slug]);
    await sql(`delete from public.outreach_suppressions where workspace_id = ${WS}`, [slug]);
    await sql(`delete from public.outreach_settings where workspace_id = ${WS}`, [slug]);
  }
  await sql(`delete from public.contacts where workspace_id = ${WS} and 'e2e-nl' = any(tags)`, [
    E2E_REALTY,
  ]);
  const [olive] = await sql<{ id: string }>(
    `insert into public.contacts (workspace_id, first_name, last_name, tags, emails, phones,
       sms_consent, sms_consent_at, sms_consent_source)
     values (${WS}, 'Olive', 'Outreach', '{e2e-nl}',
       '[{"value":"olive@example.test","is_primary":true}]',
       '[{"value":"(619) 555-0177","type":"mobile","is_primary":true}]',
       'written', now(), 'E2E fixture')
     returning id`,
    [E2E_REALTY],
  );
  await sql(
    `insert into public.contacts (workspace_id, first_name, last_name, tags, emails, dnc)
     values (${WS}, 'Dana', 'Donotcontact', '{e2e-nl}', '[{"value":"dana@example.test"}]', true)`,
    [E2E_REALTY],
  );
  await sql(
    `insert into public.contacts (workspace_id, first_name, last_name, tags, emails, email_opt_out, email_opt_out_at)
     values (${WS}, 'Uma', 'Unsubscribed', '{e2e-nl}', '[{"value":"uma@example.test"}]', true, now())`,
    [E2E_REALTY],
  );
  return { olive: olive.id };
}

const previewText = (page: Page) =>
  page.frameLocator('[data-testid="newsletter-preview"]').locator("body");

test("Phase 4A: settings → newsletter → audience check (gates) → Not connected → copy to AZH", async ({
  page,
}) => {
  await seed();
  await signIn(page);

  // Outreach is a real page; email is honestly "Not connected" ------------------
  await goto(page, `${BASE}/outreach`);
  await expect(page.getByRole("heading", { level: 1, name: "Outreach" })).toBeVisible();
  await expect(page.getByTestId("email-connection")).toHaveText("Email: Not connected");
  await expect(page.getByTestId("outreach-settings-missing")).toBeVisible();

  // CAN-SPAM sender details -------------------------------------------------------
  await goto(page, `${BASE}/settings/outreach`);
  await page.getByLabel("Sender name").fill("E2E Realty");
  await page.getByLabel("From address").fill("news@example.test");
  await page.getByLabel("Mailing address").fill("100 Test St, San Diego, CA 92104");
  await page.getByLabel("No texts after").selectOption("20");
  await page.getByTestId("save-outreach-settings").click();
  await expectToast(page, "Outreach settings saved");
  await expect(page.getByTestId("outreach-settings-meta")).toBeVisible();

  // New newsletter --------------------------------------------------------------------
  await goto(page, `${BASE}/outreach`);
  await expect(page.getByTestId("outreach-settings-missing")).toHaveCount(0);
  await page.getByTestId("new-newsletter").click();
  await page.waitForURL(/\/outreach\/newsletters\/[0-9a-f-]+$/);
  await page.getByLabel(/Subject line/).fill("E2E October update");
  await page
    .getByLabel("Message")
    .fill(
      "# Market update\n\nRents are **up**. [Read more](https://example.test/r)\n\n- One\n- Two",
    );
  await page.getByLabel("Tags").fill("e2e-nl");
  // Live preview with the CAN-SPAM footer.
  await expect(previewText(page)).toContainText("Market update");
  await expect(previewText(page)).toContainText("100 Test St, San Diego, CA 92104");
  await expect(previewText(page)).toContainText("Unsubscribe");
  await page.getByTestId("save-newsletter").click();
  await expectToast(page, "Newsletter saved");

  // Audience check: 1 of 3 passes; DNC + unsubscribed are listed with reasons --------
  const check = page.getByTestId("audience-check");
  await expect(page.getByTestId("ac-sendable")).toHaveText("1");
  await expect(check).toContainText("of 3 matching contacts");
  await expect(check.locator('[data-code="dnc"]')).toContainText("1");
  await expect(check.locator('[data-code="email_opt_out"]')).toContainText("1");
  await check.getByText("Who is blocked and why").click();
  await expect(check).toContainText("Dana Donotcontact");

  // Nothing can be sent: email isn't connected --------------------------------------
  await expect(page.getByTestId("send-newsletter")).toBeDisabled();
  await expect(page.getByTestId("send-disabled-reason")).toContainText("Email isn't connected");

  // Same content, separate list: copy to AZH ------------------------------------------
  await page.getByLabel("Copy to workspace").selectOption({ label: "E2E Builders (test)" });
  await page.getByTestId("copy-newsletter").click();
  await expectToast(page, /Copied to .* as a draft/);
  await goto(page, `/w/${AZH}/outreach`);
  await expect(
    page.getByTestId("newsletter-row").filter({ hasText: "E2E October update" }),
  ).toBeVisible();

  // Nothing was sent or logged anywhere.
  const [{ n }] = await sql<{ n: string }>(
    `select count(*) as n from public.newsletter_sends
     where workspace_id in (select id from public.workspaces where slug = any($1))`,
    [[E2E_REALTY, AZH]],
  );
  expect(Number(n)).toBe(0);
});

test("Phase 4A: contact page shows the gates; STOP blocks texts; do-not-send list", async ({
  page,
}) => {
  const [{ id: olive }] = await sql<{ id: string }>(
    `select id from public.contacts where workspace_id = ${WS} and first_name = 'Olive' and 'e2e-nl' = any(tags)`,
    [E2E_REALTY],
  );
  await signIn(page);
  await goto(page, `${BASE}/people/${olive}`);
  const reach = page.getByTestId("reachability");
  await expect(reach.getByTestId("gate-newsletter-email")).toHaveAttribute("data-allowed", "true");
  await expect(reach.getByTestId("gate-newsletter-email")).toContainText("olive@example.test");

  page.once("dialog", (d) => d.accept());
  await reach.getByTestId("record-stop").click();
  await expectToast(page, "added to the do-not-send list");
  await expect(reach.getByTestId("gate-marketing-text")).toHaveAttribute("data-allowed", "false");
  await expect(reach.getByTestId("gate-marketing-text")).toContainText("Texted STOP");
  await expect(reach.getByTestId("gate-informational-text")).toContainText("Texted STOP");

  await goto(page, `${BASE}/outreach/do-not-send`);
  await expect(page.locator('[data-value="+16195550177"]')).toContainText("Texted STOP");
  await page.getByLabel("Email").fill("Someone@Example.test");
  await page.getByTestId("add-suppression-submit").click();
  await expectToast(page, "Added to the do-not-send list");
  await expect(page.locator('[data-value="someone@example.test"]')).toBeVisible();
});

test("Phase 4A: one-click unsubscribe works without signing in", async ({ page, request }) => {
  const [send] = await sql<{ token: string; contact: string }>(
    `with nl as (
       insert into public.newsletters (workspace_id, subject, body)
       values (${WS}, 'E2E unsubscribe test', 'Hi') returning id, workspace_id)
     insert into public.newsletter_sends (workspace_id, newsletter_id, contact_id, email, status)
     select nl.workspace_id, nl.id, c.id, 'olive@example.test', 'queued'
     from nl, public.contacts c
     where c.workspace_id = nl.workspace_id and c.first_name = 'Olive' and 'e2e-nl' = any(c.tags)
     returning unsubscribe_token as token, contact_id as contact`,
    [E2E_REALTY],
  );

  // GET never unsubscribes (link scanners).
  await goto(page, `/unsubscribe/${send.token}`);
  await expect(page.getByRole("heading", { name: /Unsubscribe from/ })).toBeVisible();
  await expect(page.getByTestId("unsubscribe-card")).toContainText("o••••@example.test");
  let [c] = await sql<{ email_opt_out: boolean }>(
    `select email_opt_out from public.contacts where id = $1`,
    [send.contact],
  );
  expect(c.email_opt_out).toBe(false);

  await page.getByTestId("confirm-unsubscribe").click();
  await expect(page.getByTestId("unsubscribed")).toBeVisible();
  [c] = await sql<{ email_opt_out: boolean }>(
    `select email_opt_out from public.contacts where id = $1`,
    [send.contact],
  );
  expect(c.email_opt_out).toBe(true);

  // RFC 8058 one-click POST from a mail app: 200, idempotent. Unknown token: 404.
  const res = await request.post(`/api/unsubscribe/${send.token}`, {
    form: { "List-Unsubscribe": "One-Click" },
  });
  expect(res.status()).toBe(200);
  const bad = await request.post(`/api/unsubscribe/00000000-0000-4000-8000-000000000000`, {
    form: { "List-Unsubscribe": "One-Click" },
  });
  expect(bad.status()).toBe(404);
  const [{ n }] = await sql<{ n: string }>(
    `select count(*) as n from public.outreach_suppressions
     where workspace_id = ${WS} and channel = 'email' and value = 'olive@example.test'`,
    [E2E_REALTY],
  );
  expect(Number(n)).toBe(1);
});
