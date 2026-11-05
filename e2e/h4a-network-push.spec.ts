import { expect, test } from "@playwright/test";

import { E2E_REALTY } from "./h4a-helpers";
import { goto, signIn } from "./helpers";

test("Push notifications: labeled Not connected until the keys exist; the app can show them", async ({
  page,
  request,
}) => {
  // The service worker handles push messages and notification clicks.
  const sw = await request.get("/network-sw.js");
  expect(sw.ok()).toBe(true);
  const js = await sw.text();
  expect(js).toContain("addEventListener('push'");
  expect(js).toContain("addEventListener('notificationclick'");

  await signIn(page);
  await goto(page, `/w/${E2E_REALTY}/network?tab=posts`);
  await expect(page.getByTestId("push-status")).toContainText("Push notifications: not connected");

  // Without the keys, the member app offers no notification button.
  await goto(page, `/n/${E2E_REALTY}`);
  await expect(page.getByTestId("push-on")).toHaveCount(0);
});
