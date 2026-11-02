import { createHmac } from "node:crypto";

import { expect, test, type APIRequestContext } from "@playwright/test";

import { E2E_REALTY, sql } from "./h4a-helpers";
import { expectToast, goto, signIn } from "./helpers";

const WS = `(select id from public.workspaces where slug = $1)`;
const TWILIO_TOKEN = "e2e-twilio-auth-token"; // matches playwright.config.ts (test-only)
const EL_SECRET = "e2e-elevenlabs-secret";

test.describe.configure({ mode: "serial" });

/** POST a form like Twilio does, signed with X-Twilio-Signature. */
async function twilio(
  request: APIRequestContext,
  baseURL: string,
  path: string,
  params: Record<string, string>,
  sign = true,
) {
  const url = `${baseURL}${path}`;
  const data =
    url +
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

async function elevenLabs(request: APIRequestContext, path: string, payload: unknown) {
  const body = JSON.stringify(payload);
  const t = Math.floor(Date.now() / 1000).toString();
  const v0 = createHmac("sha256", EL_SECRET).update(`${t}.${body}`).digest("hex");
  return request.post(path, {
    data: body,
    headers: { "Content-Type": "application/json", "ElevenLabs-Signature": `t=${t},v0=${v0}` },
  });
}

let token = "";

test("Phase 7A setup: connection links, settings, routes, routing test", async ({ page }) => {
  for (const t of [
    "receptionist_calls",
    "receptionist_routes",
    "receptionist_settings",
    "receptionist_tokens",
  ])
    await sql(`delete from public.${t} where workspace_id = ${WS}`, [E2E_REALTY]);
  await sql(`delete from public.tasks where workspace_id = ${WS} and title like 'Call back%'`, [
    E2E_REALTY,
  ]);
  await sql(
    `delete from public.contacts where workspace_id = ${WS} and (phone_keys && array['+16195550142','+16195550177'])`,
    [E2E_REALTY],
  );
  await sql(
    `insert into public.contacts (workspace_id, first_name, last_name, phones)
     values (${WS}, 'Known', 'Caller', '[{"value":"(619) 555-0142","type":"mobile","is_primary":true}]')`,
    [E2E_REALTY],
  );

  await signIn(page);
  await goto(page, `/w/${E2E_REALTY}/receptionist?tab=setup`);
  await expect(page.getByRole("heading", { level: 1, name: "Receptionist" })).toBeVisible();
  await expect(page.getByTestId("receptionist-status")).toContainText("Phone number (Twilio)");

  await page.getByTestId("receptionist-create-token").click();
  const voiceUrl =
    (await page.getByTestId("receptionist-urls").locator("code").first().textContent()) ?? "";
  token = voiceUrl.match(/twilio\/([0-9a-f]+)\/voice$/)?.[1] ?? "";
  expect(token).toMatch(/^[0-9a-f]{48}$/);

  await page.getByTestId("receptionist-enabled").check();
  await page.getByTestId("receptionist-save").click();
  await expectToast(page, "Receptionist settings saved");

  // First route (the form is open when there are none): Sam, default, rung first.
  const first = page.getByTestId("new-route-form");
  await first.getByLabel("Route name").fill("Sam");
  await first.getByLabel("Ring this number").fill("(619) 555-0100");
  await first.getByTestId("route-save").click();
  await expectToast(page, "Route saved");

  await page.getByTestId("add-route").click();
  const pm = page.getByTestId("new-route-form");
  await pm.getByLabel("Route name").fill("Property management");
  await pm.getByLabel("Keywords (comma-separated)").fill("repair, tenant, leak, fuga");
  await pm.getByLabel("Follow-up task goes to").selectOption({ label: "Erin Tester" });
  await pm.getByTestId("route-save").click();
  await expectToast(page, "Route saved");

  // The first route stays the default, however quickly the second one is added.
  const routes = await sql<{ name: string; is_default: boolean }>(
    `select name, is_default from public.receptionist_routes where workspace_id = ${WS} order by position`,
    [E2E_REALTY],
  );
  expect(routes).toEqual([
    { name: "Sam", is_default: true },
    { name: "Property management", is_default: false },
  ]);

  await page.getByLabel("What the caller says").fill("Hola, soy inquilino y tengo una fuga");
  await expect(page.getByTestId("routing-result")).toContainText("Spanish");
  await expect(page.getByTestId("routing-result")).toContainText("Property management");
});

test("Phase 7A calls: ring → voicemail for a known caller; AI call from a new caller → contact, route, task", async ({
  page,
  request,
  baseURL,
}) => {
  const base = `/api/receptionist/twilio/${token}`;
  const call = { CallSid: "CA-E2E-1", From: "+16195550142", To: "+16195550000" };

  // Unsigned → refused.
  expect((await twilio(request, baseURL!, `${base}/voice`, call, false)).status()).toBe(401);

  const voice = await twilio(request, baseURL!, `${base}/voice`, call);
  expect(voice.status()).toBe(200);
  const voiceXml = await voice.text();
  expect(voiceXml).toContain('<Dial timeout="15"');
  expect(voiceXml).toContain("<Number>+16195550100</Number>");

  // Nobody picked up and the AI isn't connected → voicemail.
  const after = await twilio(request, baseURL!, `${base}/after-dial`, {
    ...call,
    DialCallStatus: "no-answer",
  });
  expect(await after.text()).toContain("<Record");
  const vm = await twilio(request, baseURL!, `${base}/voicemail`, {
    ...call,
    RecordingUrl: "https://api.twilio.com/2010-04-01/Accounts/AC1/Recordings/RE1",
    RecordingDuration: "21",
  });
  expect(await vm.text()).toContain("<Hangup/>");

  // An AI-answered call from someone new (ElevenLabs post-call webhook).
  const el = await elevenLabs(request, `/api/receptionist/elevenlabs/${token}`, {
    type: "post_call_transcription",
    data: {
      conversation_id: "conv_e2e",
      transcript: [
        {
          role: "agent",
          message: "Thanks for calling Housing4All, how can I help?",
          time_in_call_secs: 0,
        },
        {
          role: "user",
          message: "I'm a tenant and the kitchen sink has a leak",
          time_in_call_secs: 3,
        },
      ],
      metadata: {
        call_duration_secs: 64,
        main_language: "en",
        phone_call: {
          external_number: "+16195550177",
          agent_number: "+16195550000",
          call_sid: "CA-E2E-2",
        },
      },
      analysis: {
        transcript_summary: "Tenant reports a leaking kitchen sink and wants a repair.",
        data_collection_results: { caller_name: { value: "Riley Renter" } },
      },
    },
  });
  expect(el.status()).toBe(200);
  expect(await el.json()).toMatchObject({ ok: true, route: "Property management" });

  await signIn(page);
  await goto(page, `/w/${E2E_REALTY}/receptionist`);
  const calls = page.getByTestId("call");
  await expect(calls).toHaveCount(2);
  const voicemail = page.locator('[data-testid="call"][data-outcome="voicemail"]');
  await expect(voicemail).toContainText("Known Caller");
  await expect(voicemail).toContainText("Voicemail recording");
  const ai = page.locator('[data-testid="call"][data-outcome="answered_by_ai"]');
  await expect(ai).toContainText("Riley Renter");
  await expect(ai).toContainText("Property management");
  await expect(ai).toContainText("leaking kitchen sink");
  await ai.getByText("Transcript (2 lines)").click();
  await expect(ai).toContainText("the kitchen sink has a leak");

  // CRM: the new caller is a contact; the call is on their timeline; Erin has the follow-up task.
  const [row] = await sql<{ source: string; tags: string[]; tasks: string; activities: string }>(
    `select c.source, c.tags,
       (select count(*) from public.tasks t join public.profiles p on p.id = t.assigned_to
         where t.related_id = c.id and p.email = 'e2e-admin@example.test' and t.title like 'Call back Riley Renter%')::text as tasks,
       (select count(*) from public.activities a where a.subject_id = c.id and a.type = 'call')::text as activities
     from public.contacts c where c.workspace_id = ${WS} and '+16195550177' = any (c.phone_keys)`,
    [E2E_REALTY],
  );
  expect(row).toMatchObject({ source: "AI receptionist", tasks: "1", activities: "1" });
  expect(row.tags).toContain("receptionist");

  // The known caller's call is on their contact page.
  await voicemail.getByRole("link", { name: "Known Caller" }).click();
  await expect(page.getByText(/Phone call \(voicemail\)/)).toBeVisible();
});
