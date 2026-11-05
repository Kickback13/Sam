import { expect, test } from "@playwright/test";

import { E2E_REALTY, sql } from "./h4a-helpers";
import { expectToast, goto, hydrated, signIn } from "./helpers";

const WS = `(select id from public.workspaces where slug = $1)`;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await sql(`delete from public.bookings where workspace_id = ${WS}`, [E2E_REALTY]);
  await sql(`delete from public.booking_settings where workspace_id = ${WS}`, [E2E_REALTY]);
  await sql(`delete from public.tasks where workspace_id = ${WS} and title like 'Booked call:%'`, [
    E2E_REALTY,
  ]);
  await sql(
    `delete from public.contacts where workspace_id = ${WS} and (email_keys && array['booker@example.test', 'racer@example.test', 'reserva@example.test'])`,
    [E2E_REALTY],
  );
});

test("Phase 4C: booking page — set up, a lead books signed out, staff see it, private feed", async ({
  page,
  browser,
}) => {
  await signIn(page);

  // Off until switched on: the public link is a 404.
  await goto(page, `/w/${E2E_REALTY}/calendar`);
  await expect(page.getByTestId("booking-off")).toBeVisible();
  const lead = await browser.newContext();
  const pub = await lead.newPage();
  const off = await pub.goto(`/b/${E2E_REALTY}`);
  expect(off?.status()).toBe(404);

  // Admin switches it on: every day bookable, no minimum notice, the admin hosts.
  const form = page.getByTestId("booking-settings");
  await form.getByTestId("booking-enabled").check();
  await form.getByLabel("Title").fill("Talk with Sam about your building");
  await form.getByLabel("Who leads book with").selectOption({ index: 1 });
  await form.getByLabel(/Minimum notice/).fill("0");
  await form.getByLabel(/How far ahead/).fill("14");
  for (const d of ["Sat", "Sun"]) await form.getByLabel(`${d} bookable`).check();
  for (const d of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
    await form.getByLabel(`${d} from`).fill("00:00");
    await form.getByLabel(`${d} until`).fill("23:30");
  }
  await form.getByTestId("booking-save").click();
  await expectToast(page, "Booking page saved");
  await expect(page.getByTestId("booking-off")).toHaveCount(0);

  // Private calendar feed (shown once).
  await page.getByTestId("make-feed").click();
  const feedUrl = (await page.getByTestId("feed-url").textContent())!.trim();
  expect(feedUrl).toMatch(/\/api\/calendar\/[0-9a-f]{48}\.ics$/);
  const emptyFeed = await lead.request.get(new URL(feedUrl).pathname);
  expect(await emptyFeed.text()).toContain("BEGIN:VCALENDAR");

  // The lead books, signed out.
  await goto(pub, `/b/${E2E_REALTY}`);
  await expect(
    pub.getByRole("heading", { name: "Talk with Sam about your building" }),
  ).toBeVisible();
  await pub.getByTestId("slot-day").first().click();
  const slot = pub.getByTestId("slot-time").first();
  const startsAt = (await slot.getAttribute("data-starts-at"))!;
  await slot.click();
  await expect(pub.getByTestId("chosen-slot")).toBeVisible();
  await pub.getByLabel("Your name").fill("Bea Booker");
  await pub.getByLabel("Email").fill("booker@example.test");
  await pub.getByLabel("Phone").fill("(619) 555-0177");
  await pub.getByLabel(/What would you like/).fill("Thinking about selling a 12-unit");
  await pub.getByTestId("confirm-booking").click();
  await pub.waitForURL(/\/b\/e2e-realty\/booked\?/);
  await expect(pub.getByTestId("booked")).toContainText("You're booked");
  const ics = await lead.request.get(
    (await pub.getByTestId("add-to-calendar").getAttribute("href"))!,
  );
  expect(ics.headers()["content-type"]).toContain("text/calendar");
  expect(await ics.text()).toContain("SUMMARY:Talk with Sam about your building");

  // The booked slot is gone for the next visitor.
  await goto(pub, `/b/${E2E_REALTY}`);
  await expect(pub.locator(`[data-starts-at="${startsAt}"]`)).toHaveCount(0);

  // Someone else grabs a slot while this visitor is filling in the form.
  const second = pub.getByTestId("slot-time").first();
  const secondAt = (await second.getAttribute("data-starts-at"))!;
  await second.click();
  await sql(
    `insert into public.bookings (workspace_id, kind, starts_at, ends_at, title, source)
     values (${WS}, 'block', $2::timestamptz, $2::timestamptz + interval '30 minutes', 'Taken', 'staff')`,
    [E2E_REALTY, secondAt],
  );
  await pub.getByLabel("Your name").fill("Rae Racer");
  await pub.getByLabel("Email").fill("racer@example.test");
  await pub.getByTestId("confirm-booking").click();
  await expect(pub.getByText("That time was just taken")).toBeVisible();
  await expect(pub.getByTestId("slot-times")).toBeVisible();

  // Staff side: the booking is on the calendar, the contact exists with a meeting and a task.
  await goto(page, `/w/${E2E_REALTY}/calendar`);
  const row = page.getByTestId("booking-row").filter({ hasText: "Bea Booker" });
  await expect(row).toContainText("Booked online");
  await expect(row).toContainText("Thinking about selling a 12-unit");
  const [c] = await sql<{ id: string; tasks: string; meetings: string }>(
    `select c.id,
       (select count(*) from public.tasks t where t.related_id = c.id and t.title like 'Booked call:%') as tasks,
       (select count(*) from public.activities a where a.subject_id = c.id and a.type = 'meeting') as meetings
     from public.contacts c where c.workspace_id = ${WS} and c.email_keys @> array['booker@example.test']`,
    [E2E_REALTY],
  );
  expect(Number(c.tasks)).toBe(1);
  expect(Number(c.meetings)).toBe(1);
  const feed = await lead.request.get(new URL(feedUrl).pathname);
  expect(await feed.text()).toContain("Bea Booker");

  // Block time from the staff page, then cancel the booking.
  await page.getByLabel("Why (only your team sees this)").fill("Property tour");
  await page.getByTestId("block-time").getByRole("button", { name: "Block time" }).click();
  await expectToast(page, "Time blocked");
  await expect(page.getByTestId("booking-row").filter({ hasText: "Property tour" })).toBeVisible();
  await row.getByTestId("cancel-booking").click();
  await expectToast(page, "Booking canceled");
  await expect(page.getByTestId("booking-row").filter({ hasText: "Bea Booker" })).toHaveCount(0);
  const [{ n: logged }] = await sql<{ n: string }>(
    `select count(*) as n from public.activities where subject_id = $1 and body = 'Booked call canceled'`,
    [c.id],
  );
  expect(Number(logged)).toBe(1);

  // Works at phone width (public page and staff calendar).
  for (const p of [pub, page]) {
    await p.setViewportSize({ width: 390, height: 844 });
    await p.reload();
    await hydrated(p);
    const overflow = await p.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  }
  await lead.close();
});

test("Spanish booking page: picked from the browser, switchable, the new contact is Spanish", async ({
  browser,
}) => {
  const es = await browser.newContext({ locale: "es-MX" });
  const pub = await es.newPage();
  await goto(pub, `/b/${E2E_REALTY}`);
  await expect(pub.getByTestId("booking-shell")).toHaveAttribute("data-lang", "es");
  await expect(pub.getByRole("heading", { name: "Elija un día" })).toBeVisible();
  await expect(pub.getByText(/minutos/)).toBeVisible();

  // The switch goes to English and back.
  await pub.getByTestId("booking-switch-lang").click();
  await pub.waitForURL(/\?lang=en$/);
  await expect(pub.getByRole("heading", { name: "Pick a day" })).toBeVisible();
  await pub.getByTestId("booking-switch-lang").click();
  await pub.waitForURL(/\?lang=es$/);
  await hydrated(pub);

  // A form error comes back in Spanish.
  await pub.getByTestId("slot-time").first().click();
  await pub.getByLabel("Su nombre").fill("Lupe Reserva");
  await pub.getByLabel("Teléfono").fill("123");
  await pub.getByTestId("confirm-booking").click();
  await expect(
    pub.getByText("Escriba un número de teléfono de EE. UU. válido").first(),
  ).toBeVisible();

  // Book in Spanish.
  await pub.getByLabel("Teléfono").fill("");
  await pub.getByLabel("Correo electrónico").fill("reserva@example.test");
  await pub.getByTestId("confirm-booking").click();
  await pub.waitForURL(/\/b\/e2e-realty\/booked\?.*lang=es/);
  await expect(pub.getByTestId("booked")).toContainText("Su cita está reservada");
  await expect(pub.getByTestId("booked-time")).toContainText(/de (noviembre|diciembre|enero)/);
  const ics = await es.request.get(
    (await pub.getByTestId("add-to-calendar").getAttribute("href"))!,
  );
  expect(await ics.text()).toContain("BEGIN:VCALENDAR");

  // The contact this booking created is marked Spanish (so follow-ups use Spanish versions).
  const [c] = await sql<{ language: string }>(
    `select language from public.contacts where workspace_id = ${WS} and email_keys @> array['reserva@example.test']`,
    [E2E_REALTY],
  );
  expect(c.language).toBe("es");

  // Phone width in Spanish (longer words).
  await pub.setViewportSize({ width: 390, height: 844 });
  await goto(pub, `/b/${E2E_REALTY}?lang=es`);
  const overflow = await pub.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await es.close();
});
