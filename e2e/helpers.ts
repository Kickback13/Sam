import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, type Page } from "@playwright/test";

export const ADMIN_EMAIL = "e2e-admin@example.test";

export function password(): string {
  return JSON.parse(readFileSync(path.join(__dirname, ".auth/credentials.json"), "utf8")).password;
}

/** Wait until React has hydrated (forms are inert before that). */
export async function hydrated(page: Page) {
  await page.waitForSelector("html[data-hydrated]", { state: "attached" });
}

export async function goto(page: Page, url: string) {
  await page.goto(url);
  await hydrated(page);
}

export async function signIn(page: Page, email = ADMIN_EMAIL) {
  await goto(page, "/login");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel(/Password/).fill(password());
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/w\/[a-z0-9-]+\/today/);
  await hydrated(page);
}

export async function brandAccent(page: Page): Promise<string> {
  return (
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--brand-accent"),
    )
  )
    .trim()
    .toUpperCase();
}

export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible();
}
