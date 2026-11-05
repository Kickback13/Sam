import { expect, test } from "@playwright/test";

import { E2E_REALTY, sql } from "./h4a-helpers";
import { expectToast, goto, signIn } from "./helpers";

const WS = `(select id from public.workspaces where slug = $1)`;
// A ZIP and city no other test uses, so only this file's rows can be suggested.
const ZIP = "92198";
const CITY = "Compton Test City";

test.describe.configure({ mode: "serial" });

let subjectId = "";

test.beforeAll(async () => {
  await sql(`delete from public.properties where workspace_id = ${WS} and zip = $2`, [
    E2E_REALTY,
    ZIP,
  ]);
  const insert = async (address: string, extra: string, values: unknown[] = []) => {
    const [row] = await sql<{ id: string }>(
      `insert into public.properties
         (workspace_id, address, city, zip, property_type, lat, lng, units, last_sale_price, last_sale_date, field_sources)
       values (${WS}, $2, $3, $4, 'multifamily', ${extra}) returning id`,
      [E2E_REALTY, address, CITY, ZIP, ...values],
    );
    return row.id;
  };
  const county = `jsonb_build_object('last_sale_price', jsonb_build_object('source', 'county',
      'label', 'County record (e2e)', 'fetched_at', now()::text))`;

  subjectId = await insert("700 Comp Suggest Ave", `32.7400, -117.1000, 10, null, null, '{}'`);
  // Near, similar size, sold this year, with a source: suggested.
  await insert(
    "710 Comp Suggest Ave",
    `32.7420, -117.1010, 8, 2400000, current_date - 200, ${county}`,
  );
  // A sale price with no source: never suggested.
  await insert("720 Comp Suggest Ave", `32.7410, -117.1000, 10, 2500000, current_date - 100, '{}'`);
  // Sold six years ago: too old.
  await insert(
    "740 Comp Suggest Ave",
    `32.7405, -117.1005, 10, 1800000, current_date - 2200, ${county}`,
  );
  // A rent comp saved on another property in the same ZIP: suggested with its own source.
  const other = await insert("730 Comp Suggest Ave", `null, null, 12, null, null, '{}'`);
  await sql(
    `insert into public.h4a_comps (workspace_id, property_id, kind, address, city, zip, unit_type, monthly_rent, source_label, as_of)
     values (${WS}, $2, 'rent', '9 Comp Rent Ct', $3, $4, '2BR/1BA', 2300, 'Rent survey (e2e)', current_date - 10)`,
    [E2E_REALTY, other, CITY, ZIP],
  );
});

test("Automatic comps: suggested from workspace data with sources, added only by a person", async ({
  page,
}) => {
  await signIn(page);
  await goto(page, `/w/${E2E_REALTY}/properties/${subjectId}/analysis`);

  const box = page.getByTestId("suggested-comps");
  const rows = box.getByTestId("suggested-comp");
  await expect(rows).toHaveCount(2);
  const sale = rows.filter({ hasText: "710 Comp Suggest Ave" });
  await expect(sale).toContainText("$2,400,000 · 8 units · $300,000/unit");
  await expect(sale).toContainText("Last sale on file · County record (e2e)");
  await expect(sale).toContainText("mi away");
  const rent = rows.filter({ hasText: "9 Comp Rent Ct" });
  await expect(rent).toContainText("2BR/1BA · $2,300/mo");
  await expect(rent).toContainText("Rent survey (e2e)");
  await expect(rent).toContainText(`Same ZIP ${ZIP}`);
  await expect(box).not.toContainText("720 Comp Suggest Ave");
  await expect(box).not.toContainText("740 Comp Suggest Ave");

  // Nothing was saved just by looking.
  const count = async () =>
    Number(
      (
        await sql<{ n: string }>(`select count(*) n from public.h4a_comps where property_id = $1`, [
          subjectId,
        ])
      )[0].n,
    );
  expect(await count()).toBe(0);

  // Add one: the saved comp carries the source's numbers and label.
  await sale.getByTestId("suggested-comp-add").click();
  await expectToast(page, "Comp added");
  await expect(rows).toHaveCount(1);
  await expect(page.getByTestId("comps-median-ppu")).toHaveText("$300,000");
  const [saved] = await sql<{
    price: string;
    units: number;
    source_label: string;
    sale_date: string | null;
    distance_miles: string | null;
  }>(
    `select price, units, source_label, sale_date::text, distance_miles from public.h4a_comps where property_id = $1`,
    [subjectId],
  );
  expect(Number(saved.price)).toBe(2400000);
  expect(saved.units).toBe(8);
  expect(saved.source_label).toBe("Last sale on file · County record (e2e)");
  expect(saved.sale_date).not.toBeNull();
  expect(Number(saved.distance_miles)).toBeGreaterThan(0);

  // Add the rent comp; the list is then empty and the audit log says they were suggested.
  await rent.getByTestId("suggested-comp-add").click();
  await expectToast(page, "Comp added");
  await expect(box.getByTestId("suggested-comps-empty")).toHaveText("Nothing close enough yet.");
  expect(await count()).toBe(2);
  const [audit] = await sql<{ n: string }>(
    `select count(*) n from public.audit_log
      where action = 'comp.create' and (diff ->> 'suggested')::boolean
        and diff ->> 'property_id' = $1`,
    [subjectId],
  );
  expect(Number(audit.n)).toBe(2);
});
