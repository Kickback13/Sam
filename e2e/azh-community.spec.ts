import { expect, test, type Page } from "@playwright/test";

import { E2E_AZH_SLUG, sql } from "./azh-helpers";
import { expectToast, goto, hydrated, password, signIn } from "./helpers";

const WS = `(select id from public.workspaces where slug = $1)`;
const MEMBER_EMAIL = "e2e-member@example.test";
const BASE = `/n/${E2E_AZH_SLUG}`;

test.describe.configure({ mode: "serial" });

async function reset() {
  for (const t of ["network_posts", "network_events", "network_invites", "network_members"])
    await sql(`delete from public.${t} where workspace_id = ${WS}`, [E2E_AZH_SLUG]);
  await sql(`delete from public.contacts where workspace_id = ${WS} and email_keys && array[$2]`, [
    E2E_AZH_SLUG,
    MEMBER_EMAIL,
  ]);
}

async function passwordSignIn(page: Page, email: string) {
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel(/Password/).fill(password());
  await page.getByTestId("login-submit").click();
}

let inviteLink = "";

test.afterAll(async () => {
  // The same e2e member is also used by the Housing4All Network spec: leave only that membership.
  await reset();
});

test("AZH Community team side: Community in the menu, invite a GC, post a project", async ({
  page,
}) => {
  await reset();
  await signIn(page);
  await goto(page, `/w/${E2E_AZH_SLUG}/today`);
  await page.getByRole("link", { name: "Community", exact: true }).first().click();
  await page.waitForURL(new RegExp(`/w/${E2E_AZH_SLUG}/community$`));
  await expect(page.getByRole("heading", { level: 1, name: "Community" })).toBeVisible();
  await expect(page.getByText(/homeowners, GCs, subcontractors and investors/)).toBeVisible();

  const invite = page.getByTestId("network-invite-form");
  await expect(invite.getByLabel("Member type")).toHaveValue("homeowner");
  await invite.getByLabel("Name (optional)").fill("Nina Member");
  await invite.getByLabel("Email (optional)").fill(MEMBER_EMAIL);
  await invite.getByLabel("Member type").selectOption({ label: "General contractor" });
  await page.getByTestId("network-invite-submit").click();
  inviteLink = (await page.getByTestId("invite-link").locator("code").textContent()) ?? "";
  expect(inviteLink).toMatch(new RegExp(`/n/${E2E_AZH_SLUG}/join/[0-9a-f]+$`));

  await goto(page, `/w/${E2E_AZH_SLUG}/community?tab=posts`);
  await page.getByRole("radio", { name: "Post a project" }).click();
  await expect(page.getByLabel("Units")).toHaveCount(0);
  await page.getByLabel("Title").fill("ADU framing in North Park");
  await page.getByLabel("Type of work").fill("ADU framing");
  await page.getByLabel("Budget ($)").fill("45000");
  await page.getByLabel("City").fill("San Diego");
  await page.getByTestId("post-submit").click();
  await expectToast(page, "Posted");
  await expect(
    page.getByTestId("network-post").filter({ hasText: "ADU framing in North Park" }),
  ).toContainText("Project");
});

test("AZH Community member side: join as a GC → contact with role gc → Projects tab", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const path = new URL(inviteLink).pathname;

  await page.goto(path);
  await hydrated(page);
  await expect(page.getByRole("heading", { name: /Join the .* Community/ })).toBeVisible();
  await passwordSignIn(page, MEMBER_EMAIL);
  await page.waitForURL(new RegExp(`${path}$`));
  await hydrated(page);
  await page.getByTestId("join-submit").click();
  await page.waitForURL(new RegExp(`${BASE}$`));
  await hydrated(page);

  await expect(page.getByRole("link", { name: /Community$/ }).first()).toBeVisible();
  const [contact] = await sql<{ source: string; roles: string[]; tags: string[] }>(
    `select c.source, c.roles, c.tags from public.network_members m join public.contacts c on c.id = m.contact_id
     where m.workspace_id = ${WS} and c.email_keys && array[$2]`,
    [E2E_AZH_SLUG, MEMBER_EMAIL],
  );
  expect(contact.source).toMatch(/Community$/);
  expect(contact.roles).toContain("gc");
  expect(contact.tags).toContain("network");

  // Projects tab (the "deals" engine, in AZH words).
  await page.getByRole("link", { name: "Projects" }).first().click();
  await page.waitForURL(new RegExp(`${BASE}/deals$`));
  await expect(page.getByRole("heading", { level: 1, name: "Projects" })).toBeVisible();
  const post = page.getByTestId("network-post").filter({ hasText: "ADU framing in North Park" });
  await expect(post).toContainText("Project");
  await expect(post.getByTestId("deal-facts")).toContainText("$45,000");

  // Install manifest uses the Community name.
  const manifest = await page.request.get(`${BASE}/manifest.webmanifest`);
  expect((await manifest.json()).name).toMatch(/Community$/);

  // Still no CRM access.
  const res = await page.goto(`/w/${E2E_AZH_SLUG}/people`);
  expect(res?.status()).toBe(404);

  // Phone width.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/deals`);
  await hydrated(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await ctx.close();
});
