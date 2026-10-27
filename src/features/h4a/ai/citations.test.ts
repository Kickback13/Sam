import { describe, expect, it } from "vitest";

import { EMPTY_INPUTS, underwrite, type UnderwritingInputs } from "../underwriting/math";
import { buildFacts, checkSummary, numbersIn } from "./citations";

const inputs: UnderwritingInputs = {
  ...EMPTY_INPUTS,
  price: 2_000_000,
  units: 8,
  monthlyRentTotal: 18_000,
  vacancyPct: 5,
  taxRatePct: 1.2,
  insurance: 8_000,
};
const facts = buildFacts({
  inputs,
  sources: {
    price: { source: "email", label: "Listing email", fetched_at: "2026-10-24T00:00:00Z" },
  },
  result: underwrite(inputs),
  comps: { saleCount: 3, saleMedianPricePerUnit: 240_000 },
  flags: [{ id: "vacancy_low", title: "Optimistic vacancy", detail: "Vacancy is set to 2%." }],
});
const ids = new Set(facts.map((f) => f.id));

describe("buildFacts", () => {
  it("includes computed metrics, inputs with sources, comp median and flags — never missing values", () => {
    expect(ids.has("m.pricePerUnit")).toBe(true);
    expect(ids.has("m.noi")).toBe(true);
    expect(ids.has("m.dscr")).toBe(false); // no loan entered → not a fact
    expect(facts.find((f) => f.id === "i.price")).toMatchObject({
      value: "$2,000,000.00",
      source: "Listing email",
    });
    expect(ids.has("c.saleMedianPricePerUnit")).toBe(true);
    expect(ids.has("f.vacancy_low")).toBe(true);
  });
});

describe("numbersIn", () => {
  it("normalizes money, percents and commas", () => {
    expect(numbersIn("$1,300,000 at 7.27% for 8 units")).toEqual(["1300000", "7.27", "8"]);
  });
});

describe("checkSummary", () => {
  it("keeps sentences whose numbers all come from their cited facts", () => {
    const r = checkSummary(
      [
        {
          text: "At $250,000 per unit across 8 units, the asking price is $2,000,000.",
          fact_ids: ["m.pricePerUnit", "i.units", "i.price"],
        },
      ],
      facts,
    );
    expect(r.dropped).toBe(0);
    expect(r.sentences[0].facts.map((f) => f.id)).toEqual(["m.pricePerUnit", "i.units", "i.price"]);
  });

  it("drops a sentence with no citation", () => {
    expect(checkSummary([{ text: "Great deal.", fact_ids: [] }], facts)).toEqual({
      sentences: [],
      dropped: 1,
    });
  });

  it("drops a sentence citing an unknown fact", () => {
    expect(
      checkSummary([{ text: "Owner is motivated.", fact_ids: ["x.owner"] }], facts).dropped,
    ).toBe(1);
  });

  it("drops a sentence stating a number its facts don't contain", () => {
    const r = checkSummary(
      [
        { text: "The cap rate is 9.5%.", fact_ids: ["m.capRate"] },
        { text: "Price is $2,000,000.", fact_ids: ["i.price"] },
      ],
      facts,
    );
    expect(r.dropped).toBe(1);
    expect(r.sentences.map((s) => s.text)).toEqual(["Price is $2,000,000."]);
  });

  it("allows numbers from a cited fact's label (e.g. comp count)", () => {
    const r = checkSummary(
      [
        {
          text: "The median of 3 sale comps is $240,000 per unit.",
          fact_ids: ["c.saleMedianPricePerUnit"],
        },
      ],
      facts,
    );
    expect(r.dropped).toBe(0);
  });
});
