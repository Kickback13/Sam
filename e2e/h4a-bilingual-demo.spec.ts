import { expect, test } from "@playwright/test";

import { sql } from "./h4a-helpers";
import { ADMIN_EMAIL, goto, signIn } from "./helpers";

// The Demo workspace (seeded by migrations) is not one of the e2e workspaces, so the
// test user joins it as a viewer for this test only.
const MEMBER = `(select id from public.workspaces where slug = 'demo' and is_demo)`;
const USER = `(select id from auth.users where email = $1)`;

test.beforeAll(async () => {
  await sql(
    `insert into public.workspace_members (workspace_id, user_id, role)
     select ${MEMBER}, ${USER}, 'viewer' on conflict do nothing`,
    [ADMIN_EMAIL],
  );
});
test.afterAll(async () => {
  await sql(
    `delete from public.workspace_members where workspace_id = ${MEMBER} and user_id = ${USER}`,
    [ADMIN_EMAIL],
  );
});

test("Demo workspace: bilingual sequences show the Spanish step for a Spanish speaker", async ({
  page,
}) => {
  const [es] = await sql<{ id: string; first_name: string }>(
    `select c.id, c.first_name from public.outreach_enrollments e
       join public.contacts c on c.id = e.contact_id
       join public.outreach_sequences s on s.id = e.sequence_id
      where s.workspace_id = ${MEMBER} and s.name = 'Demo: new owner lead (bilingual)' and c.language = 'es'`,
  );
  await signIn(page);
  await goto(page, `/w/demo/people/${es.id}`);
  const due = page
    .getByTestId("contact-sequences")
    .getByTestId("due-item")
    .filter({ hasText: "Demo: new owner lead (bilingual)" });
  await expect(due.getByTestId("due-language")).toContainText("Español");
  await expect(due.getByLabel("Subject")).toHaveValue("Su edificio");
  await expect(due.getByLabel("Message")).toHaveValue(new RegExp(`^Hola ${es.first_name}:`));

  // The demo newsletter has a Spanish version too.
  await goto(page, `/w/demo/outreach`);
  await page.getByRole("link", { name: "Demo: San Diego multifamily update" }).click();
  await page.getByTestId("preview-lang-es").click();
  await expect(
    page.frameLocator('[data-testid="newsletter-preview"]').locator("body"),
  ).toContainText("Novedades del mercado multifamiliar");
});
