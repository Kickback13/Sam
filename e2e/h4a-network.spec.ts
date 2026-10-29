import { expect, test, type Page } from "@playwright/test";

import { E2E_REALTY, sql } from "./h4a-helpers";
import { expectToast, goto, hydrated, password, signIn } from "./helpers";

const WS = `(select id from public.workspaces where slug = $1)`;
const MEMBER_EMAIL = "e2e-member@example.test";
const BASE = `/n/${E2E_REALTY}`;

test.describe.configure({ mode: "serial" });

async function reset() {
  for (const t of ["network_posts", "network_events", "network_invites", "network_members"])
    await sql(`delete from public.${t} where workspace_id = ${WS}`, [E2E_REALTY]);
  await sql(`delete from public.newsletters where workspace_id = ${WS}`, [E2E_REALTY]);
  await sql(`delete from public.contacts where workspace_id = ${WS} and email_keys && array[$2]`, [
    E2E_REALTY,
    MEMBER_EMAIL,
  ]);
}

/** Sign in from a page that shows the login form (keeps the `next` link). */
async function passwordSignIn(page: Page, email: string) {
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel(/Password/).fill(password());
  await page.getByTestId("login-submit").click();
}

let inviteLink = "";

test("Phase 6A team side: invite, event and pinned post", async ({ page }) => {
  await reset();
  await signIn(page);
  await goto(page, `/w/${E2E_REALTY}/network`);
  await expect(page.getByRole("heading", { level: 1, name: "Network" })).toBeVisible();

  await page.getByLabel("Name (optional)").fill("Nina Member");
  await page.getByLabel("Email (optional)").fill(MEMBER_EMAIL);
  await page.getByTestId("network-invite-submit").click();
  await expect(page.getByTestId("invite-link")).toBeVisible();
  inviteLink = (await page.getByTestId("invite-link").locator("code").textContent()) ?? "";
  expect(inviteLink).toMatch(new RegExp(`/n/${E2E_REALTY}/join/[0-9a-f]+$`));
  await expect(page.getByTestId("pending-invites")).toContainText("Nina Member");

  await goto(page, `/w/${E2E_REALTY}/network?tab=events`);
  await page.getByLabel("Title").fill("E2E investor meetup");
  await page.getByLabel("Starts").fill("2030-01-15T18:00");
  await page.getByLabel("Where").fill("3683 University Ave");
  await page.getByTestId("network-event-submit").click();
  await expectToast(page, "Event created");

  await goto(page, `/w/${E2E_REALTY}/network?tab=posts`);
  await page.getByLabel("Title").fill("Welcome to the Network");
  await page.getByLabel("Message").fill("Introduce yourself below.");
  await page.getByText("Pin to the top").click();
  await page.getByTestId("post-submit").click();
  await expectToast(page, "Posted");
});

test("Phase 6A member side: join → contact created → feed, deal, comment, RSVP, profile, directory", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const path = new URL(inviteLink).pathname;

  // The invite page is public; signing in returns to it.
  await page.goto(path);
  await hydrated(page);
  await expect(page.getByRole("heading", { name: /Join the .* Network/ })).toBeVisible();
  await passwordSignIn(page, MEMBER_EMAIL);
  await page.waitForURL(new RegExp(`${path}$`));
  await hydrated(page);
  await expect(page.getByLabel("Your name, as members will see it")).toHaveValue("Nina Member");
  await page.getByTestId("join-submit").click();
  await page.waitForURL(new RegExp(`${BASE}$`));
  await hydrated(page);

  // Joining linked a new CRM contact, tagged and on the timeline.
  const [contact] = await sql<{ id: string; source: string; tags: string[] }>(
    `select c.id, c.source, c.tags from public.network_members m join public.contacts c on c.id = m.contact_id
     where m.workspace_id = ${WS} and c.email_keys && array[$2]`,
    [E2E_REALTY, MEMBER_EMAIL],
  );
  expect(contact.source).toBe("Housing4All Network");
  expect(contact.tags).toContain("network");

  // Feed: the pinned welcome post, posted by the team.
  const welcome = page.getByTestId("network-post").filter({ hasText: "Welcome to the Network" });
  await expect(welcome).toContainText("Pinned");
  await expect(welcome).toContainText("team");

  // Share a deal: numbers shown as the member's own claim.
  await page.getByRole("radio", { name: "Share a deal" }).click();
  await page.getByLabel("Title").fill("12 units in North Park");
  await page.getByLabel("Units").fill("12");
  await page.getByLabel("Price ($)").fill("3000000");
  await page.getByTestId("post-submit").click();
  await expectToast(page, "Posted");
  const deal = page.getByTestId("network-post").filter({ hasText: "12 units in North Park" });
  await expect(deal.getByTestId("deal-facts")).toContainText("$250,000/unit");
  await expect(deal.getByTestId("deal-facts")).toContainText("As posted by Nina Member");

  // Comment on the welcome post.
  await welcome.getByRole("link", { name: "Welcome to the Network" }).click();
  await page.getByLabel("Add a comment").fill("Hi, Nina here — 1031 buyer.");
  await page.getByTestId("comment-submit").click();
  await expect(page.getByTestId("comments")).toContainText("Nina Member");

  // RSVP.
  await goto(page, `${BASE}/events`);
  const event = page.getByTestId("event").filter({ hasText: "E2E investor meetup" });
  await event.getByTestId("rsvp-going").click();
  await expect(event.getByTestId("going-count")).toHaveText("1 going");

  // Profile → directory.
  await goto(page, `${BASE}/me`);
  await page.getByLabel("Headline").fill("1031 exchange buyer, 10–40 units");
  await page.getByLabel("Email to show (optional)").fill("nina.public@example.test");
  await page.getByTestId("profile-save").click();
  await expectToast(page, "Profile saved");
  await goto(page, `${BASE}/members`);
  const me = page.getByTestId("directory-member").filter({ hasText: "Nina Member" });
  await expect(me).toContainText("1031 exchange buyer");
  await expect(me).toContainText("nina.public@example.test");

  // A member never reaches the CRM: home sends them to the Network; workspace pages 404.
  await page.goto("/");
  await page.waitForURL(new RegExp(`${BASE}$`));
  const res = await page.goto(`/w/${E2E_REALTY}/people`);
  expect(res?.status()).toBe(404);
  await ctx.close();
});

test("Phase 6A team sees the member, moderates, and can email members only", async ({ page }) => {
  await signIn(page);
  await goto(page, `/w/${E2E_REALTY}/network`);
  const member = page.getByTestId("network-member").filter({ hasText: "Nina Member" });
  await expect(member).toBeVisible();
  await expect(member.getByRole("link", { name: "CRM contact" })).toBeVisible();

  // Hide the member's deal from members.
  await goto(page, `/w/${E2E_REALTY}/network?tab=posts`);
  const deal = page.getByTestId("network-post").filter({ hasText: "12 units in North Park" });
  await deal.getByTestId("post-options").click();
  await page.getByTestId("post-hide").click();
  await expectToast(page, "Hidden from members");
  await expect(deal).toContainText("Hidden from members");

  // Broadcast to Network members only (opt-out rules still apply).
  await sql(
    `insert into public.outreach_settings (workspace_id, sender_name, from_email, mailing_address)
     values (${WS}, 'E2E Realty', 'news@example.test', '100 Test St, San Diego, CA')
     on conflict (workspace_id) do update set sender_name = excluded.sender_name,
       from_email = excluded.from_email, mailing_address = excluded.mailing_address`,
    [E2E_REALTY],
  );
  await goto(page, `/w/${E2E_REALTY}/outreach`);
  await page.getByTestId("new-newsletter").click();
  await page.waitForURL(/\/outreach\/newsletters\/[0-9a-f-]+$/);
  await page.getByLabel(/Subject line/).fill("Network update");
  await page.getByLabel("Message").fill("Hello members");
  await page.getByTestId("audience-network").check();
  await page.getByTestId("save-newsletter").click();
  await expectToast(page, "Newsletter saved");
  await expect(page.getByTestId("ac-sendable")).toHaveText("1");
  await expect(page.getByTestId("audience-check")).toContainText("of 1 matching contacts");
});

test("Install files are public; the rest of the member app needs a login", async ({ request }) => {
  const manifest = await request.get(`${BASE}/manifest.webmanifest`);
  expect(manifest.status()).toBe(200);
  const body = await manifest.json();
  expect(body).toMatchObject({ start_url: BASE, scope: `${BASE}/`, display: "standalone" });
  const icon = await request.get(`${BASE}/icon/192`);
  expect(icon.headers()["content-type"]).toContain("image/png");
  const sw = await request.get("/network-sw.js");
  expect(sw.headers()["content-type"]).toContain("javascript");
  const feed = await request.get(BASE, { maxRedirects: 0 });
  expect(feed.status()).toBe(307);
  expect(feed.headers().location).toContain("/login");
});
