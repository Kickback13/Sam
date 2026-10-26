import { describe, expect, it } from "vitest";

import { azhSettingsSchema } from "./validation";

const base = { cslb_license: "", service_types: ["Drywall"], intake_enabled: true };
const A = "7e570000-0000-4000-a000-00000000000a";
const B = "7e570000-0000-4000-a000-00000000000b";

describe("AZH settings: office assignees", () => {
  it("keeps the picked order and drops duplicates", () => {
    const r = azhSettingsSchema.parse({
      ...base,
      san_diego_assignees: [B, A, B],
      fallbrook_assignees: [],
    });
    expect(r.san_diego_assignees).toEqual([B, A]);
    expect(r.fallbrook_assignees).toEqual([]);
  });

  it("defaults to nobody", () => {
    const r = azhSettingsSchema.parse(base);
    expect(r.san_diego_assignees).toEqual([]);
    expect(r.fallbrook_assignees).toEqual([]);
  });

  it("rejects non-ids and more than 20 people", () => {
    expect(azhSettingsSchema.safeParse({ ...base, san_diego_assignees: ["nope"] }).success).toBe(
      false,
    );
    const many = Array.from(
      { length: 21 },
      (_, i) => `7e570000-0000-4000-a000-${String(i).padStart(12, "0")}`,
    );
    expect(azhSettingsSchema.safeParse({ ...base, fallbrook_assignees: many }).success).toBe(false);
  });
});
