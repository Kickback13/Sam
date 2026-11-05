import { expect, test } from "@playwright/test";

import { E2E_AZH_SLUG } from "./azh-helpers";
import { E2E_REALTY, sql } from "./h4a-helpers";
import { goto, hydrated, signIn } from "./helpers";

const WS = `(select id from public.workspaces where slug = $1)`;
const PHONES = ["+16195550471", "+16195550472", "+16195550473"];

test.describe.configure({ mode: "serial" });

let needsId = "";
let answeredId = "";

async function cleanup() {
  await sql(
    `delete from public.sms_messages where contact_id in (select id from public.contacts where phone_keys && $1::text[])`,
    [PHONES],
  );
  await sql(`delete from public.contacts where phone_keys && $1::text[]`, [PHONES]);
}

test.beforeAll(async () => {
  await cleanup();
  const contact = async (slug: string, first: string, phone: string) =>
    (
      await sql<{ id: string }>(
        `insert into public.contacts (workspace_id, first_name, last_name, phones)
         values (${WS}, $2, 'Inbox', jsonb_build_array(jsonb_build_object('value', $3::text, 'type', 'mobile'))) returning id`,
        [slug, first, phone],
      )
    )[0].id;
  needsId = await contact(E2E_REALTY, "Nina", PHONES[0]);
  answeredId = await contact(E2E_REALTY, "Omar", PHONES[1]);
  const azhId = await contact(E2E_AZH_SLUG, "Paz", PHONES[2]);
  // Text history as the webhooks and sends would have written it (local DB only).
  const msg = (
    slug: string,
    contactId: string,
    direction: "in" | "out",
    status: string,
    body: string,
    minutesAgo: number,
  ) =>
    sql(
      `insert into public.sms_messages (workspace_id, contact_id, direction, status, to_number, from_number, body, created_at)
       values (${WS}, $2, $3, $4, '+16195550199', '+16195550199', $5, now() - make_interval(mins => $6))`,
      [slug, contactId, direction, status, body, minutesAgo],
    );
  await msg(E2E_REALTY, answeredId, "in", "received", "Is the 8-unit still available?", 60);
  await msg(E2E_REALTY, answeredId, "out", "delivered", "Yes, want to see it Friday?", 50);
  await msg(E2E_REALTY, needsId, "out", "delivered", "Hi Nina, following up on your fourplex", 40);
  await msg(E2E_REALTY, needsId, "in", "received", "Call me after 3", 10);
  await msg(E2E_REALTY, needsId, "in", "received", "Or tomorrow morning", 5);
  await msg(E2E_AZH_SLUG, azhId, "in", "received", "When can you start the drywall?", 3);
});

test.afterAll(cleanup);

test("Messages inbox: conversations newest first, needs-reply filter, thread with the gates", async ({
  page,
}) => {
  await signIn(page);
  await goto(page, `/w/${E2E_REALTY}/messages`);
  await expect(page.getByRole("heading", { level: 1, name: "Messages" })).toBeVisible();
  // Texting isn't switched on in this workspace: said plainly.
  await expect(page.getByTestId("inbox-off")).toBeVisible();

  const rows = page.getByTestId("inbox-row");
  const nina = rows.filter({ hasText: "Nina Inbox" });
  const omar = rows.filter({ hasText: "Omar Inbox" });
  await expect(nina).toContainText("Or tomorrow morning");
  await expect(nina).toContainText("2 new");
  await expect(omar).toContainText("You: Yes, want to see it Friday?");
  await expect(omar).toHaveAttribute("data-needs-reply", "false");
  // Newest first: Nina's conversation is above Omar's.
  const names = await rows.allTextContents();
  expect(names.findIndex((t) => t.includes("Nina"))).toBeLessThan(
    names.findIndex((t) => t.includes("Omar")),
  );

  // Needs reply filter.
  await page.getByTestId("inbox-filter-needs_reply").click();
  await expect(page).toHaveURL(/f=needs_reply/);
  await expect(rows.filter({ hasText: "Omar Inbox" })).toHaveCount(0);
  await expect(rows.filter({ hasText: "Nina Inbox" })).toBeVisible();

  // Open the conversation: thread plus the same gated composer as the contact page.
  await rows.filter({ hasText: "Nina Inbox" }).click();
  await expect(page).toHaveURL(new RegExp(`c=${needsId}`));
  const card = page.getByTestId("contact-texts");
  await expect(card.locator('[data-direction="in"]').last()).toContainText("Or tomorrow morning");
  await expect(card.getByTestId("sms-send")).toBeDisabled();
  await expect(page.getByTestId("inbox-contact-link")).toHaveAttribute(
    "href",
    `/w/${E2E_REALTY}/people/${needsId}`,
  );

  // Phone width: list or thread, never both, and no sideways scroll.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await hydrated(page);
  await expect(page.getByRole("link", { name: "All conversations" })).toBeVisible();
  await expect(page.getByTestId("inbox-list")).toBeHidden();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.setViewportSize({ width: 1280, height: 800 });

  // AZH Builders: Messages is a real page now (no "coming soon"), with its own conversations only.
  await goto(page, `/w/${E2E_AZH_SLUG}/messages`);
  await expect(page.getByTestId("inbox-row").filter({ hasText: "Paz Inbox" })).toContainText(
    "When can you start the drywall?",
  );
  await expect(page.getByTestId("inbox-row").filter({ hasText: "Nina Inbox" })).toHaveCount(0);
});
