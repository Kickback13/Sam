import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import {
  buildEstimatePdf,
  headerLines,
  licenseLine,
  pdfSafe,
  type EstimatePdfData,
} from "./estimate-pdf";

const data: EstimatePdfData = {
  companyName: "AZH Builders",
  logoText: "AZH",
  accentHex: "#FFC20E",
  cslbLicense: null,
  isDemo: false,
  estimate: {
    version: 2,
    title: "Kitchen remodel — phase 1",
    status: "sent",
    createdAt: "2026-10-14T17:00:00Z",
    validUntil: "2026-11-14",
    markupPct: 12.5,
    taxPct: 7.75,
    subtotal: 1671.99,
    markup: 209,
    tax: 145.78,
    total: 2026.77,
    notes: "Payment: 30% deposit.\nPermits by owner. “Quoted” prices valid 30 days.",
  },
  project: { title: "Sample job", jobAddress: "123 Example St, San Diego, CA 92104" },
  client: { name: "Sample Homeowner", phone: "(619) 555-0100", email: "sample@example.com" },
  items: Array.from({ length: 60 }, (_, i) => ({
    description: `Line ${i + 1} — drywall, tape and texture with a long description that wraps onto a second line`,
    qty: 1.5,
    unit: "sq ft",
    unitPrice: 10,
    lineTotal: 15,
  })),
};

describe("estimate PDF", () => {
  it("prints 'License # pending' when no CSLB number is set — never an invented one", () => {
    expect(licenseLine(null)).toBe("License # pending");
    expect(licenseLine("  ")).toBe("License # pending");
    expect(licenseLine("1234567")).toBe("CSLB License #1234567");
  });

  it("puts both offices with phone numbers in the header", () => {
    const lines = headerLines(data);
    expect(lines[0]).toBe("AZH Builders");
    expect(lines).toContain("San Diego: 3683 University Ave, San Diego, CA 92104 · (619) 202-0679");
    expect(lines).toContain("Fallbrook: 532 E. Fallbrook Ave, Fallbrook, CA · (760) 691-5000");
  });

  it("replaces characters standard PDF fonts can't encode", () => {
    expect(pdfSafe("“Hi” — it’s 5…")).toBe('"Hi" - it\'s 5...');
    expect(pdfSafe("Baño ✅ 漢")).toBe("Baño ? ?");
  });

  it("renders a valid multi-page PDF", async () => {
    const bytes = await buildEstimatePdf(data);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
    expect(doc.getTitle()).toBe("AZH Builders - Estimate v2");
  });
});
