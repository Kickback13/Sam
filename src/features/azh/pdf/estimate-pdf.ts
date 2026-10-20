import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";

import { LICENSE_PENDING, OFFICES } from "../constants";
import { formatMoney } from "../format";

export type EstimatePdfData = {
  companyName: string;
  logoText: string;
  accentHex: string;
  cslbLicense: string | null;
  isDemo: boolean;
  estimate: {
    version: number;
    title: string;
    status: string;
    createdAt: string;
    validUntil: string | null;
    markupPct: number;
    taxPct: number;
    subtotal: number;
    markup: number;
    tax: number;
    total: number;
    notes: string | null;
  };
  project: { title: string; jobAddress: string | null };
  client: { name: string; phone: string | null; email: string | null } | null;
  items: {
    description: string;
    qty: number;
    unit: string | null;
    unitPrice: number;
    lineTotal: number;
  }[];
};

/** The license line printed on every estimate. Never invents a number. */
export function licenseLine(cslb: string | null | undefined): string {
  const v = cslb?.trim();
  return v ? `CSLB License #${v}` : LICENSE_PENDING;
}

/** Header text (tested): company, license, both offices with phones. */
export function headerLines(data: Pick<EstimatePdfData, "companyName" | "cslbLicense">): string[] {
  return [
    data.companyName,
    licenseLine(data.cslbLicense),
    ...OFFICES.map((o) => `${o.label}: ${o.address} · ${o.phone}`),
  ];
}

const fmtDate = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Los_Angeles",
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso))
    : "—";

const qtyFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });

/** Standard PDF fonts only encode WinAnsi; replace anything else so rendering never throws. */
export function pdfSafe(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/·/g, "-")
    .replace(/\t/g, " ")
    .replace(/[^\x0A\x20-\x7E -ÿ]/g, "?");
}

function hexToRgb(hex: string) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return rgb(1, 0.76, 0.05);
  return rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255);
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
        // Hard-break very long words.
        let w = word;
        while (font.widthOfTextAtSize(w, size) > width && w.length > 1) {
          let cut = w.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(w.slice(0, cut), size) > width) cut--;
          out.push(w.slice(0, cut));
          w = w.slice(cut);
        }
        line = w;
      }
    }
    out.push(line);
  }
  return out;
}

const PAGE = { w: 612, h: 792, margin: 48 };
const INK = rgb(0.067, 0.067, 0.063);
const MUTED = rgb(0.38, 0.38, 0.36);

export async function buildEstimatePdf(data: EstimatePdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(`${data.companyName} - Estimate v${data.estimate.version}`));
  doc.setCreator(pdfSafe(data.companyName));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = doc.addPage([PAGE.w, PAGE.h]);
  let y = PAGE.h - PAGE.margin;
  const right = PAGE.w - PAGE.margin;
  const text = (s: string, x: number, size = 10, f: PDFFont = font, color = INK) =>
    page.drawText(pdfSafe(s), { x, y, size, font: f, color });
  const textRight = (s: string, xRight: number, size = 10, f: PDFFont = font, color = INK) => {
    const safe = pdfSafe(s);
    page.drawText(safe, { x: xRight - f.widthOfTextAtSize(safe, size), y, size, font: f, color });
  };
  const ensure = (needed: number) => {
    if (y - needed < PAGE.margin + 30) {
      page = doc.addPage([PAGE.w, PAGE.h]);
      y = PAGE.h - PAGE.margin;
    }
  };

  // Brand block: accent fill with black logo text (WCAG: yellow is a fill only).
  page.drawRectangle({
    x: PAGE.margin,
    y: y - 34,
    width: 64,
    height: 40,
    color: hexToRgb(data.accentHex),
  });
  const logo = pdfSafe(data.logoText.slice(0, 6));
  page.drawText(logo, {
    x: PAGE.margin + 32 - bold.widthOfTextAtSize(logo, 16) / 2,
    y: y - 20,
    size: 16,
    font: bold,
    color: INK,
  });
  const [company, license, ...offices] = headerLines(data);
  const hx = PAGE.margin + 78;
  text(company, hx, 15, bold);
  textRight("ESTIMATE", right, 18, bold);
  y -= 15;
  text(license, hx, 9, font, MUTED);
  textRight(
    `Version ${data.estimate.version} · ${data.estimate.status.toUpperCase()}`,
    right,
    9,
    font,
    MUTED,
  );
  for (const o of offices) {
    y -= 11;
    text(o, hx, 8.5, font, MUTED);
  }
  y -= 14;
  page.drawLine({ start: { x: PAGE.margin, y }, end: { x: right, y }, thickness: 1, color: INK });
  y -= 20;

  // Meta: client + project / dates.
  const colR = 340;
  text("PREPARED FOR", PAGE.margin, 8, bold, MUTED);
  text("PROJECT", colR, 8, bold, MUTED);
  y -= 13;
  const clientLines = data.client
    ? [data.client.name, data.client.phone, data.client.email].filter((v): v is string =>
        Boolean(v),
      )
    : ["—"];
  const projectLines = [
    ...wrap(data.project.title, bold, 10, right - colR),
    ...(data.project.jobAddress ? wrap(data.project.jobAddress, font, 10, right - colR) : []),
    `Date: ${fmtDate(data.estimate.createdAt)}`,
    `Valid until: ${fmtDate(data.estimate.validUntil)}`,
  ];
  const rows = Math.max(clientLines.length, projectLines.length);
  for (let i = 0; i < rows; i++) {
    if (clientLines[i]) text(clientLines[i], PAGE.margin, 10, i === 0 ? bold : font);
    if (projectLines[i]) text(projectLines[i], colR, 10, i === 0 ? bold : font);
    y -= 13;
  }
  y -= 8;
  text(data.estimate.title, PAGE.margin, 12, bold);
  y -= 20;

  // Line items table.
  const cols = { desc: PAGE.margin, qty: 360, unit: 410, price: 500, total: right };
  const header = () => {
    page.drawRectangle({
      x: PAGE.margin,
      y: y - 4,
      width: right - PAGE.margin,
      height: 16,
      color: rgb(0.95, 0.95, 0.94),
    });
    text("Description", cols.desc + 4, 8.5, bold);
    textRight("Qty", cols.qty + 30, 8.5, bold);
    text("Unit", cols.unit, 8.5, bold);
    textRight("Unit price", cols.price, 8.5, bold);
    textRight("Line total", cols.total - 4, 8.5, bold);
    y -= 18;
  };
  header();
  if (data.items.length === 0) {
    text("No line items.", cols.desc + 4, 10, font, MUTED);
    y -= 14;
  }
  for (const item of data.items) {
    const lines = wrap(item.description, font, 10, cols.qty - cols.desc - 20);
    ensure(lines.length * 12 + 6);
    if (y > PAGE.h - PAGE.margin - 1) header();
    text(lines[0], cols.desc + 4);
    textRight(qtyFmt.format(item.qty), cols.qty + 30);
    text(item.unit ?? "", cols.unit);
    textRight(formatMoney(item.unitPrice), cols.price);
    textRight(formatMoney(item.lineTotal), cols.total - 4);
    for (const extra of lines.slice(1)) {
      y -= 12;
      text(extra, cols.desc + 4);
    }
    y -= 6;
    page.drawLine({
      start: { x: PAGE.margin, y: y + 2 },
      end: { x: right, y: y + 2 },
      thickness: 0.4,
      color: rgb(0.85, 0.85, 0.83),
    });
    y -= 10;
  }

  // Totals.
  ensure(80);
  y -= 4;
  const totals: [string, number, boolean][] = [
    ["Subtotal", data.estimate.subtotal, false],
    [`Markup (${data.estimate.markupPct}%)`, data.estimate.markup, false],
    [`Tax (${data.estimate.taxPct}%)`, data.estimate.tax, false],
    ["Total", data.estimate.total, true],
  ];
  for (const [label, value, strong] of totals) {
    if (strong) {
      page.drawLine({
        start: { x: 380, y: y + 11 },
        end: { x: right, y: y + 11 },
        thickness: 1,
        color: INK,
      });
    }
    text(label, 380, strong ? 12 : 10, strong ? bold : font);
    textRight(formatMoney(value), right - 4, strong ? 12 : 10, strong ? bold : font);
    y -= strong ? 18 : 14;
  }

  if (data.estimate.notes) {
    y -= 10;
    ensure(30);
    text("Notes & terms", PAGE.margin, 9, bold);
    y -= 13;
    for (const line of wrap(data.estimate.notes, font, 9, right - PAGE.margin)) {
      ensure(12);
      text(line, PAGE.margin, 9, font, MUTED);
      y -= 12;
    }
  }

  // Footer on every page.
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const footer = pdfSafe(
      `${data.isDemo ? "DEMO - fictional data. " : ""}${licenseLine(data.cslbLicense)} · Page ${i + 1} of ${pages.length}`,
    );
    p.drawText(footer, { x: PAGE.margin, y: 28, size: 8, font, color: MUTED });
  });

  return doc.save();
}
