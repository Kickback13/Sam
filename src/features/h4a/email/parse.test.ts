import { describe, expect, it } from "vitest";

import {
  BROKER_FORWARD,
  CREXI_SINGLE,
  GMAIL_CONFIRMATION,
  LOOPNET_DIGEST,
  NEWSLETTER,
} from "./fixtures/placeholder-emails";
import { buildContext, parseEmail, PARSERS } from "./parse";
import { parseGeneric } from "./parsers/generic";

describe("parser registry", () => {
  it("has one parser per sender format, each marked as a placeholder until real samples arrive", () => {
    expect(PARSERS.map((p) => p.key)).toEqual(["loopnet-saved-search", "crexi-new-listing"]);
    expect(PARSERS.every((p) => p.formatStatus === "placeholder")).toBe(true);
  });
});

describe("LoopNet-style digest (placeholder format)", () => {
  const r = parseEmail(LOOPNET_DIGEST);
  it("picks the LoopNet parser and finds both listings", () => {
    expect(r.kind).toBe("listings");
    expect(r.parserKey).toBe("loopnet-saved-search");
    expect(r.sourceLabel).toBe("LoopNet alert");
    expect(r.formatStatus).toBe("placeholder");
    expect(r.listings).toHaveLength(2);
  });
  it("reads every field of the first listing", () => {
    expect(r.listings[0].fields).toMatchObject({
      address: "3100 Sample Ave",
      city: "San Diego",
      state: "CA",
      zip: "92104",
      price: 4_950_000,
      units: 24,
      property_type: "multifamily",
      cap_rate: 5.2,
      year_built: 1964,
      building_sqft: 18_400,
      lot_sqft: 14_000,
      broker_name: "Pat Sample",
      broker_company: "Example Realty Group",
      broker_phone: "(619) 555-0190",
      listing_url: "https://www.loopnet.example/Listing/3100-Sample-Ave-San-Diego-CA/10000001/",
    });
    expect(r.listings[0].confidence).toBe("high");
    expect(r.listings[0].needsReview).toBe(false);
  });
  it("keeps each listing's own link and numbers", () => {
    expect(r.listings[1].fields).toMatchObject({
      address: "4415 Example St",
      zip: "92116",
      price: 2_640_000,
      units: 12,
      year_built: 1958,
      listing_url: "https://www.loopnet.example/Listing/4415-Example-St-San-Diego-CA/10000002/",
    });
    expect(r.listings[1].fields.cap_rate).toBeNull();
  });
  it("notes that the format is a placeholder", () => {
    expect(r.notes.join(" ")).toMatch(/made-up sample/);
  });
});

describe("Crexi-style HTML alert (placeholder format)", () => {
  const r = parseEmail(CREXI_SINGLE);
  it("reads the HTML table", () => {
    expect(r.parserKey).toBe("crexi-new-listing");
    expect(r.sourceLabel).toBe("Crexi alert");
    expect(r.listings).toHaveLength(1);
    expect(r.listings[0].fields).toMatchObject({
      address: "1150 Fictional Ct",
      city: "San Diego",
      zip: "92105",
      price: 1_195_000,
      units: 4,
      property_type: "multifamily",
      cap_rate: 4.8,
      year_built: 1958,
      building_sqft: 3_600,
      lot_sqft: 5_500,
      apn: "999-000-00-01",
      broker_name: "Casey Example",
      broker_company: "Sample Property Advisors",
      broker_phone: "(619) 555-0192",
      broker_email: "casey.example@example.com",
      listing_url: "https://www.crexi.example/properties/900001/sample-court-fourplex",
    });
    expect(r.listings[0].confidence).toBe("high");
  });
  it("never reads script, style or title text", () => {
    const ctx = buildContext(CREXI_SINGLE);
    expect(ctx.text).not.toMatch(/alert\(|color:red|<title>/);
    expect(ctx.links.map((l) => l.href)).not.toContain("https://tracking.crexi.example/open.gif");
  });
});

describe("generic fallback", () => {
  it("unwraps a Gmail forward and reads a broker email", () => {
    const r = parseEmail(BROKER_FORWARD);
    expect(r.parserKey).toBe("generic");
    expect(r.sourceLabel).toBe("Broker email");
    expect(r.listings).toHaveLength(1);
    expect(r.listings[0].fields).toMatchObject({
      address: "2208 Placeholder Way",
      city: "San Diego",
      zip: "92102",
      price: 985_000,
      units: 3,
      property_type: "triplex",
      year_built: 1948,
      building_sqft: 2_700,
      lot_sqft: 5_000,
      broker_name: "Morgan Example",
      broker_company: "Example Brokerage Co.",
      broker_email: "morgan.example@example.com",
      broker_phone: "(619) 555-0193",
    });
  });
  it("is never high confidence, so its listings land in Needs review", () => {
    const r = parseEmail(BROKER_FORWARD);
    expect(r.listings[0].confidence).toBe("medium");
    expect(r.listings[0].needsReview).toBe(true);
    expect(r.listings[0].reviewReasons.join(" ")).toMatch(/generic fallback reader/);
  });
  it("falls back when a known sender's format doesn't match", () => {
    const r = parseEmail({
      from: "LoopNet <alerts@loopnet.example>",
      subject: "Price reduced",
      html: null,
      text: "A property you saved dropped its price.\n\n7720 Demo Blvd, La Mesa, CA 91942\nNow $9,800,000 · 48 units",
    });
    expect(r.parserKey).toBe("generic");
    expect(r.sourceLabel).toBe("LoopNet email");
    expect(r.notes.join(" ")).toMatch(/found no listings; used the generic reader/);
    expect(r.listings[0].fields).toMatchObject({
      address: "7720 Demo Blvd",
      price: 9_800_000,
      units: 48,
    });
  });
  it("finds address, price, units and link from any email", () => {
    const [c] = parseGeneric(
      buildContext({
        from: "Pat <pat@example.com>",
        subject: "Fourplex",
        text: "Just listed: fourplex at 3305 Placeholder Park, San Diego, CA 92104 for $1,299,000.\nFlyer: https://example.com/flyer/3305",
        html: null,
      }),
    );
    expect(c.fields).toMatchObject({
      address: "3305 Placeholder Park",
      price: 1_299_000,
      units: 4,
      property_type: "fourplex",
      listing_url: "https://example.com/flyer/3305",
    });
  });
  it("low confidence when only an address is found", () => {
    const r = parseEmail({
      from: null,
      subject: null,
      html: null,
      text: "Drive by 9300 Specimen Rd sometime.",
    });
    expect(r.listings[0].confidence).toBe("low");
    expect(r.listings[0].reviewReasons).toEqual(
      expect.arrayContaining(["No city or ZIP found", "No price found", "No unit count found"]),
    );
  });
  it("flags a stated price per unit that doesn't match price ÷ units", () => {
    const r = parseEmail({
      from: "Broker <b@example.com>",
      subject: null,
      html: null,
      text: "1880 Sample Terrace, Chula Vista, CA 91910\nPrice: $4,100,000\n36 units ($150,000/unit)",
    });
    expect(r.listings[0].reviewReasons.join(" ")).toMatch(/doesn't match price ÷ units/);
  });
});

describe("emails without listings", () => {
  it("recognizes the Gmail forwarding confirmation and surfaces the code", () => {
    const r = parseEmail(GMAIL_CONFIRMATION);
    expect(r.kind).toBe("forwarding_confirmation");
    expect(r.confirmationCode).toBe("123456789");
    expect(r.listings).toEqual([]);
  });
  it("finds nothing in a newsletter", () => {
    const r = parseEmail(NEWSLETTER);
    expect(r.kind).toBe("none");
    expect(r.listings).toEqual([]);
    expect(r.notes).toContain("No listing found in this email.");
  });
  it("drops unreadable fields instead of failing the listing", () => {
    const r = parseEmail({
      from: null,
      subject: null,
      html: null,
      text: "3100 Sample Ave, San Diego, CA 92104\nPrice: $4,950,000\n24 units\nYear built: 1066",
    });
    expect(r.listings).toHaveLength(1);
    expect(r.listings[0].fields.year_built).toBeNull();
  });
});
