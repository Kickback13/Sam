import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { redFlags } from "../underwriting/flags";
import { formatMetric } from "../underwriting/format";
import { EMPTY_INPUTS, underwrite, type UnderwritingInputs } from "../underwriting/math";
import { buildAnalysisPdf, inputRows, pdfSafe, resultRows } from "./analysis-pdf";

const inputs: UnderwritingInputs = {
  ...EMPTY_INPUTS,
  price: 2_000_000,
  units: 8,
  unitMix: [{ label: "2BR", count: 8, monthlyRent: 2_250 }],
  vacancyPct: 5,
  taxRatePct: 1.2,
  insurance: 8_000,
  ltvPct: 65,
  interestRatePct: 6,
  amortYears: 30,
};
const result = underwrite(inputs);

describe("analysis PDF", () => {
  it("prints exactly the values the screen shows (same formatter)", () => {
    const rows = resultRows(result).flatMap((g) => g.rows);
    expect(rows.find((r) => r.label === "Net operating income (NOI)")?.value).toBe(
      formatMetric(result.noi),
    );
    expect(rows.find((r) => r.label === "Cap rate")?.value).toBe(formatMetric(result.capRate));
    expect(rows.find((r) => r.label === "Price per sq ft")?.value).toBe("Needs input");
  });

  it("lists only entered inputs, each with its source", () => {
    const rows = inputRows({
      inputs,
      sources: {
        price: { source: "email", label: "Listing email", fetched_at: "2026-10-24T17:00:00Z" },
      },
    });
    expect(rows.find((r) => r.label === "Price")).toMatchObject({
      value: "$2,000,000.00",
      detail: "Listing email, Oct 24, 2026",
    });
    expect(rows.find((r) => r.label === "Units")?.detail).toBe("No source recorded");
    expect(rows.some((r) => r.label === "Utilities (annual)")).toBe(false);
    expect(rows.find((r) => r.label === "Unit type: 2BR")?.value).toBe("8 x $2,250.00/mo");
  });

  it("replaces characters the standard fonts can't draw", () => {
    expect(pdfSafe("Price ÷ units × 12 − vacancy · “ok”")).toBe(
      'Price / units x 12 - vacancy - "ok"',
    );
  });

  it("builds a valid PDF", async () => {
    const bytes = await buildAnalysisPdf({
      workspaceName: "Demo",
      isDemo: true,
      propertyTitle: "Sample Apartments",
      propertyAddress: "100 Sample St, San Diego",
      scenarioName: "Asking price",
      savedAt: "2026-10-27T08:00:00Z",
      notes: "Rents from the seller's rent roll — verify.",
      inputs,
      sources: {},
      result,
      flags: redFlags(inputs, result),
      comps: { saleCount: 2, saleMedianPricePerUnit: 240_000 },
      generatedAt: "2026-10-27T08:00:00Z",
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(doc.getTitle()).toContain("Sample Apartments");
  });
});
