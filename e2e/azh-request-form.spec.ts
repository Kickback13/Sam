import { expect, test } from "@playwright/test";

import { E2E_AZH_SLUG, resetAzhWorkspace, sql, TINY_PNG } from "./azh-helpers";
import { goto } from "./helpers";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await resetAzhWorkspace();
});

test("public form (no login): Spanish, photo, SMS consent → thank-you; DB gets request + contact + Lead + task", async ({
  page,
}) => {
  await goto(page, `/r/${E2E_AZH_SLUG}`);
  await expect(page.getByRole("heading", { name: "Request a free estimate" })).toBeVisible();
  await page.getByRole("link", { name: "Español" }).click();
  await expect(page.getByRole("heading", { name: "Solicite un presupuesto gratis" })).toBeVisible();
  await page.waitForSelector("html[data-hydrated]", { state: "attached" });

  // Validation errors are shown (server-side), in Spanish.
  await page.getByTestId("submit-request").click();
  await expect(page.getByRole("alert").first()).toContainText("Por favor corrija");
  await expect(page.getByText("Escriba su nombre")).toBeVisible();

  const consent = page.getByRole("checkbox", { name: /AZH Builders puede enviarme mensajes/ });
  await expect(consent).not.toBeChecked(); // unchecked by default (TCPA)

  await page.getByLabel(/Nombre completo/).fill("Sample Formsubmitter");
  await page.getByLabel(/Teléfono/).fill("(760) 555-0123");
  await page.getByLabel(/Correo electrónico/).fill("sample.formsubmitter@example.com");
  await page.getByLabel(/Dirección del trabajo/).fill("456 Example Rd");
  await page.getByLabel(/Código postal/).fill("92028");
  await page.getByLabel(/Tipo de trabajo/).selectOption("Drywall");
  await page.getByLabel(/Describa el trabajo/).fill("Reparar pared después de una fuga de agua.");
  await page
    .getByTestId("photo-input")
    .setInputFiles({ name: "pared.png", mimeType: "image/png", buffer: TINY_PNG });
  await expect(page.getByTestId("photo-previews").locator("img")).toHaveCount(1);
  await page.getByLabel(/Mejor hora/).selectOption("evening");
  await consent.check();
  await page.getByTestId("submit-request").click();

  await page.waitForURL(new RegExp(`/r/${E2E_AZH_SLUG}/thanks\\?lang=es$`));
  await expect(page.getByTestId("request-thanks")).toContainText("Gracias");

  const [row] = await sql<{
    office: string;
    status: string;
    language: string;
    photos: number;
    sms_consent: boolean;
    sms_consent_text: string;
    contact_consent: string;
    roles: string[];
    stage: string;
    tasks: string;
  }>(
    `select r.office, r.status, r.language, cardinality(r.photo_paths) as photos, r.sms_consent, r.sms_consent_text,
            c.sms_consent::text as contact_consent, c.roles, s.name as stage,
            (select count(*) from public.tasks t where t.related_id = r.deal_id and t.title like '%Fallbrook office%')::text as tasks
     from public.azh_requests r
     join public.contacts c on c.id = r.contact_id
     join public.deals d on d.id = r.deal_id
     join public.pipeline_stages s on s.id = d.stage_id
     where r.workspace_id = (select id from public.workspaces where slug = $1)`,
    [E2E_AZH_SLUG],
  );
  expect(row).toMatchObject({
    office: "fallbrook",
    status: "new",
    language: "es",
    photos: 1,
    sms_consent: true,
    contact_consent: "express",
    stage: "Lead",
    tasks: "1",
  });
  expect(row.sms_consent_text).toContain("Responda STOP");
  expect(row.roles).toContain("homeowner");
});

test("honeypot submissions are dropped silently", async ({ page }) => {
  await goto(page, `/r/${E2E_AZH_SLUG}`);
  await page.getByLabel(/Full name/).fill("Bot Example");
  await page.getByLabel(/^Phone/).fill("(619) 555-0144");
  await page.getByLabel(/Job address/).fill("1 Bot Way");
  await page.getByLabel(/ZIP code/).fill("92104");
  await page.getByLabel(/Type of work/).selectOption("Painting");
  await page.getByLabel(/Describe the work/).fill("spam");
  await page.locator("#website").fill("http://spam.example.com", { force: true });
  await page.getByTestId("submit-request").click();
  await page.waitForURL(/\/thanks\?lang=en$/);
  const rows = await sql(`select 1 from public.azh_requests where description = 'spam'`);
  expect(rows).toHaveLength(0);
});

test("embed can be framed; the rest of the app can't; real-estate slugs 404", async ({
  request,
}) => {
  const embed = await request.get(`/r/${E2E_AZH_SLUG}/embed`);
  expect(embed.status()).toBe(200);
  expect(embed.headers()["x-frame-options"]).toBeUndefined();
  expect(embed.headers()["content-security-policy"]).toContain("frame-ancestors *");

  const full = await request.get(`/r/${E2E_AZH_SLUG}`);
  expect(full.headers()["x-frame-options"]).toBe("DENY");
  const login = await request.get(`/login`);
  expect(login.headers()["x-frame-options"]).toBe("DENY");

  expect((await request.get(`/r/e2e-realty`)).status()).toBe(404);
  expect((await request.get(`/r/does-not-exist`)).status()).toBe(404);
});
