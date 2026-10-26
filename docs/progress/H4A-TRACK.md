# Housing4All Track (Track A) — progress log

Branch `h4a/deal-engine` · plan in `docs/phases/PHASE-2A-PLAN.md` · rules in `docs/COLLABORATION.md` · ADRs in `docs/DECISIONS.md` (ADR-019 → ADR-025).

## Phase 2A checklist

- [x] Migrations (buy box, listings, events, inbound emails/addresses, alerts, imports, RPCs, demo seed) — 3 new files, additive only
- [x] Pure modules + unit tests (normalize/dedupe, scoring, parsers + placeholder fixtures, HTML, forward unwrap, signature, CSV, pipeline, alert email, county adapter)
- [x] Server layer (actions, queries, inbound webhook, Inngest function + inline fallback)
- [x] UI (Deal Finder list/detail/edit/new/import/paste/emails, Alerts, Settings → Buy box, Integrations inbound card, Today cards) — checked at 390px
- [x] RLS SQL suite (`supabase/tests/h4a_rls.sql`) + vitest wrappers + inbound webhook end-to-end + demo seed check
- [x] E2E: paste → sources → score → verify → promote → buy box re-score; manual dedupe + dismiss; CSV; 390px
- [x] CI DB + e2e job, ADRs, ACCOUNTS.md (Resend inbound + DNS), `.env.example`
- [ ] Keanu applies the 3 migrations to hosted → merge `origin/main` again → squash-merge → check prod

## Shared files touched

| File                                                                 | Change                                                                     | Why                                                       |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------- |
| `src/lib/nav.ts`                                                     | Deal Finder + Alerts no longer "Coming in P2"                              | They exist now                                            |
| `src/lib/supabase/proxy.ts`                                          | `/api/inbound`, `/api/inngest` added to public paths                       | Webhooks have no session (they verify signatures instead) |
| `src/app/w/[slug]/today/page.tsx`                                    | One import + one line rendering `H4aTodayCards` for real-estate workspaces | Today cards (2.8)                                         |
| `src/app/w/[slug]/settings/layout.tsx`                               | Real-estate workspaces get the "Buy box" tab (AZH tabs untouched)          | Settings → Buy box (2.1)                                  |
| `src/app/w/[slug]/settings/integrations/page.tsx`                    | Renders `InboundEmailCard` for real-estate workspaces                      | Forwarding address / Not connected (2.3) — Track A lane   |
| `src/lib/db/types.ts`                                                | Regenerated with `pnpm db:types` (additions only)                          | New tables/functions                                      |
| `package.json`, `pnpm-lock.yaml`                                     | `htmlparser2`                                                              | Email HTML → text + sanitizer                             |
| `tests/unit/misc.test.ts`                                            | Deal Finder / Alerts are no longer placeholders                            | Matches the nav change                                    |
| `scripts/rls-hosted-sql.mjs`                                         | Optional file argument (default unchanged)                                 | Prints the hosted-safe Deal Engine suite too              |
| `.github/workflows/ci.yml`                                           | New `db` job (local Supabase → `pnpm test:rls` → `pnpm e2e`)               | 2.10 — Track A owns CI files                              |
| `.env.example`, `README.md`, `docs/ACCOUNTS.md`, `docs/DECISIONS.md` | Phase 2A sections                                                          | Docs                                                      |

No AZH files changed. The Deal Engine migrations don't depend on any `*_azh_*` migration.

## Blockers

None for 2A. 2B needs Sam: real alert email samples, Resend + DNS, county data source decision (see the handoff).
