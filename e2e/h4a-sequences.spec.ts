import { expect, test } from "@playwright/test";

import { E2E_REALTY, sql } from "./h4a-helpers";
import { expectToast, goto, hydrated, signIn } from "./helpers";

const WS = `(select id from public.workspaces where slug = $1)`;
let contactId = "";
let dncId = "";

async function cleanup() {
  await sql(
    `delete from public.outreach_sequences where workspace_id = ${WS} and name like 'E2E seq%'`,
    [E2E_REALTY],
  );
  await sql(`delete from public.contacts where workspace_id = ${WS} and last_name = 'SeqTest'`, [
    E2E_REALTY,
  ]);
}

test.beforeAll(async () => {
  await cleanup();
  [{ id: contactId }] = await sql<{ id: string }>(
    `insert into public.contacts (workspace_id, first_name, last_name, emails)
     values (${WS}, 'Sequa', 'SeqTest', '[{"value": "sequa@example.test", "is_primary": true}]') returning id`,
    [E2E_REALTY],
  );
  [{ id: dncId }] = await sql<{ id: string }>(
    `insert into public.contacts (workspace_id, first_name, last_name, dnc) values (${WS}, 'Dee', 'SeqTest', true) returning id`,
    [E2E_REALTY],
  );
});

test.afterAll(cleanup);

test("Phase 4E: build a sequence, enroll a contact, steps come due for a person to send", async ({
  page,
}) => {
  await signIn(page);
  await goto(page, `/w/${E2E_REALTY}/outreach/sequences`);
  await page.getByTestId("new-sequence").click();
  await page.waitForURL(/\/sequences\/new$/);
  await hydrated(page);

  const editor = page.getByTestId("sequence-editor");
  await editor.getByLabel("Name").fill("E2E seq: new owner lead");
  await editor.getByTestId("seq-add-step").click();
  await editor.getByTestId("seq-add-step").click();
  const [first, second] = [
    editor.getByTestId("seq-step").nth(0),
    editor.getByTestId("seq-step").nth(1),
  ];
  await first.getByLabel("Subject").fill("Your building on {company}");
  await first
    .getByLabel("Message")
    .fill("Hi {first_name}, it's {my_name}. Would you consider an offer?");
  await expect(second.getByLabel("Channel")).toHaveValue("sms");
  await second.getByLabel("Days after previous").fill("2");
  await second.getByLabel("Message").fill("Hi {first_name}, just following up on my email.");
  await editor.getByTestId("seq-active").check();
  await editor.getByTestId("seq-save").click();
  await expectToast(page, "Sequence saved");
  await page.waitForURL(/\/sequences\/[0-9a-f-]{36}$/);

  // Do-not-contact people can't be added.
  await goto(page, `/w/${E2E_REALTY}/people/${dncId}`);
  await expect(page.getByTestId("contact-sequences")).toContainText("Do-not-contact");

  // Enroll: the first step (0 days) is due right away, filled in for this contact.
  await goto(page, `/w/${E2E_REALTY}/people/${contactId}`);
  const card = page.getByTestId("contact-sequences");
  await card.getByTestId("enroll-submit").click();
  await expectToast(page, "Added to sequence");
  const due = card.getByTestId("due-item");
  await expect(due).toHaveAttribute("data-channel", "email");
  await expect(due.getByLabel("Message")).toHaveValue(
    /^Hi Sequa, it's .+\. Would you consider an offer\?$/,
  );
  await expect(due).toContainText("No company on file");
  await expect(due.getByTestId("due-open-email")).toHaveAttribute(
    "href",
    /^mailto:sequa%40example\.test\?/,
  );
  await due.getByTestId("due-mark-emailed").click();
  await expectToast(page, "Marked as emailed");
  await expect(card).toContainText(/step 2 due in 2 days/);
  await expect(page.locator("[data-activity-type=email]").first()).toContainText("Email sent:");

  // Make the text step due: texting is off, so it can't be sent; skip finishes the sequence.
  await sql(
    `update public.outreach_enrollments set next_due_at = now() - interval '1 minute' where contact_id = $1`,
    [contactId],
  );
  await goto(page, `/w/${E2E_REALTY}/outreach/sequences`);
  const textStep = page.getByTestId("due-item").filter({ hasText: "Sequa SeqTest" });
  await expect(textStep).toHaveAttribute("data-channel", "sms");
  await expect(textStep.getByTestId("due-send-text")).toBeDisabled();
  await expect(textStep).toContainText("Texts:");
  await textStep.getByTestId("due-skip").click();
  await expectToast(page, "Step skipped · sequence finished");
  const [{ status }] = await sql<{ status: string }>(
    `select status from public.outreach_enrollments where contact_id = $1`,
    [contactId],
  );
  expect(status).toBe("finished");

  // Phone width.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await hydrated(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
