import { expect, test } from "@playwright/test";

import { TINY_PNG } from "./azh-helpers";
import { E2E_REALTY, sql } from "./h4a-helpers";
import { expectToast, goto, signIn } from "./helpers";

const WS = `(select id from public.workspaces where slug = $1)`;
const TITLE = "E2E photo post: 12 units on Adams";

test.beforeAll(async () => {
  await sql(`delete from public.network_posts where workspace_id = ${WS} and title = $2`, [
    E2E_REALTY,
    TITLE,
  ]);
});

test("Network posts carry photos from a private bucket", async ({ page }) => {
  await signIn(page);
  await goto(page, `/w/${E2E_REALTY}/network?tab=posts`);
  const composer = page.getByTestId("post-composer");
  await composer.getByLabel("Title").fill(TITLE);
  await composer.getByTestId("post-photo-input").setInputFiles([
    { name: "front.png", mimeType: "image/png", buffer: TINY_PNG },
    { name: "back.png", mimeType: "image/png", buffer: TINY_PNG },
  ]);
  await expect(composer.getByTestId("post-photo-list")).toContainText("front.png");
  // A file type the bucket doesn't take is refused before upload.
  await composer
    .getByTestId("post-photo-input")
    .setInputFiles([{ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hi") }]);
  await expectToast(page, "use a JPG, PNG or WebP photo");
  await composer.getByTestId("post-submit").click();
  await expectToast(page, "Posted");

  const post = page.locator(`[data-testid=network-post][data-title="${TITLE}"]`);
  const imgs = post.getByTestId("post-photos").locator("img");
  await expect(imgs).toHaveCount(2);
  // The signed link really serves the image.
  await expect
    .poll(() => imgs.first().evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth))
    .toBeGreaterThan(0);
  const [{ n }] = await sql<{ n: number }>(
    `select cardinality(photo_paths) as n from public.network_posts where workspace_id = ${WS} and title = $2`,
    [E2E_REALTY, TITLE],
  );
  expect(n).toBe(2);
});
