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
- [x] Hosted DB updated (2026-10-26): combined file `2026-10-h4a-phase-2a.sql` applied by a human in the SQL editor — live has 21 migrations incl. the 3 `h4a_deal_engine` ones (file was proven locally first on a copy of the 18-migration live state: applies once, guard stops a re-run, versions = filenames, `pnpm test:rls` 41/41, hosted-safe suites Phase 1 41/0, AZH 93/0, Phase 2A 73/0 with no leftovers)
- [x] `origin/main` merged in again (no-op) → CI green on `65756d9` (fast + DB/e2e jobs) → squash-merged as `3db7cb1` ([#4](https://github.com/Kickback13/Sam/pull/4))
- [x] Vercel production deploy `dpl_7NzriHTuVU2abbeUm7JKZEpPD5e3` **READY** in `yul1`, aliased to `housing4all-platform.vercel.app`; no runtime errors in the first hour
- [x] Live HTTP checks (2026-10-26): `GET /login` → **200** from `dpl_7NzriHTuVU2abbeUm7JKZEpPD5e3`; `GET /api/inbound/email` → **405**; unsigned `POST /api/inbound/email` → **503** `{"error":"Inbound email is not connected (RESEND_WEBHOOK_SECRET is not set)."}` (run by Michael from his Mac; the build sandbox can't reach `*.vercel.app`). Forwarded email stays Not connected until Sam's Resend inbound + DNS are set up.

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

## Phase 3A — property intelligence & deal analysis (branch `h4a/property-intel`)

Plan: `docs/phases/PHASE-3A-PLAN.md` · ADR-026, ADR-027.

- [x] Underwriting math + red flags (pure, unit-tested against a hand-checked example)
- [x] Prefill (price from the listing, units/sq ft from the property, sources kept) + source stamping on edit
- [x] Migrations: `20261027080000_h4a_property_intel` (scenarios, comps, RLS), `20261027080100_h4a_seed_analysis_demo` (Demo only) — additive
- [x] RLS suite `supabase/tests/h4a_analysis_rls.sql` (25 checks) + vitest wrapper
- [x] Analysis page `/w/[slug]/properties/[id]/analysis`: live results with formula + sources, red flags, scenarios, comps, phone key-numbers strip
- [x] PDF export (same calculator), AI summary (Not connected; citation check), property data card (Not connected)
- [x] Analyze page `/w/[slug]/analyze`: every analyzed property with key numbers and flags from its latest scenario
- [x] E2E: full flow + Analyze list + 404 outside real estate + 390px
- [x] Combined live-DB SQL file built and proven locally → human applies (21/21 verify) → merged (#9)

### Shared files touched (Phase 3A)

| File                                        | Change                                                       | Why                                    |
| ------------------------------------------- | ------------------------------------------------------------ | -------------------------------------- |
| `src/app/w/[slug]/properties/[id]/page.tsx` | "Analyze deal" button for real-estate workspaces             | Entry point to the analysis            |
| `src/lib/nav.ts`                            | Analyze no longer "Coming in P3" (placeholder entry removed) | `/w/[slug]/analyze` is a real page now |
| `tests/unit/misc.test.ts`                   | Analyze is no longer a placeholder                           | Matches the nav change                 |
| `src/lib/db/types.ts`                       | Regenerated (`pnpm db:types`), additions only                | New tables                             |
| `docs/DECISIONS.md`                         | ADR-026, ADR-027                                             | Track A decisions                      |

No AZH files changed. The 3A migrations depend only on Phase 1 + Phase 2A tables.

## Phase 4A — outreach foundation: compliance gates + newsletters (branch `h4a/outreach`)

Plan: `docs/phases/PHASE-4A-PLAN.md` · ADR-028. Used by both workspaces (Housing4All and AZH newsletters).

- [x] Compliance gates (email + SMS) and inbound STOP/START/HELP keywords — pure, unit-tested
- [x] Newsletter renderer (escaped, CAN-SPAM footer always added) + Resend batch adapter (Not connected; one-click unsubscribe headers)
- [x] Migrations: `20261028060000_h4a_outreach` (settings, do-not-send list, newsletters, send log, unsubscribe functions, RLS), `20261028060100_h4a_seed_outreach_demo` (Demo workspaces only) — additive
- [x] RLS suite `supabase/tests/h4a_outreach_rls.sql` (44 checks; 40 on hosted) + vitest wrapper
- [x] Outreach pages (newsletters, editor with live preview + audience check, do-not-send list), Settings → Outreach, public unsubscribe
- [x] Contact page "Can we reach them right now?" + "texted STOP" button
- [x] E2E: flow + contact gates/STOP + unsubscribe without login + 390px
- [x] Combined live-DB SQL file built and proven locally → human applies (40/40 verify) → merged (#11)

### Shared files touched (Phase 4A)

| File                                                    | Change                                                                  | Why                                      |
| ------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------- |
| `src/lib/nav.ts`                                        | Outreach is a real page (placeholder removed); added to the AZH nav too | Newsletters for both businesses          |
| `tests/unit/misc.test.ts`                               | Outreach no longer a placeholder; AZH nav has it                        | Matches the nav change                   |
| `src/components/settings/settings-nav.tsx`              | "Outreach" tab                                                          | Sender details + texting hours           |
| `src/app/w/[slug]/people/[id]/page.tsx`                 | Compliance card: Phase 1 note → `<ContactReachability>` (one line)      | Live gate results + record a STOP        |
| `src/lib/supabase/proxy.ts`                             | `/unsubscribe`, `/api/unsubscribe` are public                           | Unsubscribe must work without signing in |
| `src/lib/integrations.ts`                               | Resend purpose mentions newsletters                                     | Accurate Integrations page               |
| `src/lib/db/types.ts`                                   | Regenerated (`pnpm db:types`), additions only                           | New tables + functions                   |
| `docs/DECISIONS.md`, `docs/ACCOUNTS.md`, `.env.example` | ADR-028; Resend sending steps; `OUTREACH_EMAIL`                         | Track A decisions / Sam's setup steps    |

No AZH files changed. The demo seed adds sender details + one draft newsletter to `demo-azh` (data only).
The 4A migrations depend only on Phase 1 tables (contacts, activities, audit_log, workspaces).

## Phase 5A — one-time GoHighLevel import (branch `h4a/ghl-import`)

Plan: `docs/phases/PHASE-5A-PLAN.md` · ADR-029. Both workspaces (AZH first — its GHL is active; Housing4All when Sam reactivates it).

- [x] GHL client (read-only) + mapping, unit-tested incl. a round trip through the CSV transform
- [x] Migration `20261028090000_h4a_ghl_import` (`ghl_links`, Vault token functions) — additive
- [x] RLS suite `supabase/tests/h4a_ghl_rls.sql` (21 checks) + vitest wrapper
- [x] Settings → Integrations → GoHighLevel: connect (tested, stored in Vault), contact import (CSV engine), opportunity import with stage map, disconnect
- [x] E2E against a local GHL mock + admin-only + 390px
- [x] Combined live-DB SQL file built and proven locally → human applies (21/21 verify) → merged (#12)
- [ ] Real run on AZH's GHL (Michael/Sam paste the token after merge)

### Shared files touched (Phase 5A)

| File                                              | Change                                                       | Why                                     |
| ------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------- |
| `src/app/w/[slug]/settings/integrations/page.tsx` | "Connect and import →" link on the GoHighLevel card (admins) | Entry point (Track A owns Integrations) |
| `src/lib/integrations.ts`                         | GoHighLevel purpose: one-time import                         | Matches the plan                        |
| `playwright.config.ts`                            | `GHL_API_BASE` → local mock for e2e                          | E2E never calls GHL                     |
| `src/lib/db/types.ts`                             | Regenerated, additions only                                  | New table + functions                   |
| `docs/DECISIONS.md`, `docs/ACCOUNTS.md`           | ADR-029; GHL token steps                                     | Decisions / Sam's setup                 |

No AZH files changed; reuses `src/server/actions/imports.ts` without modifying it.

## Phase 6A — Housing4All Network (branch `h4a/network`)

Plan: `docs/phases/PHASE-6A-PLAN.md` · ADR-030.

- [x] Migration `20261029010000_h4a_network` (6 tables, RLS, guards, join/context/brand functions) — additive
- [x] RLS suite `supabase/tests/h4a_network_rls.sql` (43 checks: members see no CRM, moderation, joining, anon)
- [x] Member app `/n/[slug]`: feed, deals, post + comments, events + RSVP, directory, profile; join page; PWA (manifest, icons, service worker, install hint)
- [x] Team page `/w/[slug]/network`: invites, members + segments, posts moderation, events
- [x] Newsletter audience "Only Network members" (Outreach)
- [x] E2E: full team → member → team flow, install files, 390px
- [x] Combined live-DB SQL file built and proven locally → human applies (43/43 verify) → merged (#13)
- [ ] Sam: Resend SMTP in Supabase Auth (or Google sign-in) so outside members can receive sign-in emails

### Shared files touched (Phase 6A)

| File                                        | Change                                            | Why                            |
| ------------------------------------------- | ------------------------------------------------- | ------------------------------ |
| `src/lib/nav.ts`, `tests/unit/misc.test.ts` | Network is a real page (placeholder removed)      | `/w/[slug]/network`            |
| `src/app/page.tsx`                          | members without a workspace go to their Network   | Landing                        |
| `src/lib/supabase/proxy.ts`                 | `/n/<slug>/join/…`, manifest and icons are public | Invite + install without login |
| `e2e/fixtures/constants.ts`                 | an e2e user with no workspace (network member)    | Member-side e2e                |
| `src/lib/db/types.ts`                       | Regenerated, additions only                       | New tables + functions         |
| `docs/DECISIONS.md`, `docs/ACCOUNTS.md`     | ADR-030; SMTP note                                | Decisions / Sam's setup        |

No AZH files changed. The 6A migration depends only on Phase 1 tables.

## Phase 7A — AI receptionist (branch `h4a/receptionist`)

Plan: `docs/phases/PHASE-7A-PLAN.md` · ADR-031.

- [x] Routing rules, Twilio signature + TwiML, ElevenLabs webhook mapping — pure, unit-tested
- [x] Migration `20261102010000_h4a_receptionist` (settings, routes, tokens, calls, webhook functions) — additive
- [x] RLS suite `supabase/tests/h4a_receptionist_rls.sql` (24 checks)
- [x] Webhooks (signed only in production), call log + Setup page, "Test routing"
- [x] E2E with signed fake Twilio/ElevenLabs requests + 390px
- [x] Combined live-DB SQL file built and proven locally → human applied (24/0) → merged (#14)
- [ ] Sam: Twilio number + ElevenLabs agent (docs/ACCOUNTS.md)

### Shared files touched (Phase 7A)

| File                                                    | Change                                                    | Why                      |
| ------------------------------------------------------- | --------------------------------------------------------- | ------------------------ |
| `src/lib/nav.ts`, `tests/unit/misc.test.ts`             | Receptionist is a real page (placeholder removed)         | `/w/[slug]/receptionist` |
| `src/lib/supabase/proxy.ts`                             | `/api/receptionist` is public (token + signature checked) | Provider webhooks        |
| `playwright.config.ts`                                  | test-only Twilio/ElevenLabs secrets                       | E2E signs fake webhooks  |
| `src/lib/db/types.ts`                                   | Regenerated, additions only                               | New tables + functions   |
| `docs/DECISIONS.md`, `docs/ACCOUNTS.md`, `.env.example` | ADR-031; setup steps; env names                           | Decisions / Sam's setup  |

No AZH files changed. The 7A migration depends only on Phase 1 tables.

## Fix — per-workspace font loading (branch `h4a/brand-fonts`)

AZH pages on phones were slow to first paint: next/font preloaded Housing4All's two fonts on every page,
and AZH's fonts (`preload: false`) were only found after the stylesheet. Brand fonts are now self-hosted
(`public/fonts`, Google's own subset files, OFL) and each page preloads only its brand's fonts.

Lighthouse mobile (local, simulated): AZH Today 81 → 88–90 (FCP 1.8 s → 1.3 s), AZH Projects 86 → 95
(LCP 2.9 s → 2.1–2.4 s); Housing4All pages unchanged (88–94, run-to-run noise).

### Shared files touched

| File                                                                                                                                             | Change                                                | Why                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | ------------------------------------- |
| `src/app/layout.tsx`, `src/app/fonts.css` (new)                                                                                                  | next/font removed; `@font-face` for the 4 brand fonts | One loading path for every brand font |
| `src/lib/brand.ts`, `tests/unit/brand.test.ts`                                                                                                   | `FONTS[*].preload`, `brandFontPreloads()`             | Which files a brand preloads          |
| `src/components/brand-font-preloads.tsx` (new)                                                                                                   | `<link rel="preload">` per brand font                 | Hints must be in the HTML head        |
| `src/app/w/[slug]/layout.tsx`, `src/app/n/[slug]/(app)/layout.tsx`, `src/components/auth/auth-frame.tsx`, `src/app/unsubscribe/[token]/page.tsx` | one `<BrandFontPreloads>` line each                   | Preload the page's brand fonts        |
| `src/proxy.ts`, `next.config.ts`                                                                                                                 | `/fonts/*` skips the session proxy; cached immutably  | Fonts were redirected to /login       |

No AZH files changed. The public AZH request form (`/r/**`, Track B) loads its fonts on demand as before;
adding the one-line preload there is a Track B follow-up. No migrations.

## Phase 9A — security review + handover package (branch `h4a/handover`)

- [x] Security review `docs/SECURITY.md` (DB, app, dependencies, gaps, dashboard checklist)
- [x] Automated invariants `tests/rls/security-invariants.test.ts` (RLS + policies everywhere, workspace_id, no anon table grants, definer search_path, reviewed anon function allow-list, app_private not in the API, private buckets) — proven to fail on a probe table
- [x] `systeminformation` pinned to a patched release (pnpm override); other 2 advisories unreachable (documented)
- [x] `docs/RUNBOOK.md` (ship, migrations, backups/restore, access, key rotation, incidents, monthly check)
- [x] `docs/HANDOVER.md` (ordered account-transfer checklist) · `docs/TRAINING.md` (screen-by-screen guide)
- [ ] Sam/Keanu: work through HANDOVER.md and SECURITY.md §5

### Shared files touched (Phase 9A)

| File                                    | Change                                      | Why                        |
| --------------------------------------- | ------------------------------------------- | -------------------------- |
| `pnpm-workspace.yaml`, `pnpm-lock.yaml` | `overrides: systeminformation >=5.33.16 <6` | High advisory (transitive) |
| `CLAUDE.md`                             | Pointer to the four new docs                | Read-first list            |

No AZH files changed. No migrations.

## Phase 5B — automatic GoHighLevel import, one-way (branch `h4a/ghl-auto-import`)

Plan: `docs/phases/PHASE-5B-PLAN.md` · ADR-032.

- [x] Migration `20261103010000_h4a_ghl_auto_import` (`ghl_sync_settings`, `ghl_sync_state`, claim/finish functions) — additive
- [x] Change detection + opportunity planning — pure, unit-tested
- [x] Runner, Import now, background run (`after()`), Automatic import card
- [x] RLS suite `supabase/tests/h4a_ghl_sync_rls.sql` (26 checks)
- [x] E2E against the GHL mock (first run, no-change, GHL change vs local edit, background run, 390 px)
- [x] Combined live-DB SQL file built and proven locally → applied to live by Claude via the Supabase connector (Keanu approved, 2026-11-03) → verify on live 26/0, no leftovers → merge

### Shared files touched (Phase 5B)

| File                                    | Change                                            | Why                     |
| --------------------------------------- | ------------------------------------------------- | ----------------------- |
| `src/app/w/[slug]/layout.tsx`           | one line: `<GhlAutoImportKick>` for owners/admins | Background run when due |
| `src/lib/db/types.ts`                   | Regenerated, additions only                       | New tables + functions  |
| `docs/DECISIONS.md`, `docs/ACCOUNTS.md` | ADR-032; setup step                               | Decision / Sam's setup  |

No AZH files changed (the GHL feature serves both workspaces from `src/features/ghl`). The 5B migration depends only on 5A.

## Phase 4B — Prospects: broker ranking + long-hold owners (branch `h4a/people-lists`)

Plan: `docs/phases/PHASE-4B-PLAN.md` · ADR-033. **No migration.**

- [x] Ranking + years-held logic — pure, unit-tested
- [x] `/w/[slug]/prospects` (Brokers, Long-hold owners), Add to People, menu item
- [x] E2E (ranking, sort, add to People, owners with source + filters, 390 px, real-estate only)

### Shared files touched (Phase 4B)

| File                                                                          | Change                       | Why                 |
| ----------------------------------------------------------------------------- | ---------------------------- | ------------------- |
| `src/lib/nav.ts`, `src/components/shell/icons.tsx`, `tests/unit/misc.test.ts` | "Prospects" menu item + icon | New page            |
| `docs/DECISIONS.md`, `docs/TRAINING.md`                                       | ADR-033; user guide section  | Decision / training |

No AZH files changed.

## Phase 3B — property data, RentCast (branch `h4a/property-data`)

Plan: `docs/phases/PHASE-3B-PLAN.md` · ADR-034.

- [x] Migration `20261105010000_h4a_property_data` (pulls table, Vault key, monthly cap) — additive
- [x] RentCast client + mapping (unit-tested), fetch on the analysis page, settings page
- [x] RLS suite `supabase/tests/h4a_property_data_rls.sql` (21) · e2e against a local mock
- [x] Live DB: applied with the verify (see PR) · key not added yet (Sam's account, his plan choice)

Shared files: `src/lib/integrations.ts` (label), `src/app/w/[slug]/settings/integrations/page.tsx` (link), `playwright.config.ts` (mock URL), `src/lib/db/types.ts` (regenerated).

## Automatic comps (branch `h4a/comps`)

ADR-042. **No migration**, and no outside requests.

- [x] Suggestion + ranking module, pure and unit-tested (`src/features/h4a/comps/suggest.ts`, 13 tests)
- [x] Server loader (`comp-suggestions.ts`) + `addSuggestedComps` action (recomputes by key, audited)
- [x] "Suggested comps" on the analysis page (Add / Add all, source + as-of, match score, distance)
- [x] E2E: workspace suggestions with sources, unsourced/old sales skipped, nothing saved until added; RentCast comparable from the saved answer; 390 px

Shared files: `docs/DECISIONS.md` (ADR-042), `docs/TRAINING.md`.

## Spanish message templates (branch `h4a/spanish-templates`)

ADR-043 · migration `20261112010000_h4a_spanish_templates` (additive).

- [x] Spanish version per sequence step; chosen by `contacts.language` (`stepForLanguage`, unit-tested), switchable, flagged when missing
- [x] Spanish opt-out / start / help words (DB `sms_receive` + `classifyInboundSms`), Spanish HELP reply setting
- [x] RLS suite `supabase/tests/h4a_spanish_rls.sql` (21) · e2e (sequences, texting webhook, 390 px)
- [x] Live DB: applied 2026-11-05 with `docs/db-updates/2026-11-spanish-templates.sql`; verify on live 21 passed / 0 failed / 0 leftovers

Shared files: `src/lib/db/types.ts` (regenerated), `docs/DECISIONS.md`, `docs/TRAINING.md`, `docs/ACCOUNTS.md`.

## Spanish booking page (branch `h4a/spanish-booking`)

ADR-044 · migration `20261113010000_h4a_spanish_booking` (additive: a new 8-argument overload).

- [x] `/b/[slug]` and `/booked` in English or Spanish (`?lang=`, else Accept-Language), with an English / Español switch
- [x] Spanish errors, dates (es-US) and calendar-file description; i18n module unit-tested
- [x] New contacts from a Spanish booking are marked Spanish; existing contacts keep their language
- [x] RLS suite `supabase/tests/h4a_spanish_booking_rls.sql` (10) · e2e (Spanish browser, switch, Spanish error, contact language, 390 px)
- [x] Live DB: applied 2026-11-05 with `docs/db-updates/2026-11-spanish-booking.sql`; verify on live 10 passed / 0 failed / 0 leftovers

## Spanish newsletters (branch `h4a/spanish-newsletters`)

ADR-045 · migration `20261114010000_h4a_spanish_newsletters` (additive columns).

- [x] Spanish version of an issue (editor section, preview switch, audience count of Spanish speakers)
- [x] Per-recipient version at send time (`newsletterVersion`, unit-tested); Spanish CAN-SPAM footer; `newsletter_sends.language`
- [x] Unsubscribe page in Spanish (`?lang=es` from the email, else the browser's language)
- [x] RLS suite `supabase/tests/h4a_spanish_newsletters_rls.sql` (12) · e2e (Spanish version, count, preview, Spanish unsubscribe, 390 px)
- [x] Live DB: applied 2026-11-05 with `docs/db-updates/2026-11-spanish-newsletters.sql`; verify on live 12 passed / 0 failed / 0 leftovers
