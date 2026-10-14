import { expect, test } from "@playwright/test";

import { E2E_AZH_SLUG, resetAzhWorkspace, seedRequest, sql, TINY_PNG } from "./azh-helpers";
import { expectToast, goto, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

test.beforeAll(async () => {
  await resetAzhWorkspace();
  await seedRequest({ name: "Sample Fileholder", phone: "(619) 555-0133", zip: "92104" });
});

test("files & photos on a project and a request: previews, allow-list, delete", async ({
  page,
}) => {
  await signIn(page);
  const [{ deal_id }] = await sql<{ deal_id: string }>(
    `select deal_id from public.azh_requests where workspace_id = (select id from public.workspaces where slug = $1)`,
    [E2E_AZH_SLUG],
  );

  await goto(page, `/w/${E2E_AZH_SLUG}/projects/${deal_id}?tab=files`);
  const panel = page.getByTestId("files-panel");
  await expect(panel).toContainText("No files yet");
  await panel.getByTestId("file-input").setInputFiles([
    { name: "site photo.png", mimeType: "image/png", buffer: TINY_PNG },
    { name: "Permit.pdf", mimeType: "application/pdf", buffer: PDF },
    { name: "virus.exe", mimeType: "application/x-msdownload", buffer: Buffer.from("MZ") },
  ]);
  await expectToast(page, "2 files uploaded");
  await expect(panel.getByRole("alert")).toContainText("virus.exe: this file type isn't allowed");
  await expect(panel.getByTestId("file-photos").locator("img")).toHaveCount(1);
  await expect(panel.getByTestId("file-docs")).toContainText("Permit.pdf");

  page.once("dialog", (d) => void d.accept());
  await panel.getByRole("button", { name: "Delete Permit.pdf" }).click();
  await expectToast(page, "File deleted");
  await expect(panel.getByTestId("file-docs")).toHaveCount(0);

  // Same component in the request drawer.
  await goto(page, `/w/${E2E_AZH_SLUG}/requests`);
  await page.getByTestId("request-row").first().click();
  const drawerFiles = page.getByTestId("request-drawer").getByTestId("files-panel");
  await drawerFiles.getByTestId("file-input").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("measure twice"),
  });
  await expectToast(page, "1 file uploaded");
  await expect(drawerFiles.getByTestId("file-docs")).toContainText("notes.txt");

  const rows = await sql<{ n: string }>(
    `select count(*)::text as n from public.azh_files where workspace_id = (select id from public.workspaces where slug = $1)`,
    [E2E_AZH_SLUG],
  );
  expect(rows[0].n).toBe("2");
});
