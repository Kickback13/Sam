import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";

import type { RedFlag } from "../underwriting/flags";
import { formatMetric } from "../underwriting/format";
import {
  INPUT_LABELS,
  METRIC_GROUPS,
  type InputKey,
  type Underwriting,
  type UnderwritingInputs,
} from "../underwriting/math";
import type { InputSources } from "../underwriting/prefill";

export type AnalysisPdfData = {
  workspaceName: string;
  isDemo: boolean;
  propertyTitle: string;
  propertyAddress: string;
  scenarioName: string;
  savedAt: string;
  notes: string | null;
  inputs: UnderwritingInputs;
  sources: InputSources;
  result: Underwriting;
  flags: RedFlag[];
  comps: { saleCount: number; saleMedianPricePerUnit: number | null };
  generatedAt: string;
};

export type PdfRow = { label: string; value: string; detail: string };

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));

const MONEY = new Set<InputKey>([
  "price",
  "monthlyRentTotal",
  "otherIncomeMonthly",
  "insurance",
  "utilities",
  "repairs",
  "payroll",
  "otherExpenses",
  "closingCosts",
]);

/** Inputs as printed: only what was entered, each with its source. */
export function inputRows(d: Pick<AnalysisPdfData, "inputs" | "sources">): PdfRow[] {
  const rows: PdfRow[] = [];
  const src = (k: InputKey) => {
    const s = d.sources[k];
    return s ? `${s.label}, ${fmtDate(s.fetched_at)}` : "No source recorded";
  };
  for (const key of Object.keys(INPUT_LABELS) as InputKey[]) {
    if (key === "unitMix" || key === "expenseMode") continue;
    const v = d.inputs[key];
    if (typeof v !== "number") continue;
    const value = MONEY.has(key) ? usd.format(v) : key.endsWith("Pct") ? `${v}%` : String(v);
    rows.push({ label: INPUT_LABELS[key], value, detail: src(key) });
  }
  for (const r of d.inputs.unitMix)
    rows.push({
      label: `Unit type: ${r.label}`,
      value: `${r.count} x ${usd.format(r.monthlyRent)}/mo`,
      detail: src("unitMix"),
    });
  rows.push({
    label: "Expense method",
    value: d.inputs.expenseMode === "ratio" ? "Expense ratio" : "Line by line",
    detail: "",
  });
  return rows;
}

/** Results as printed — the same formatMetric() the screen uses. */
export function resultRows(result: Underwriting): { title: string; rows: PdfRow[] }[] {
  return METRIC_GROUPS.map((g) => ({
    title: g.title,
    rows: g.keys.map((k) => {
      const m = result[k];
      return {
        label: m.label,
        value:
          m.value !== null ? formatMetric(m) : m.missing.length ? "Needs input" : (m.note ?? "-"),
        detail: m.formula,
      };
    }),
  }));
}

/** Standard PDF fonts only encode WinAnsi; replace anything else so rendering never throws. */
export function pdfSafe(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[·•]/g, "-")
    .replace(/[×]/g, "x")
    .replace(/[÷]/g, "/")
    .replace(/[−]/g, "-")
    .replace(/Σ/g, "Sum")
    .replace(/\t/g, " ")
    .replace(/[^\x0A\x20-\x7E\xA0-\xFF]/g, "?");
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of pdfSafe(text).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) line = next;
      else {
        if (line) out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}

const PAGE = { w: 612, h: 792, margin: 48 };
const INK = rgb(0.07, 0.07, 0.06);
const MUTED = rgb(0.38, 0.38, 0.36);
const ACCENT_TEXT = rgb(0, 0.482, 0.51); // #007B82

export async function buildAnalysisPdf(d: AnalysisPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(`Deal analysis - ${d.propertyTitle} - ${d.scenarioName}`));
  doc.setCreator("Housing4All Platform");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage = doc.addPage([PAGE.w, PAGE.h]);
  let y = PAGE.h - PAGE.margin;
  const width = PAGE.w - PAGE.margin * 2;

  const ensure = (needed: number) => {
    if (y - needed < PAGE.margin + 20) {
      page = doc.addPage([PAGE.w, PAGE.h]);
      y = PAGE.h - PAGE.margin;
    }
  };
  const text = (
    t: string,
    opts: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb>; x?: number } = {},
  ) => {
    const size = opts.size ?? 10;
    ensure(size + 4);
    page.drawText(pdfSafe(t), {
      x: opts.x ?? PAGE.margin,
      y: y - size,
      size,
      font: opts.f ?? font,
      color: opts.color ?? INK,
    });
    y -= size + 4;
  };
  const heading = (t: string) => {
    y -= 8;
    ensure(30);
    text(t, { size: 12, f: bold, color: ACCENT_TEXT });
    page.drawLine({
      start: { x: PAGE.margin, y: y + 1 },
      end: { x: PAGE.w - PAGE.margin, y: y + 1 },
      thickness: 0.5,
      color: MUTED,
    });
    y -= 4;
  };
  const row = (r: PdfRow) => {
    const labelW = 190;
    const valueW = 120;
    const detailLines = r.detail ? wrap(r.detail, font, 8, width - labelW - valueW - 12) : [""];
    const h = Math.max(1, detailLines.length) * 11 + 3;
    ensure(h);
    page.drawText(pdfSafe(r.label), { x: PAGE.margin, y: y - 10, size: 9.5, font, color: INK });
    page.drawText(pdfSafe(r.value), {
      x: PAGE.margin + labelW,
      y: y - 10,
      size: 9.5,
      font: bold,
      color: INK,
    });
    detailLines.forEach((l, i) =>
      page.drawText(l, {
        x: PAGE.margin + labelW + valueW + 12,
        y: y - 10 - i * 11,
        size: 8,
        font,
        color: MUTED,
      }),
    );
    y -= h;
  };

  if (d.isDemo)
    text("DEMO WORKSPACE - sample data, not a real property", {
      size: 9,
      f: bold,
      color: rgb(0.45, 0.2, 0.6),
    });
  text("Deal analysis", { size: 20, f: bold });
  text(d.propertyTitle, { size: 13, f: bold });
  if (d.propertyAddress && d.propertyAddress !== d.propertyTitle)
    text(d.propertyAddress, { size: 10, color: MUTED });
  text(`Scenario: ${d.scenarioName} - saved ${fmtDate(d.savedAt)} - ${d.workspaceName}`, {
    size: 9,
    color: MUTED,
  });

  heading("Results");
  for (const g of resultRows(d.result)) {
    ensure(30);
    text(g.title.toUpperCase(), { size: 8, f: bold, color: MUTED });
    g.rows.forEach(row);
  }

  heading("Red flags");
  if (d.flags.length === 0)
    text("Nothing flagged with the numbers entered.", { size: 9.5, color: MUTED });
  for (const f of d.flags) {
    const tag = f.level === "danger" ? "PROBLEM" : f.level === "warning" ? "CHECK" : "NOTE";
    for (const [i, l] of wrap(`${tag}: ${f.title}. ${f.detail}`, font, 9.5, width).entries())
      text(l, { size: 9.5, f: i === 0 ? bold : font });
  }

  heading("Inputs and where they came from");
  inputRows(d).forEach(row);

  heading("Comps");
  text(
    d.comps.saleCount > 0 && d.comps.saleMedianPricePerUnit !== null
      ? `${d.comps.saleCount} sale comps, median ${usd.format(d.comps.saleMedianPricePerUnit)} per unit (each comp's source is listed in the app).`
      : "No sale comps entered.",
    { size: 9.5 },
  );

  if (d.notes) {
    heading("Notes");
    for (const l of wrap(d.notes, font, 9.5, width)) text(l, { size: 9.5 });
  }

  const pages = doc.getPages();
  pages.forEach((p, i) =>
    p.drawText(
      pdfSafe(
        `Generated ${fmtDate(d.generatedAt)} by the same calculator as the app - page ${i + 1} of ${pages.length}`,
      ),
      { x: PAGE.margin, y: 28, size: 7.5, font, color: MUTED },
    ),
  );
  return doc.save();
}
