import { createHmac } from "node:crypto";

import { expect, test, type APIRequestContext } from "@playwright/test";

import { E2E_REALTY, sql } from "./h4a-helpers";
import { expectToast, goto, hydrated, signIn } from "./helpers";
import { startTwilioSmsMock, type TwilioSmsMock } from "./twilio-sms-mock";

const WS = `(select id from public.workspaces where slug = $1)`;
const TWILIO_TOKEN = "e2e-twilio-auth-token"; // matches playwright.config.ts (test-only)

test.describe.configure({ mode: "serial" });

let mock: TwilioSmsMock;
let okId = "";
let dncId = "";
let inWindow = false;

/** POST a form like Twilio does, signed with X-Twilio-Signature. */
async function twilio(
  request: APIRequestContext,
  baseURL: string,
  path: string,
  params: Record<string, string>,
  sign = true,
) {
  const data =
    `${baseURL}${path}` +
    Object.keys(params)
      .sort()
      .map((k) => k + params[k])
      .join("");
  const signature = createHmac("sha1", TWILIO_TOKEN).update(data).digest("base64");
  return request.post(path, {
    form: params,
    headers: sign ? { "X-Twilio-Signature": signature } : {},
  });
}

test.beforeAll(async () => {
  mock = await startTwilioSmsMock();
  await sql(`delete from public.sms_messages where workspace_id = ${WS}`, [E2E_REALTY]);
  await sql(`delete from public.sms_settings where workspace_id = ${WS}`, [E2E_REALTY]);
  await sql(`delete from public.tasks where workspace_id = ${WS} and title like 'Reply to text%'`, [
    E2E_REALTY,
  ]);
  await sql(
    `delete from public.outreach_suppressions where workspace_id = ${WS} and channel = 'sms' and value in ('+16195550461', '+16195550462')`,
    [E2E_REALTY],
  );
  await sql(
    `delete from public.contacts where workspace_id = ${WS} and phone_keys && array['+16195550461', '+16195550462']`,
    [E2E_REALTY],
  );
  [{ id: okId }] = await sql<{ id: string }>(
    `insert into public.contacts (workspace_id, first_name, last_name, phones, sms_consent, sms_consent_at, sms_consent_source)
     values (${WS}, 'Tex', 'Consented', '[{"value": "(619) 555-0461", "type": "mobile", "is_primary": true}]',
             'express', now(), 'E2E: verbal consent noted by agent') returning id`,
    [E2E_REALTY],
  );
  [{ id: dncId }] = await sql<{ id: string }>(
    `insert into public.contacts (workspace_id, first_name, phones, sms_consent, sms_consent_at, sms_consent_source, dnc)
     values (${WS}, 'Dee', '[{"value": "(619) 555-0462", "type": "mobile"}]', 'express', now(), 'E2E', true) returning id`,
    [E2E_REALTY],
  );
  // Texting hours are real (8am–9pm): use a US zone where it's daytime now, if any.
  const [zone] = await sql<{ z: string | null }>(
    `select (select z from unnest(array['America/New_York','America/Chicago','America/Denver',
       'America/Los_Angeles','America/Anchorage','Pacific/Honolulu']) z
       where extract(hour from now() at time zone z) between 8 and 20 limit 1) as z`,
  );
  inWindow = Boolean(zone.z);
  await sql(
    `insert into public.outreach_settings (workspace_id, time_zone) values (${WS}, $2)
     on conflict (workspace_id) do update set time_zone = excluded.time_zone, sms_send_from = 8, sms_send_until = 21`,
    [E2E_REALTY, zone.z ?? "America/Los_Angeles"],
  );
});

test.afterAll(async () => {
  // Leave nothing behind that other specs (CSV import dedupe) could match.
  await sql(`delete from public.sms_messages where workspace_id = ${WS}`, [E2E_REALTY]);
  await sql(
    `delete from public.outreach_suppressions where workspace_id = ${WS} and channel = 'sms' and value in ('+16195550461', '+16195550462')`,
    [E2E_REALTY],
  );
  await sql(
    `delete from public.contacts where workspace_id = ${WS} and phone_keys && array['+16195550461', '+16195550462']`,
    [E2E_REALTY],
  );
  await sql(
    `update public.outreach_settings set time_zone = 'America/Los_Angeles' where workspace_id = ${WS}`,
    [E2E_REALTY],
  );
  await new Promise((r) => mock.server.close(r));
});

test("Phase 4D: texting is off until set up; every send passes the gates; replies, STOP and HELP", async ({
  page,
  baseURL,
}) => {
  await signIn(page);

  // Off: the contact page says why, and the composer is disabled.
  await goto(page, `/w/${E2E_REALTY}/people/${okId}`);
  const card = page.getByTestId("contact-texts");
  await expect(card.getByTestId("sms-off")).toContainText("No sending number set yet.");
  await expect(card.getByTestId("sms-send")).toBeDisabled();

  // Admin setup: number, on, receiving link.
  await goto(page, `/w/${E2E_REALTY}/settings/integrations`);
  await page.getByTestId("sms-setup-link").click();
  await page.waitForURL(/\/integrations\/sms$/);
  await expect(page.getByTestId("sms-status")).toHaveText("Off");
  const form = page.getByTestId("sms-settings");
  await form.getByTestId("sms-enabled").check();
  await form.getByTestId("sms-save").click();
  await expectToast(page, "Add the sending number before switching texting on");
  await form.getByLabel("Sending number").fill("(619) 555-0199");
  await form
    .getByLabel(/Reply to HELP/)
    .fill("Housing4All: reply STOP to opt out. Call (619) 843-1663.");
  await form.getByTestId("sms-save").click();
  await expectToast(page, "Texting settings saved");
  await expect(page.getByTestId("sms-status")).toHaveText("On");
  await page.getByTestId("sms-make-link").click();
  const inbound = (await page.getByTestId("sms-inbound-url").textContent())!.trim();
  const inboundPath = new URL(inbound).pathname;
  expect(inboundPath).toMatch(/^\/api\/sms\/inbound\/[0-9a-f]{48}$/);

  // A do-not-contact contact can never be texted.
  await goto(page, `/w/${E2E_REALTY}/people/${dncId}`);
  await expect(page.getByTestId("sms-gate")).toContainText("Marked do-not-contact");
  await expect(page.getByTestId("sms-send")).toBeDisabled();

  // The consented contact: sent during texting hours, refused outside them.
  await goto(page, `/w/${E2E_REALTY}/people/${okId}`);
  if (inWindow) {
    await card.getByLabel("Text message").fill("Hi Tex, it's Sam's office. Is now a good time?");
    await card.getByTestId("sms-send").click();
    await expectToast(page, "Text sent");
    expect(mock.sent).toHaveLength(1);
    expect(mock.sent[0]).toMatchObject({
      to: "+16195550461",
      from: "+16195550199",
      body: "Hi Tex, it's Sam's office. Is now a good time?",
    });
    expect(mock.sent[0].statusCallback).toMatch(/\/api\/sms\/status$/);
    await expect(card.locator('[data-direction="out"]')).toContainText("Sent");
    // Twilio reports delivery.
    const status = await twilio(page.request, baseURL!, "/api/sms/status", {
      MessageSid: mock.sent[0].sid,
      MessageStatus: "delivered",
    });
    expect(status.status()).toBe(204);
    await page.reload();
    await expect(card.locator('[data-direction="out"]')).toContainText("Delivered");
  } else {
    await expect(card.getByTestId("sms-gate")).toContainText("Outside texting hours");
    await expect(card.getByTestId("sms-send")).toBeDisabled();
    expect(mock.sent).toHaveLength(0);
  }

  // Unsigned webhooks are refused.
  const forged = await twilio(page.request, baseURL!, inboundPath, { From: "+16195550461" }, false);
  expect(forged.status()).toBe(401);

  // A reply lands on the contact with a task to answer.
  const reply = await twilio(page.request, baseURL!, inboundPath, {
    MessageSid: `SM${"a1".repeat(16)}`,
    From: "+16195550461",
    To: "+16195550199",
    Body: "Yes, call me after 3",
  });
  expect(reply.status()).toBe(200);
  expect(await reply.text()).toBe('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  await page.reload();
  await hydrated(page);
  await expect(card.locator('[data-direction="in"]')).toContainText("Yes, call me after 3");
  const [{ n: tasks }] = await sql<{ n: string }>(
    `select count(*) as n from public.tasks where related_id = $1 and title like 'Reply to text%'`,
    [okId],
  );
  expect(Number(tasks)).toBe(1);

  // HELP gets the help reply; STOP blocks texting right away.
  const help = await twilio(page.request, baseURL!, inboundPath, {
    MessageSid: `SM${"b2".repeat(16)}`,
    From: "+16195550461",
    To: "+16195550199",
    Body: "HELP",
  });
  expect(await help.text()).toContain("<Message>Housing4All: reply STOP to opt out.");
  await twilio(page.request, baseURL!, inboundPath, {
    MessageSid: `SM${"c3".repeat(16)}`,
    From: "+16195550461",
    To: "+16195550199",
    Body: "stop",
  });
  await page.reload();
  await expect(card.getByTestId("sms-gate")).toContainText("Texted STOP");
  await expect(card.getByTestId("sms-send")).toBeDisabled();

  // Works at phone width.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await hydrated(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  // Switch texting back off for the other tests.
  await sql(`update public.sms_settings set enabled = false where workspace_id = ${WS}`, [
    E2E_REALTY,
  ]);
});
