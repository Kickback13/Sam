// Lighthouse (mobile) for authenticated pages.
// Usage: BASE_URL=http://127.0.0.1:3100 LH_EMAIL=... LH_PASSWORD=... node scripts/lighthouse.mjs /w/<slug>/today /w/<slug>/people
// CHROME_PATH can point at a preinstalled Chromium. Reports land in lighthouse-reports/ (gitignored).
import { mkdirSync, writeFileSync } from "node:fs";

import { chromium } from "@playwright/test";
import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const paths = process.argv.slice(2);
if (!paths.length) throw new Error("Pass one or more paths, e.g. /w/demo/today");

// 1) Sign in once to get the session cookies.
const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
);
const page = await browser.newPage();
await page.goto(`${BASE}/login`);
await page.waitForSelector("html[data-hydrated]", { state: "attached" });
await page.getByLabel("Work email").fill(process.env.LH_EMAIL);
await page.getByLabel(/Password/).fill(process.env.LH_PASSWORD);
await page.getByTestId("login-submit").click();
await page.waitForURL(/\/today/);
const cookie = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
await browser.close();

// 2) Run Lighthouse with default mobile emulation + simulated throttling.
mkdirSync("lighthouse-reports", { recursive: true });
const chrome = await chromeLauncher.launch({
  chromePath: process.env.CHROME_PATH,
  chromeFlags: ["--headless=new", "--no-sandbox"],
});
const results = [];
try {
  for (const p of paths) {
    const run = await lighthouse(`${BASE}${p}`, {
      port: chrome.port,
      output: "html",
      extraHeaders: { Cookie: cookie },
      onlyCategories: ["performance", "accessibility", "best-practices"],
    });
    const c = run.lhr.categories;
    const row = {
      path: p,
      performance: Math.round(c.performance.score * 100),
      accessibility: Math.round(c.accessibility.score * 100),
      bestPractices: Math.round(c["best-practices"].score * 100),
      lcp: run.lhr.audits["largest-contentful-paint"].displayValue,
      tbt: run.lhr.audits["total-blocking-time"].displayValue,
      cls: run.lhr.audits["cumulative-layout-shift"].displayValue,
    };
    results.push(row);
    writeFileSync(`lighthouse-reports/${p.replace(/\W+/g, "_")}.html`, run.report);
    const failing = Object.values(run.lhr.audits).filter(
      (a) =>
        a.score !== null &&
        a.score < 1 &&
        run.lhr.categories.accessibility.auditRefs.some((r) => r.id === a.id),
    );
    if (failing.length) row.a11yIssues = failing.map((a) => a.id);
  }
} finally {
  await chrome.kill();
}
console.table(results);
writeFileSync("lighthouse-reports/summary.json", JSON.stringify(results, null, 2));
