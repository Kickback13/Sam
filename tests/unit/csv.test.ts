import { describe, expect, it } from "vitest";

import { csvCell, mergeContact, planRows, toCsv } from "@/lib/csv/dedupe";
import { autoMap, mappingProblems } from "@/lib/csv/mapping";
import { transformRow } from "@/lib/csv/transform";

const GHL_HEADERS = [
  "Contact Id",
  "First Name",
  "Last Name",
  "Phone",
  "Email",
  "Company Name",
  "Tags",
  "Source",
  "Additional Emails",
  "Additional Phones",
  "DND",
  "Created",
  "Last Activity",
];

describe("autoMap", () => {
  it("maps GoHighLevel's standard export columns", () => {
    const m = autoMap(GHL_HEADERS);
    expect(m).toMatchObject({
      "Contact Id": "ghl_contact_id",
      "First Name": "first_name",
      "Last Name": "last_name",
      Phone: "phone",
      Email: "email",
      "Company Name": "company",
      Tags: "tags",
      Source: "source",
      "Additional Emails": "email_2",
      "Additional Phones": "phone_2",
      DND: "dnc",
      Created: "",
      "Last Activity": "",
    });
    expect(mappingProblems(m)).toEqual([]);
  });

  it("uses a Name column only when first/last are missing", () => {
    expect(autoMap(["Name", "Email"])).toEqual({ Name: "full_name", Email: "email" });
    expect(autoMap(["Name", "First Name"]).Name).toBe("");
  });

  it("handles snake_case and odd spacing", () => {
    expect(autoMap(["first_name", "E-mail", "zip_code"])).toEqual({
      first_name: "first_name",
      "E-mail": "email",
      zip_code: "zip",
    });
  });

  it("flags mappings that can't identify a person or reuse a field", () => {
    expect(mappingProblems({ Notes: "notes" })[0]).toMatch(/at least one/);
    expect(mappingProblems({ A: "email", B: "email" }).some((p) => p.includes("mapped to 2"))).toBe(
      true,
    );
  });
});

describe("transformRow", () => {
  const mapping = autoMap(GHL_HEADERS);

  it("builds a contact with normalized keys", () => {
    const r = transformRow(
      {
        "Contact Id": "abc123",
        "First Name": " Ana ",
        "Last Name": "Example",
        Phone: "(619) 555-0100",
        Email: "Ana@Example.com",
        "Company Name": "Example LLC",
        Tags: "owner, Long Hold",
        "Additional Emails": "ana2@example.com, ana@example.com",
        DND: "true",
      },
      mapping,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.contact).toMatchObject({
      first_name: "Ana",
      last_name: "Example",
      dnc: true,
      tags: ["owner", "long-hold"],
      source: "CSV import",
    });
    expect(r.value.emailKeys).toEqual(["ana@example.com", "ana2@example.com"]);
    expect(r.value.phoneKeys).toEqual(["+16195550100"]);
    expect(r.value.companyName).toBe("Example LLC");
    expect(r.value.ghlContactId).toBe("abc123");
    expect(r.value.contact.emails[0].is_primary).toBe(true);
  });

  it("fails rows with an invalid email instead of silently dropping it", () => {
    const r = transformRow({ "First Name": "Bo", Email: "nope" }, mapping);
    expect(r).toEqual({ ok: false, errors: ['Invalid email "nope"'] });
  });

  it("fails rows with nothing to identify the person", () => {
    const r = transformRow({ Tags: "x" }, mapping);
    expect(r.ok).toBe(false);
  });

  it("splits a full name and maps roles", () => {
    const r = transformRow(
      { Name: "Mary Jo Sample", Roles: "Property Manager; realtor" },
      { Name: "full_name", Roles: "roles" },
    );
    expect(r.ok && r.value.contact).toMatchObject({
      first_name: "Mary Jo",
      last_name: "Sample",
      roles: ["property_manager", "broker"],
    });
  });
});

describe("planRows (dedupe)", () => {
  const existing = [
    {
      id: "c1",
      full_name: "Ana",
      emailKeys: ["ana@example.com"],
      phoneKeys: [],
      ghlContactId: "g1",
    },
  ];

  it("matches existing contacts by email, phone or GHL id and flags in-file duplicates", () => {
    const plans = planRows(
      [
        { row: 2, emailKeys: ["ana@example.com"], phoneKeys: [] },
        { row: 3, emailKeys: ["bo@example.com"], phoneKeys: ["+16195550101"] },
        { row: 4, emailKeys: [], phoneKeys: ["+16195550101"] },
        { row: 5, emailKeys: [], phoneKeys: [], ghlContactId: "g1" },
        { row: 6, emailKeys: ["new@example.com"], phoneKeys: [] },
      ],
      existing,
    );
    expect(plans.get(2)).toMatchObject({
      action: "match",
      existingId: "c1",
      via: "email ana@example.com",
    });
    expect(plans.get(3)).toEqual({ action: "create" });
    expect(plans.get(4)).toMatchObject({ action: "duplicate_in_file", firstRow: 3 });
    expect(plans.get(5)).toMatchObject({ action: "match", via: "GHL ID g1" });
    expect(plans.get(6)).toEqual({ action: "create" });
  });
});

describe("mergeContact (update strategy)", () => {
  it("fills values, unions lists and never clears compliance flags", () => {
    const merged = mergeContact<Record<string, unknown>>(
      {
        first_name: "Ana",
        title: null,
        tags: ["a"],
        dnc: true,
        email_opt_out: false,
        emails: [{ value: "ana@example.com", is_primary: true }],
      },
      {
        first_name: "",
        title: "Owner",
        tags: ["b", "a"],
        dnc: false,
        email_opt_out: true,
        emails: [{ value: "ANA@example.com" }, { value: "x@example.com" }],
      },
    );
    expect(merged).toEqual({
      title: "Owner",
      tags: ["a", "b"],
      dnc: true,
      email_opt_out: true,
      emails: [
        { value: "ana@example.com", is_primary: true },
        { value: "x@example.com", is_primary: false },
      ],
    });
  });
});

describe("error report CSV", () => {
  it("quotes and neutralizes spreadsheet formulas", () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCell("+1 619")).toBe("'+1 619");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(toCsv(["row", "error"], [[2, "Bad"]])).toBe("row,error\r\n2,Bad");
  });
});
