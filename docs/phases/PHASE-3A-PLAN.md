# Phase 3A Plan — Property intelligence & deal analysis (the parts that don't need Sam yet)

Track A (Housing4All) · Branch `h4a/property-intel` → one PR into `main` · rules in `docs/COLLABORATION.md`.

## Why 3A

Phase 3 (`docs/ROADMAP.md`) needs two things only Sam can give: a paid property-data service (ownership,
mortgage, foreclosure, tax: ATTOM vs RentCast vs PropertyRadar) and an Anthropic API key on his account
for the AI summary. 3A builds everything that works without them, with clean plug-in points, the same
way 2A did for the Deal Engine. 3B connects the data service and the AI key once Sam picks.

## Ground rules (same as 2A)

- Never connect to the hosted Supabase project. Migrations are listed in the PR; a human applies them
  through the combined SQL file, and the PR isn't merged until that's done.
- Vercel previews use the production database — test only on the local stack.
- New migrations only, named `<UTC timestamp>_h4a_<topic>.sql`, later than `20261026220000`, additive only.
- Every number shows where it came from. Manual inputs say "Entered by {user}". Missing inputs show
  "Needs input" — the app never fills in an assumption on its own.

## Scope → where it lives

| Item                                | Where                                                                                                                                                                                        |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1 Underwriting calculator         | `src/features/h4a/underwriting/math.ts` (pure, unit-tested) · saved scenarios in `h4a_underwriting` · `/w/[slug]/properties/[id]/analysis`                                                   |
| 3.2 Every number traces to inputs   | each output carries its formula and the inputs it used; each input carries its source (property field, listing field, comp, or "Entered by")                                                 |
| 3.3 Comps                           | `h4a_comps` (sale and rent comps, source + date required) · entered by hand or CSV now; the data-service adapter fills them in 3B                                                            |
| 3.4 Red flags                       | `src/features/h4a/underwriting/flags.ts` (pure): DSCR, expense ratio, Prop 13 tax reset, vacancy, price/unit vs comps, unverified or mismatched facts, missing inputs                        |
| 3.5 Ownership / mortgage / tax data | `PropertyDataAdapter` interface + **Not connected** card on the property page · ADR-026 compares ATTOM, RentCast, PropertyRadar (Sam decides)                                                |
| 3.6 AI summary with citations       | `AiSummaryAdapter` (Anthropic) · **Not connected** until `ANTHROPIC_API_KEY` is set on Sam's account · every sentence must cite field ids, validated server-side before it's shown · ADR-027 |
| 3.7 PDF export                      | `pdf-lib` (already used by AZH) · built from the same `math.ts` output as the screen so they can't disagree                                                                                  |
| 3.8 Demo data                       | `*_h4a_seed_analysis_demo.sql`, Demo workspace only                                                                                                                                          |
| 3.9 Tests                           | unit (math, flags, citations), RLS SQL suite additions, e2e (enter inputs → numbers + sources → flags → save → PDF; 390px)                                                                   |

## Underwriting model

Inputs (each optional; outputs that need a missing input show "Needs input"):

- Price, units, building sqft — from the property (or its promoted listing), with their sources.
- Income: monthly rent per unit type (count × rent) or total monthly rent; other monthly income; vacancy %.
- Expenses (annual): property tax (as a rate of price, because California reassesses at sale — Prop 13),
  insurance, utilities, repairs & maintenance, management (% of collected income), payroll, other;
  or a single expense ratio.
- Financing: loan-to-value %, interest rate %, amortization years, closing costs.

Outputs: price/unit, price/sqft, gross scheduled rent, vacancy loss, effective gross income, operating
expenses, expense ratio, NOI, cap rate, GRM, loan amount, annual debt service, DSCR, cash flow,
cash invested, cash-on-cash, break-even occupancy.

Money is shown with `formatCurrency`; amounts are rounded to cents; the loan payment uses the standard
amortization formula.

## Out of scope for 3A

Calling any paid data API, AI calls (built, left Not connected), automatic comps, AZH routes, outreach.

## Done when

- Analysis page works on Demo data end to end and at 390px; every output shows formula + input sources.
- Red flags fire on the documented rules (unit-tested).
- PDF numbers match the screen (same module; e2e checks a few values).
- RLS: analysis and comps are workspace-isolated; viewers read only; tests prove it.
- Format, lint, typecheck, unit, RLS, e2e, build, CI green. Combined SQL file built and proven locally.
