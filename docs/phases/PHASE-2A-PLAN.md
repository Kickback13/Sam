# Phase 2A Plan — Deal Engine (the parts that don't need Sam yet)

Track A (Housing4All) · Branch `h4a/deal-engine` → one PR into `main` · rules in `docs/COLLABORATION.md`.

## Why 2A

Phase 2 needs three things from Sam we don't have yet: real saved-search alert email samples, his buy box,
and a decision on paid data APIs. 2A builds everything that works without them, with clean plug-in points.
2B adds his real email formats and the county data hookup.

## Ground rules (from the brief)

- Never connect to the hosted Supabase project. Migrations are listed in the PR; Keanu applies them.
- The PR is not merged until Keanu confirms the hosted database has the new migrations.
- Vercel previews use the production database — test only on the local stack.
- New migrations only, named `<UTC timestamp>_h4a_<topic>.sql`, later than `20261020060200`, additive only.

## Scope → where it lives

| Brief item                                 | Where                                                                                                    |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| 2.1 Buy box                                | `h4a_buy_boxes` · Settings → Buy box · re-scores open listings on save                                   |
| 2.2 Deal Finder                            | `h4a_listings` + `h4a_listing_events` · `/w/[slug]/deal-finder` (list, detail, history, promote)         |
| 2.3 Manual / CSV / forwarded email / paste | `/deal-finder/new`, `/deal-finder/import`, `POST /api/inbound/email`, `/deal-finder/paste`               |
| 2.4 Scoring                                | `src/features/h4a/scoring/score.ts` (pure, unit-tested); stored with the buy-box version it used         |
| 2.5 Verification queue                     | listing verification status + "Mark verified" (note + source) · `CountyRecordsAdapter` (Not connected)   |
| 2.6 Alerts                                 | `h4a_alerts` · `/w/[slug]/alerts` · Today "New matches" · owner email behind a flag (off, Not connected) |
| 2.7 Background jobs                        | Inngest function for inbound email; user-triggered paths stay synchronous (ADR)                          |
| 2.8 Today cards                            | New matches (7 days), Needs review, Verification queue, Set your buy box                                 |
| 2.9 Demo data                              | `*_h4a_seed_demo.sql`, Demo workspace only                                                               |
| 2.10 CI                                    | new `db` job: local Supabase stack → `pnpm test:rls` + Playwright e2e                                    |

## Out of scope

AI parsing, paid data APIs, SMS, any email except to the workspace owner (built, left off), GoHighLevel, AZH routes.
