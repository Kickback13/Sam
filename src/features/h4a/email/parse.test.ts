import { describe, expect, it } from "vitest";

import {
  BROKER_FORWARD,
  GMAIL_CONFIRMATION,
  LOOPNET_DIGEST,
  NEWSLETTER,
} from "./fixtures/placeholder-emails";
import {
  CREXI_EMAILS,
  CREXI_FULL_ADDRESS,
  CREXI_GMAIL_FORWARD,
  CREXI_NAME_ONLY,
  CREXI_NO_ADDRESS,
  CREXI_STREET_AND_CITY,
} from "./fixtures/crexi-emails";
import { buildContext, parseEmail, PARSERS } from "./parse";
import { parseGeneric } from "./parsers/generic";

describe("parser registry", () => {
  it("has one parser per sender format; Crexi is verified on real samples, LoopNet is still a placeholder", () => {
    expect(PARSERS.map((p) => [p.key, p.formatStatus])).toEqual([
      ["loopnet-saved-search", "placeholder"],
      ["crexi-new-listing", "verified"],
    ]);
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

describe("Crexi listing email (real layout, verified)", () => {
  it("reads a full address and the Property Details block", () => {
    const r = parseEmail(CREXI_FULL_ADDRESS);
    expect(r.parserKey).toBe("crexi-new-listing");
    expect(r.sourceLabel).toBe("Crexi alert");
    expect(r.formatStatus).toBe("verified");
    expect(r.notes.join(" ")).not.toMatch(/made-up sample/);
    expect(r.listings).toHaveLength(1);
    expect(r.listings[0].fields).toMatchObject({
      address: "1150 Fictional Ct",
      city: "San Diego",
      state: "CA",
      zip: "92105",
      price: 4_950_000,
      units: 24,
      property_type: "multifamily",
      cap_rate: 5.2,
      year_built: 1964,
      building_sqft: 18_400,
      lot_sqft: 13_939,
      apn: "999-000-00-01",
      broker_name: "Casey Example",
      listing_url: null,
    });
    expect(r.listings[0].confidence).toBe("high");
    expect(r.listings[0].notes.join(" ")).toMatch(/Other listing contacts: Jordan Sample/);
  });

  it("takes a whole street line and the city from a '|' segment", () => {
    const r = parseEmail(CREXI_STREET_AND_CITY);
    expect(r.listings).toHaveLength(1);
    expect(r.listings[0].fields).toMatchObject({
      address: "900 West Example Avenue",
      city: "Escondido",
      price: 4_100_000,
      units: 18,
      year_built: 1996,
      building_sqft: 14_250,
      apn: "9990000100",
      broker_name: "Riley Example",
    });
    expect(r.listings[0].confidence).toBe("high");
  });

  it.each([
    [CREXI_NO_ADDRESS, /Example Shores.*81 units, asking \$15,000,000/],
    [CREXI_NAME_ONLY, /Example Terrace.*41 units, asking \$13,250,000/],
  ])("creates no listing when Crexi leaves the address out (%#)", (email, note) => {
    const r = parseEmail(email);
    expect(r.parserKey).toBe("crexi-new-listing");
    expect(r.listings).toEqual([]);
    expect(r.kind).toBe("none");
    expect(r.notes.join(" ")).toMatch(note);
    expect(r.notes.join(" ")).toMatch(/add it by hand/);
    // Never handed to the generic reader, which would guess at numbers like "27,026".
    expect(r.notes.join(" ")).not.toMatch(/generic reader/);
  });

  it("reads the plain-text copy Gmail sends with a forward", () => {
    const r = parseEmail(CREXI_GMAIL_FORWARD);
    expect(r.parserKey).toBe("crexi-new-listing");
    expect(r.context.forwardedBy).toMatch(/sam\.placeholder/);
    expect(r.listings).toHaveLength(1);
    expect(r.listings[0].fields).toMatchObject({
      address: "700 North Sample Avenue",
      city: "Escondido",
      price: 5_500_000,
      units: 22,
      property_type: "multifamily",
      cap_rate: 5.75,
      year_built: 1998,
      building_sqft: 16_800,
      lot_sqft: 32_670,
      apn: "999-120-44-00",
      broker_name: "Taylor Example",
      listing_url: null,
    });
    expect(r.listings[0].confidence).toBe("high");
    expect(r.listings[0].notes.join(" ")).toMatch(/Other listing contacts: Quinn Sample$/);
  });

  it("names a forwarded email without an address by its title, with the facts", () => {
    const r = parseEmail({
      ...CREXI_GMAIL_FORWARD,
      text: CREXI_GMAIL_FORWARD.text!.replace("700 North Sample Avenue\n", "Example Gardens\n"),
      subject: "Fwd: You've shared Multifamily | 22 Units | $250,000/unit",
    });
    expect(r.listings).toEqual([]);
    expect(r.notes[0]).toMatch(
      /^Crexi left the street address out of this email \("Example Gardens": 22 units, asking \$5,500,000, APN 999-120-44-00\)/,
    );
  });

  it("never saves Crexi's tracking links or reads its footer as a broker", () => {
    for (const email of CREXI_EMAILS) {
      for (const l of parseEmail(email).listings) {
        expect(l.fields.listing_url).toBeNull();
        expect(l.fields.broker_name).not.toMatch(/support|crexi|888/i);
      }
    }
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
