# Phase 4B Plan — Prospects: broker ranking + long-hold owners

Track A · Branch `h4a/people-lists` → one PR into `main` · ADR-033.

## Why

Roadmap Phase 4 lists "broker ranking by real listings/closings" and "long-hold owners (15+ years) from
county data". Both can be built from data the workspace already holds, with no new accounts and no
outbound messages.

## What

| Piece                                                                                                        | Where                                               |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| Ranking + years-held logic (pure, unit-tested)                                                               | `src/features/h4a/prospects/rank.ts`                |
| Queries (signed-in user's session → RLS)                                                                     | `src/features/h4a/server/prospects.ts`              |
| Page `/w/[slug]/prospects` (real estate only): **Brokers** and **Long-hold owners** tabs                     | `src/app/w/[slug]/prospects/page.tsx`               |
| "Add to People" for a broker (contact with role Broker, via the existing `createContact`, duplicate-checked) | `src/features/h4a/components/add-broker-button.tsx` |
| Menu item "Prospects" (Find group)                                                                           | `src/lib/nav.ts`, `src/components/shell/icons.tsx`  |
| E2E (ranking, sort, add to People, owners + source + filters, 390 px, 404 for construction)                  | `e2e/h4a-prospects.spec.ts`                         |

- **Brokers:** one broker = one email, else one phone, else the same name at the same company. Measures: listings, buy-box matches (score ≥ 70), units, volume, in pipeline, closed (won deals from their listings). Sortable.
- **Long-hold owners:** properties whose `last_sale_date` is at least N years ago (default 15), with the owner, the sale date's **source** (`field_sources`), and the owner's do-not-call / unsubscribed / consent badges. Filters: years, minimum units, ZIP. Properties without a sale date are counted, not hidden.

No migration: everything is computed from existing tables.

## Out of scope

Skip tracing and county bulk data (need Sam's accounts), outreach sequences (behind the compliance gates and
Resend), saved prospect lists.
