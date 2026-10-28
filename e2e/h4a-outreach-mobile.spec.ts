import { expect, test, type Page } from "@playwright/test";

import { E2E_REALTY, sql } from "./h4a-helpers";
import { goto, signIn } from "./helpers";

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test("Outreach works at 390px: list, editor, audience check, do-not-send, settings — no sideways scroll", async ({
  page,
}) => {
  const [nl] = await sql<{ id: string }>(
    `insert into public.newsletters (workspace_id, subject, body)
     values ((select id from public.workspaces where slug = $1), '390 mobile newsletter with a long subject line',
             '# Hello\n\nA [long link](https://example.test/a/very/long/path/that/should/wrap) here.')
     returning id`,
    [E2E_REALTY],
  );
  await signIn(page);
  for (const path of [
    `/w/${E2E_REALTY}/outreach`,
    `/w/${E2E_REALTY}/outreach/newsletters/${nl.id}`,
    `/w/${E2E_REALTY}/outreach/do-not-send`,
    `/w/${E2E_REALTY}/settings/outreach`,
  ]) {
    await goto(page, path);
    expect(await overflow(page), `horizontal overflow on ${path}`).toBeLessThanOrEqual(1);
  }
  await goto(page, `/w/${E2E_REALTY}/outreach/newsletters/${nl.id}`);
  await expect(page.getByTestId("audience-check")).toBeVisible();
  await expect(page.getByTestId("newsletter-preview")).toBeVisible();
});
