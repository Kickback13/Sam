/**
 * AI summary grounding (pure). The model only sees a numbered list of facts —
 * each with an id, the value exactly as the page shows it, and its source —
 * and must cite fact ids on every sentence. Before anything is shown:
 *
 *  - every sentence must cite at least one fact, and every cited id must exist;
 *  - every number written in a sentence must equal a number in one of the facts
 *    it cites (so a sentence can't state a figure it didn't get from us).
 *
 * Sentences that fail are dropped and counted; if none survive, nothing is shown.
 */
import { formatMetric } from "../underwriting/format";
import {
  INPUT_LABELS,
  type InputKey,
  type Underwriting,
  type UnderwritingInputs,
} from "../underwriting/math";
import type { InputSources } from "../underwriting/prefill";

export type Fact = { id: string; label: string; value: string; source: string };

export type SummarySentence = { text: string; fact_ids: string[] };
export type CheckedSentence = { text: string; facts: Fact[] };
export type CheckedSummary = { sentences: CheckedSentence[]; dropped: number };

const MONEY_INPUTS = new Set<InputKey>([
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
const PCT_INPUTS = new Set<InputKey>([
  "vacancyPct",
  "taxRatePct",
  "managementPct",
  "expenseRatioPct",
  "ltvPct",
  "interestRatePct",
]);

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

function inputValue(key: InputKey, v: number): string {
  if (MONEY_INPUTS.has(key)) return usd.format(v);
  if (PCT_INPUTS.has(key)) return `${v}%`;
  if (key === "amortYears") return `${v} years`;
  return new Intl.NumberFormat("en-US").format(v);
}

/** The facts the model may use: computed metrics with values, entered inputs, comp stats, flags. */
export function buildFacts(args: {
  inputs: UnderwritingInputs;
  sources: InputSources;
  result: Underwriting;
  comps: { saleCount: number; saleMedianPricePerUnit: number | null };
  flags: { id: string; title: string; detail: string }[];
}): Fact[] {
  const facts: Fact[] = [];
  for (const m of Object.values(args.result)) {
    if (m.value === null) continue;
    facts.push({
      id: `m.${m.key}`,
      label: m.label,
      value: formatMetric(m),
      source: `Calculated: ${m.formula}`,
    });
  }
  for (const key of Object.keys(INPUT_LABELS) as InputKey[]) {
    if (key === "unitMix" || key === "expenseMode") continue;
    const v = args.inputs[key];
    if (typeof v !== "number") continue;
    facts.push({
      id: `i.${key}`,
      label: INPUT_LABELS[key],
      value: inputValue(key, v),
      source: args.sources[key]?.label ?? "No source recorded",
    });
  }
  args.inputs.unitMix.forEach((r, idx) => {
    facts.push({
      id: `i.unitMix.${idx}`,
      label: `Unit type ${r.label}`,
      value: `${r.count} units at ${usd.format(r.monthlyRent)}/month`,
      source: args.sources.unitMix?.label ?? "No source recorded",
    });
  });
  if (args.comps.saleCount > 0 && args.comps.saleMedianPricePerUnit !== null) {
    facts.push({
      id: "c.saleMedianPricePerUnit",
      label: `Median price per unit of ${args.comps.saleCount} sale comps`,
      value: usd.format(args.comps.saleMedianPricePerUnit),
      source: "Comps on this page (each with its own source)",
    });
  }
  for (const f of args.flags) {
    facts.push({
      id: `f.${f.id}`,
      label: `Red flag: ${f.title}`,
      value: f.detail,
      source: "Red-flag rules",
    });
  }
  return facts;
}

/** Numbers written in a string, normalized ("$1,300,000" → "1300000", "7.27%" → "7.27"). */
export function numbersIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const n = Number(m[0].replace(/,/g, ""));
    if (Number.isFinite(n)) out.push(String(n));
  }
  return out;
}

export function checkSummary(sentences: SummarySentence[], facts: Fact[]): CheckedSummary {
  const byId = new Map(facts.map((f) => [f.id, f]));
  const kept: CheckedSentence[] = [];
  let dropped = 0;
  for (const s of sentences) {
    const text = s.text.trim();
    const cited = [...new Set(s.fact_ids)].map((id) => byId.get(id));
    if (!text || cited.length === 0 || cited.some((f) => !f)) {
      dropped++;
      continue;
    }
    const citedFacts = cited as Fact[];
    const allowed = new Set(
      citedFacts.flatMap((f) => [...numbersIn(f.value), ...numbersIn(f.label)]),
    );
    if (numbersIn(text).some((n) => !allowed.has(n))) {
      dropped++;
      continue;
    }
    kept.push({ text, facts: citedFacts });
  }
  return { sentences: kept, dropped };
}
