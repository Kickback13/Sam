import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { LOOPNET_DIGEST } from "../src/features/h4a/email/fixtures/placeholder-emails";
import { E2E_REALTY, resetDealFinder, sql } from "./h4a-helpers";
import { expectToast, goto, signIn } from "./helpers";

const BASE = `/w/${E2E_REALTY}`;
const CSV = path.join(__dirname, "fixtures/placeholder-listings.csv");

test.describe.configure({ mode: "serial" });

async function saveBuyBox(page: Page, values: Record<string, string>) {
  await goto(page, `${BASE}/settings/buy-box`);
  for (const [id, value] of Object.entries(values)) await page.locator(`#bb-${id}`).fill(value);
  await page.getByTestId("save-buy-box").click();
  await expectToast(page, /Buy box saved · re-scored/);
}

async function openListing(page: Page, address: string) {
  await goto(page, `${BASE}/deal-finder?status=all`);
  await page.locator(`[data-testid=listing-card][data-address="${address}"] a`).first().click();
  await page.waitForURL(/\/deal-finder\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name: address })).toBeVisible();
}

/** A source chip ("<label> · <date>"); chips with a listing link render as links. */
const chip = (scope: Locator, label: string) => scope.locator(`[title^="${label} · "]`);

const breakdownScore = (page: Page) =>
  page.getByTestId("score-breakdown").getByTestId("score-badge");

test.beforeAll(async () => {
  await resetDealFinder();
});

test("Phase 2A: paste → listing with sources → score → verify → promote → buy box re-score", async ({
  page,
}) => {
  await signIn(page);

  // Today shows "Set your buy box" while it's empty -------------------------------
  await goto(page, `${BASE}/today`);
  await expect(page.getByTestId("today-set-buy-box")).toBeVisible();

  // 0) Buy box: ZIPs + units + max price per unit -----------------------------------
  await saveBuyBox(page, { zips: "92104, 92116", units_min: "10", max_price_per_unit: "250000" });
  await goto(page, `${BASE}/today`);
  await expect(page.getByTestId("today-set-buy-box")).toHaveCount(0);

  // 1) Paste a placeholder fixture email ------------------------------------------
  await goto(page, `${BASE}/deal-finder/paste`);
  await page.locator("#paste-from").fill(LOOPNET_DIGEST.from!);
  await page.locator("#paste-subject").fill(LOOPNET_DIGEST.subject!);
  await page.locator("#paste-body").fill(LOOPNET_DIGEST.text!);
  await page.getByTestId("run-parser").click();
  const result = page.getByTestId("paste-result");
  await expect(result).toContainText("Parsed by LoopNet saved-search alert (placeholder format)");
  await expect(result.getByTestId("paste-listings").locator("li")).toHaveCount(2);
  await expect(result).toContainText("Listing 1: added");

  // 2) It appears in Deal Finder with source chips -----------------------------------
  await goto(page, `${BASE}/deal-finder`);
  const card = page.locator('[data-testid=listing-card][data-address="3100 Sample Ave"]');
  await expect(card).toBeVisible();
  await expect(chip(card, "LoopNet alert (pasted)")).toBeVisible();
  await expect(
    page.locator('[data-testid=listing-card][data-address="4415 Example St"]'),
  ).toBeVisible();

  // 3) Scored, with the breakdown --------------------------------------------------
  await openListing(page, "3100 Sample Ave");
  await expect(
    chip(page.getByTestId("listing-facts").locator("[data-field=price]"), "LoopNet alert (pasted)"),
  ).toBeVisible();
  await expect(page.getByTestId("listing-facts").locator("[data-field=cap_rate]")).toContainText(
    "5.2%",
  );
  await expect(breakdownScore(page)).toHaveAttribute("data-score", "100");
  const breakdown = page.getByTestId("score-breakdown");
  await expect(breakdown.locator("[data-criterion=price_per_unit]")).toContainText(
    "Price/unit $206,250, at or under your $250,000 max.",
  );
  await expect(breakdown.locator("[data-criterion=location]")).toContainText(
    "ZIP 92104 is in your buy box.",
  );
  await expect(page.getByTestId("source-email")).toContainText("PLACEHOLDER SAMPLE");
  await expect(page.getByTestId("listing-alert")).toContainText("score 100");

  // 4) Mark it verified (note + source required) ------------------------------------
  await page.getByTestId("mark-verified").click();
  await page.getByTestId("confirm-verify").click();
  await expect(page.getByRole("dialog")).toContainText("Add what you checked");
  await page.locator("#verify-note").fill("Owner, units and year built match the assessor record");
  await page.getByTestId("confirm-verify").click();
  await expectToast(page, "Marked verified");
  await expect(
    page.getByTestId("verification-panel").getByTestId("verification-status"),
  ).toHaveText(/Verified/);
  await expect(page.getByTestId("verification-detail")).toContainText("Erin Tester");
  await expect(page.getByTestId("county-status")).toContainText("Not connected");

  // 5) Promote: deal in New Deal, property linked ----------------------------------
  await page.getByTestId("promote-listing").click();
  await expectToast(page, /Promoted: new deal in New Deal/);
  const promoted = page.getByTestId("promoted-links");
  await expect(promoted).toContainText("(New Deal)");
  await expect(page.getByTestId("listing-status")).toHaveText(/Promoted/);
  await promoted.getByRole("link", { name: /Property:/ }).click();
  await page.waitForURL(/\/properties\/[0-9a-f-]{36}$/);
  await expect(
    chip(page.getByTestId("property-facts"), "LoopNet alert (pasted)").first(),
  ).toBeVisible();
  await expect(page.getByTestId("activity-timeline")).toContainText("Promoted from Deal Finder");
  await goto(page, `${BASE}/pipeline`);
  await expect(
    page.locator(
      '[data-testid=stage-column][data-stage-name="New Deal"] [data-deal-title="3100 Sample Ave — 24 units"]',
    ),
  ).toBeVisible();

  // 6) Edit the buy box → the score changes ----------------------------------------
  await openListing(page, "4415 Example St");
  await expect(breakdownScore(page)).toHaveAttribute("data-score", "100");
  await saveBuyBox(page, { max_price_per_unit: "200000" });
  await openListing(page, "4415 Example St");
  await expect(breakdownScore(page)).toHaveAttribute("data-score", "69");
  await expect(
    page.getByTestId("score-breakdown").locator("[data-criterion=price_per_unit]"),
  ).toContainText("Price/unit $220,000, over your $200,000 max.");

  // Alerts: both arrived at 100 (alert on arrival; a buy box change doesn't re-alert)
  await goto(page, `${BASE}/alerts`);
  await expect(page.getByTestId("alert-row")).toHaveCount(2);
  await expect(page.getByTestId("alert-channels")).toContainText(
    "Email to the owner: Not connected",
  );
  await page.getByTestId("mark-all-read").click();
  await expectToast(page, "Marked 2 read");
});

test("manual entry dedupes into the existing listing; dismiss needs a reason", async ({ page }) => {
  await signIn(page);
  const [{ id }] = await sql<{ id: string }>(
    `select l.id from public.h4a_listings l join public.workspaces w on w.id = l.workspace_id
     where w.slug = $1 and l.address = '4415 Example St'`,
    [E2E_REALTY],
  );
  await goto(page, `${BASE}/deal-finder/new`);
  await page.locator("#listing-address").fill("4415 Example Street");
  await page.locator("#listing-zip").fill("92116");
  await page.locator("#listing-price").fill("2,500,000");
  await page.getByTestId("save-listing").click();
  await expectToast(page, "Already in Deal Finder — updated the existing listing");
  await page.waitForURL(new RegExp(`/deal-finder/${id}$`));
  const price = page.getByTestId("listing-facts").locator("[data-field=price]");
  await expect(price).toContainText("$2,500,000");
  await expect(chip(price, "Entered by Erin Tester")).toBeVisible();
  // Units still come from the email.
  await expect(
    chip(page.getByTestId("listing-facts").locator("[data-field=units]"), "LoopNet alert (pasted)"),
  ).toBeVisible();
  await expect(page.getByTestId("listing-history")).toContainText(
    "Updated from Entered by Erin Tester",
  );

  await page.getByTestId("dismiss-listing").click();
  await page.getByTestId("confirm-dismiss").click();
  await expectToast(page, "Listing dismissed");
  await expect(page.getByTestId("listing-status")).toHaveText(/Dismissed/);
});

test("CSV upload: preview + dedupe → import → error report", async ({ page }) => {
  await signIn(page);
  await goto(page, `${BASE}/deal-finder/import`);
  await page.getByTestId("listing-csv-input").setInputFiles(CSV);
  await page.getByTestId("listing-to-preview").click();
  const summary = page.getByTestId("listing-import-summary");
  await expect(summary).toContainText("New listings1");
  await expect(summary).toContainText("Update existing1");
  await expect(summary).toContainText("Invalid rows1");
  await page.getByTestId("listing-run-import").click();
  await expect(page.getByTestId("listing-import-result")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("listing-created-count")).toHaveText("1");
  await expect(page.getByTestId("listing-error-count")).toHaveText("1");
  const download = page.waitForEvent("download");
  await page.getByTestId("listing-download-errors").click();
  expect((await download).suggestedFilename()).toBe("placeholder-listings-errors.csv");

  await goto(page, `${BASE}/deal-finder`);
  const card = page.locator('[data-testid=listing-card][data-address="560 Placeholder Ln"]');
  await expect(chip(card, "CSV: placeholder-listings.csv")).toBeVisible();
  const [{ n }] = await sql<{ n: string }>(
    `select count(*) as n from public.h4a_listings l join public.workspaces w on w.id = l.workspace_id
     where w.slug = $1 and l.street_key = '3100 sample ave'`,
    [E2E_REALTY],
  );
  expect(Number(n)).toBe(1);
});

test("Deal Finder is real-estate only, and the webhook refuses unsigned posts", async ({
  page,
  request,
}) => {
  await signIn(page);
  const res = await page.goto("/w/e2e-builders/deal-finder");
  expect(res?.status()).toBe(404);
  const hook = await request.post("/api/inbound/email", { data: { type: "email.received" } });
  expect(hook.status()).toBe(503);
});
