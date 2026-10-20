import { expect, test } from "@playwright/test";

import { E2E_AZH_SLUG, resetAzhWorkspace, sql, TINY_PNG } from "./azh-helpers";
import { goto, signIn } from "./helpers";

const KEY = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"; // local stack default (public)
const PHONE = "(619) 555-0146";

test.beforeAll(async () => {
  await resetAzhWorkspace();
});

test("admin cleans up form photos that never made it onto a request", async ({ page, request }) => {
  // Two photos uploaded through the real slot flow…
  const res = await request.post(`/r/${E2E_AZH_SLUG}/upload`, {
    data: {
      phone: PHONE,
      files: [
        { type: "image/png", size: TINY_PNG.length },
        { type: "image/png", size: TINY_PNG.length },
      ],
    },
  });
  const { slots } = (await res.json()) as { slots: { path: string; token: string }[] };
  expect(slots).toHaveLength(2);
  for (const s of slots) {
    const up = await request.put(
      `http://127.0.0.1:54321/storage/v1/object/upload/sign/azh-intake/${s.path}?token=${s.token}`,
      { headers: { apikey: KEY, "Content-Type": "image/png" }, data: TINY_PNG },
    );
    expect(up.ok()).toBe(true);
  }
  // …only the second one is attached to a submitted request.
  await sql(
    `insert into public.azh_intake (workspace_slug, name, phone, job_address, job_zip, service_type, description, photo_paths)
     values ($1, 'Sample Cleanup', $2, '1 Example Ct', '92104', 'Painting', 'x', $3)`,
    [E2E_AZH_SLUG, PHONE, [slots[1].path]],
  );
  // Both are two days old.
  await sql(
    `update storage.objects set created_at = now() - interval '2 days' where bucket_id = 'azh-intake' and name = any($1)`,
    [slots.map((s) => s.path)],
  );

  await signIn(page);
  await goto(page, `/w/${E2E_AZH_SLUG}/settings/azh`);
  await page.getByTestId("cleanup-uploads").click();
  await expect(page.getByTestId("cleanup-result")).toHaveText("Removed 1 unused upload.");

  const left = await sql<{ name: string }>(
    `select name from storage.objects where bucket_id = 'azh-intake' and name = any($1)`,
    [slots.map((s) => s.path)],
  );
  expect(left.map((r) => r.name)).toEqual([slots[1].path]);

  await page.getByTestId("cleanup-uploads").click();
  await expect(page.getByTestId("cleanup-result")).toHaveText("Nothing to clean up.");
});

test("the cleanup button is admin-only", async ({ page }) => {
  await signIn(page, "e2e-outsider@example.test"); // agent in e2e-builders
  await goto(page, `/w/${E2E_AZH_SLUG}/settings/azh`);
  await expect(page.getByRole("heading", { name: "Public request form" })).toBeVisible();
  await expect(page.getByTestId("cleanup-uploads")).toHaveCount(0);
});
