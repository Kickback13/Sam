import { describe, expect, it } from "vitest";

import { consentText, DICTS } from "./i18n";
import { intakePhotoPath, intakeSchema, PHOTO_PATH_RE } from "./schema";

const valid = {
  slug: "azh-builders",
  lang: "en" as const,
  name: "  Sample Homeowner ",
  phone: "(619) 555-0142",
  email: "",
  job_address: "123 Example St",
  job_zip: "92028",
  service_type: "Drywall",
  description: "Patch two holes",
  preferred_contact_time: "morning" as const,
  photo_paths: [],
  sms_consent: false,
};

describe("public request form validation", () => {
  it("accepts a valid request and normalizes blanks", () => {
    const r = intakeSchema.parse(valid);
    expect(r.name).toBe("Sample Homeowner");
    expect(r.email).toBeNull();
    expect(r.sms_consent).toBe(false);
  });

  it("requires a real US phone number", () => {
    for (const phone of ["555-0142", "(119) 555-0142", "+44 20 7946 0958", "abc"]) {
      const r = intakeSchema.safeParse({ ...valid, phone });
      expect(r.success, phone).toBe(false);
      if (!r.success) expect(r.error.issues[0].message).toBe("phone");
    }
    expect(intakeSchema.safeParse({ ...valid, phone: "+1 760 555 0100" }).success).toBe(true);
  });

  it("validates email, ZIP, required fields and photo count", () => {
    const bad = (patch: object) => {
      const r = intakeSchema.safeParse({ ...valid, ...patch });
      return r.success ? null : r.error.issues.map((i) => i.message);
    };
    expect(bad({ email: "not-an-email" })).toEqual(["email"]);
    expect(bad({ job_zip: "9202" })).toEqual(["zip"]);
    expect(bad({ name: "   " })).toEqual(["name"]);
    expect(bad({ service_type: "" })).toEqual(["service"]);
    expect(bad({ description: "" })).toEqual(["description"]);
    expect(bad({ photo_paths: ["a", "b", "c", "d", "e", "f"] })).toEqual(["photoCount"]);
    expect(bad({ lang: "fr" })).not.toBeNull();
  });

  it("every error key has an EN and ES message", () => {
    for (const key of [
      "name",
      "phone",
      "email",
      "addressShort",
      "zip",
      "service",
      "description",
      "photoCount",
    ]) {
      expect(DICTS.en.errors[key as keyof typeof DICTS.en.errors]).toBeTruthy();
      expect(DICTS.es.errors[key as keyof typeof DICTS.es.errors]).toBeTruthy();
    }
  });

  it("stores the exact consent wording per language, with STOP/HELP and 'not required'", () => {
    expect(consentText("en")).toMatch(/Reply STOP to opt out/);
    expect(consentText("en")).toMatch(/not required/);
    expect(consentText("es")).toMatch(/Responda STOP/);
    expect(consentText("es")).not.toBe(consentText("en"));
  });

  it("builds photo paths the storage policy accepts", () => {
    const p = intakePhotoPath(
      "63f80c72-3939-45af-af4d-a611c7f9525a",
      "c4438938-b7ab-4800-a4ea-4623425be092",
      4,
      "jpg",
    );
    expect(PHOTO_PATH_RE.test(p)).toBe(true);
    expect(PHOTO_PATH_RE.test(p.replace("/4.jpg", "/5.jpg"))).toBe(false);
    expect(PHOTO_PATH_RE.test(p.replace(".jpg", ".exe"))).toBe(false);
  });
});
