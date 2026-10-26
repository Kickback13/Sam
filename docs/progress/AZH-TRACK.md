# AZH Track (Track B) — progress log

Branch `azh/track` · rules in `docs/COLLABORATION.md` · ADRs in `docs/DECISIONS-AZH.md`.

## Checklist

### Part 1: core

- [x] 1. Collaboration doc — `docs/COLLABORATION.md` + pointer in `CLAUDE.md` (docs only; format check)
- [x] 2. Demo workspace for AZH (`demo-azh`) — migration `20261014060000_azh_demo_workspace.sql` (construction, AZH brand, Projects pipeline, members copied from `demo`). Tested by `db:reset` + RLS suite.
- [x] 3. Project details — `azh_projects` (1:1 deal), `/w/[slug]/projects/[id]` with 7 link tabs, board card office + services via context hook, drawer “Project page →”. Tested: RLS suite, `e2e/azh-projects.spec.ts`.
- [x] 4. Estimates — line items, markup/tax computed in DB (parity with `estimates/math.ts`), status dates, “Duplicate to revise”, PDF via `pdf-lib` with both offices + CSLB/“License # pending”. Tested: unit (math, PDF), RLS parity, e2e (live total $2,026.77, PDF download, v2).
- [x] 5. AZH settings — `/w/[slug]/settings/azh` (construction only): CSLB, service list, office task assignees, Fallbrook ZIP list (default in migration, AZH-004), embed snippet. Tested: unit (routing, zip parsing), RLS (admin-only), e2e.
- [x] 6. Public homeowner request form — `/r/[slug]` (+ `/embed`, `/thanks`), EN/ES, 5 photos to an upload-only bucket, unchecked TCPA consent with stored wording, honeypot + DB rate limits, intake trigger creates contact/request/Lead/project/task/activities. Tested: unit (schema, i18n), RLS (anon insert-only, no reads, rate limit, dedupe), `e2e/azh-request-form.spec.ts`.
- [x] 7. Requests inbox — `/w/[slug]/requests` with search + office/service/status filters, detail drawer (contact, consent evidence, photos via signed URLs, activity), assign / status / office, log call (→ contacted), “Convert to project” (Lead → Estimate). Tested: `e2e/azh-requests.spec.ts`.
- [x] 8. Files & photos — private `azh-files` bucket (workspace RLS, 10 MB, allow-list), `azh_files` metadata, `FilesPanel` (image previews via signed URLs, document list, delete) on the project Files tab and in the request drawer. Tested: unit (allow-list, name sanitizing), RLS (isolation, anon can't read/upload), `e2e/azh-files.spec.ts`.
- [x] 9. AZH Today cards — new requests (7 days), estimates awaiting reply (+ $ out), projects in progress, estimate visits this week, team tasks due; one-line hook in the Today page. Tested: `e2e/azh-today.spec.ts` (counts from seeded rows; hidden on real estate).

### Part 2: scheduling and budget

- [x] 10. Estimate visit booking — “Schedule visit” dialog (date/time in San Diego time, length, office, estimator, address, notes) from a request or project; double-booking warning with “Book anyway”; request → estimate scheduled (trigger); `/w/[slug]/schedule` week view per office with double-booked badges, done/cancel. Internal only. Tested: unit (conflicts, DST-safe time), RLS (visit → status), `e2e/azh-schedule.spec.ts`.
- [x] 11. Project schedule — milestones (name, planned date, done date, status; late badge; done date set by trigger) on the project Schedule tab with site visits; “Upcoming milestones” on `/schedule`. Tested: RLS (viewer can't add, isolation), `e2e/azh-milestones.spec.ts`.
- [x] 12. Project budget — budget lines (inline edit), costs (date, vendor, amount, category, optional receipt in `azh-files`), budget vs. actual with variance + % used (unbudgeted spend shown, not hidden), change orders (auto-numbered, pending/approved/declined, credits allowed); approved COs add to the contract value and the deal value (trigger). Math in `budget/math.ts`. Tested: unit, RLS (deal value sync), `e2e/azh-budget.spec.ts`.
- [x] 13. Demo data — `20261014060600_azh_seed_demo.sql`, `demo-azh` only (idempotent): 4 companies, 12 contacts (Sample/Example, 555-01xx, @example.com, 2 Spanish, demo consent records), 9 projects across every stage, 6 estimates (draft/sent/accepted/declined + a v2 revision), 6 requests in every status, 4 visits, 9 milestones, budgets/costs (incl. unbudgeted spend) and change orders (incl. a credit), 4 tasks. Verified: 0 AZH rows outside demo workspaces after reset; RLS suite green.
- [x] 14. End-to-end tests — `e2e/azh-flow.spec.ts` runs the whole chain (public form + photo → inbox → visit → convert → estimate $3,829.17 → PDF → Bid Sent → change order → budget vs actual). `e2e/azh-mobile.spec.ts`: every AZH screen at 390px, no sideways scroll (budget rows reworked for phones after reviewing screenshots). Lighthouse (mobile) accessibility: public form EN/ES/embed/thanks **100**; AZH Today/Requests/Schedule/Project budget/estimates **100** (Today was 96 → fixed tap-target size).
- [x] 15. Final review pass + handoff — lane check clean, diff re-read (fixed linked-property bug + added e2e), every check re-run green; handoff below and in the PR.

## Follow-ups (overnight run)

- [x] A1. Lock down form photo uploads — `POST /r/[slug]/upload` + `azh_issue_upload_tickets()` (types, 10 MB, same IP/phone/workspace limits as submits) → signed upload URLs; broad anon insert policy dropped, Storage only accepts live ticket paths; intake requires photos ticketed to the same phone (migration `20261020060100`, AZH-013). Tested: RLS suite 90/0 (random-path upload refused, ticketed upload ok, bad type/size/count/phone/real-estate refused, wrong-phone photo refused, tickets unreadable), e2e (form + photo still works; route validation; direct Storage upload refused; full chain).
- [x] A2. Office changes follow through — trigger `azh_requests_office_sync` (migration `20261020060000`) moves the linked project's office and logs a system activity on the project. Tested: RLS suite (+3 assertions, 81/0), `e2e/azh-requests.spec.ts` (office change → project office + activity).
- [x] A3. Clean up unused uploads — admin-only button in Settings → AZH; `azh_unused_intake_photos()` (admin-checked, RLS) lists photos > 24 h old not on any request; files removed via the Storage API; old tickets pruned; shows how many were removed (migration `20261020060200`, AZH-014). Tested: RLS (+3: lists only the orphan; agents refused), `e2e/azh-cleanup.spec.ts` (removes 1 of 2, keeps the attached one; second run “Nothing to clean up”; hidden for agents).
- [x] A4. Follow-ups handoff — every check re-run green (unit 108, RLS 32 incl. AZH SQL 93/0, e2e 18/18, build); report below and in the PR.

Plans:

- A3: admin-checked invoker RPC lists old unreferenced intake objects → server action deletes via Storage API + prunes tickets → admin-only button with count → RLS + e2e.

- A1: tickets table + SECURITY DEFINER RPC with the submit limits → server route issues signed upload URLs → replace the anon insert policy with a ticket-gated one → intake trigger checks ticket + phone → RLS + e2e.

- A2: trigger on `azh_requests` office update → update `azh_projects.office` when different → `system` activity (SECURITY DEFINER, since users can't insert system activities) → RLS + e2e tests.

## Office assignees (2026-10-26)

- [x] Several people per office get every new request — migration `20261026220000_azh_office_assignees.sql` (arrays + backfill, members-only validation, old single columns kept in sync, intake creates one task per assignee / one unassigned task when empty, request owner = first assignee), Settings → AZH checkbox list per office with a plain-words summary (AZH-015). Tested: AZH SQL suite **100/0** (+7: agent can't change, members only, dedupe + single-column sync, legacy single write, N tasks, empty → 1 unassigned, owner), unit (list validation), `e2e/azh-assignees.spec.ts` (2 assignees → form → each sees one task). Full suite: unit 229, RLS 41, e2e 24/24.
- [ ] Human applies `2026-10-azh-office-assignees.sql` to the live DB → merge → deploy → Keanu invites Sam and Norma and picks them in Settings → AZH.

## Done

## Blockers

None. (Docker wasn't running initially; starting `dockerd` once worked, so all DB/RLS/e2e tests ran.)

## Shared files touched

| File                                       | Change                                                            | Why                                                              |
| ------------------------------------------ | ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| `CLAUDE.md`                                | +1 line pointing to `docs/COLLABORATION.md`                       | Requested in §2                                                  |
| `package.json`                             | `pdf-lib` dependency; `db:start` no longer excludes `storage-api` | Estimate PDFs; photo/file uploads need Storage locally (AZH-011) |
| `pnpm-lock.yaml`                           | regenerated by `pnpm add pdf-lib`                                 | —                                                                |
| `vitest.config.mts`                        | unit `include` + `src/features/**/*.test.ts`                      | Unit tests beside AZH code                                       |
| `src/lib/db/types.ts`                      | regenerated (`pnpm db:types`), additions only                     | New AZH tables/RPCs                                              |
| `src/components/pipeline/deal-card.tsx`    | 1 import + `useDealCardExtra()` + `{extra}`                       | Board card shows office + services                               |
| `src/components/pipeline/deal-drawer.tsx`  | “Project page →” link when construction                           | Reach the project page from the board                            |
| `src/app/w/[slug]/pipeline/page.tsx`       | fetch card extras for construction + wrap board in provider       | Feeds the card hook                                              |
| `src/components/settings/settings-nav.tsx` | optional `extraTabs` prop                                         | AZH tab only for construction                                    |
| `src/app/w/[slug]/settings/layout.tsx`     | passes `AZH_SETTINGS_TABS` for construction                       | Same                                                             |

## Decisions

See `docs/DECISIONS-AZH.md`.

## What we need from Sam

See handoff §9 below.

## Task notes

### Tasks 2–5 (schema, projects, estimates, settings)

Plan: (1) all AZH tables in additive `*_azh_*.sql` migrations with RLS; (2) money math in DB + mirrored pure TS module; (3) project page with URL tabs reusing tasks/activity components; (4) board/settings hook-ins as optional context/props; (5) PDF via pdf-lib in a route handler.

Self-review:

- [x] Lane check — only lane files + the shared files listed above.
- [x] No old migration edited; every new table has RLS + tests (`supabase/tests/azh_rls.sql`, 78 assertions).
- [x] No secrets; no fake data outside demo/e2e workspaces (e2e CSLB value is `TEST-0000`, local only).
- [x] 390px: tabs scroll horizontally, estimate lines stack into 2-column cards, forms single-column.
- [x] Empty/error states: “No estimates yet”, locked-version notice, settings “not initialized” notice, friendly DB errors.
- [x] Housing4All screens unchanged (card hook returns null outside construction boards; Phase 1 smoke + mobile e2e still pass).

### Task 6 (public request form)

Plan: (1) insert-only `azh_intake` + SECURITY DEFINER trigger; (2) `azh_public_form()` RPC for display data; (3) browser uploads photos to `azh-intake` under a random path; (4) server action validates (Zod), drops honeypot, hashes IP for rate limiting, inserts as anon; (5) EN/ES dictionary, thank-you + embed routes.

Self-review: lane ✔ (routes `/r/**`, feature folder, 2 shared one-liners listed); RLS ✔ (anon can only insert; no select on intake/requests/buckets; tested); no secrets ✔; 390px ✔ (single column, full-width submit); errors honest + focused (`role=alert`, per-field messages EN/ES); H4A unchanged ✔ (headers change only exempts `/r/*/embed`).

Note: my own (unmerged, never applied to hosted) AZH migrations were adjusted during development (RPC arg defaults, ZIP-replace RPC). Pre-existing migrations are untouched.

# AZH TRACK HANDOFF

## 1. What was built (by checklist number)

1. **Collaboration doc** — `docs/COLLABORATION.md` (two tracks, lanes, shared-file + migration rules, "never merge Track B without Keanu's review"); one-line pointer in `CLAUDE.md`.
2. **AZH Demo workspace** — `demo-azh` (is_demo, construction, AZH brand, own Projects pipeline). Members of `demo` are copied in with the same role.
3. **Project details** — `azh_projects` (1:1 with the deal): job address/ZIP or linked property, service types, office, source, estimate total (automatic), contract value, bid/start/target/completed dates, project lead, notes. Project page `/w/[slug]/projects/[id]` with tabs Overview · Estimates · Files & Photos · Schedule · Budget · Tasks · Activity. Board cards show office + services + value; the deal drawer links to the project page.
4. **Estimates** — line items, markup %, tax %, totals to the cent (computed in the database; same rules in a tested TS module), draft/sent/accepted/declined with dates, "Duplicate to revise" versions, **Download PDF** (AZH branding, both offices + phones, CSLB number or "License # pending"). Download only.
5. **AZH settings** — Settings → AZH (construction only): CSLB number, editable service list, office task assignees, Fallbrook ZIP list (default North County list in a migration, AZH-004), copy-paste embed snippet.
6. **Public request form** — `/r/azh-builders` (works for any construction workspace slug), no login, English/Spanish, up to 5 photos, unchecked TCPA consent with stored wording/source/time, honeypot + per-IP/per-phone/per-workspace rate limits, server + DB validation. Anon can only INSERT into `azh_intake`; a SECURITY DEFINER trigger creates/merges the contact (homeowner), the request, a Lead deal + project row, a task for the routed office and activities. Photos go to an upload-only bucket under a random path. Thank-you page EN/ES, iframe version `/r/<slug>/embed`. No automatic replies.
7. **Requests inbox** — filters (office, service, status + search), detail drawer with photos, consent evidence and activity; assign, change status/office, log call, "Convert to project" (Lead → Estimate).
8. **Files & photos** — private `azh-files` bucket (workspace RLS, 10 MB, type allow-list), previews, PDF/doc uploads, delete; on the project page and in the request drawer.
9. **AZH Today** — 5 real-data cards: new requests (7 days), estimates awaiting reply, projects in progress, estimate visits this week, tasks due.
10. **Estimate visit booking** — internal only, from a request or project; date/time (San Diego time), office, estimator, address, notes; double-booking warning with "Book anyway"; request → "estimate scheduled"; week view per office at `/w/[slug]/schedule`.
11. **Project schedule** — milestones (name, planned date, done date, status, late badge) + "Upcoming milestones".
12. **Project budget** — budget lines, cost entries (date, vendor, amount, category, optional receipt), budget vs. actual with variance, change orders (pending/approved/declined, credits allowed); approved ones add to the contract value and the deal value.
13. **Demo data** — fictional Sample/Example records in `demo-azh` only (projects in every stage, estimates incl. a revision, requests in every status, visits, milestones, budgets, change orders, tasks).
14. **End-to-end tests** — the full chain in one spec, a 390px pass over every AZH screen, Lighthouse accessibility.
15. **Final review pass** — lane check, re-read of the diff (fixed: project form showed the deal's property instead of the project's), all checks re-run.

## 2. How to see it (local)

```bash
pnpm install
pnpm db:start            # now also starts storage-api (needed for photos/files)
pnpm db:reset            # applies all migrations incl. AZH + demo data
pnpm dev                 # http://localhost:3000
```

- Public form (no login): http://localhost:3000/r/azh-builders (or `/r/demo-azh`), `?lang=es` for Spanish, `/embed` for the iframe.
- Signed-in screens: sign in (magic link via Mailpit http://127.0.0.1:54324, or `ENABLE_TEST_PASSWORD_LOGIN=true` with a local user), then add yourself to **`demo-azh`** (e.g. `insert into workspace_members (workspace_id, user_id, role) select id, '<your user id>', 'admin' from workspaces where slug = 'demo-azh';`). Open `/w/demo-azh/today`, `/requests`, `/schedule`, `/pipeline` → a card → "Project page →", and Settings → AZH.

## 3. Tests run and results

| Check                                              | Result                                                                                                                                                                                                                                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm format:check`, `pnpm lint`, `pnpm typecheck` | pass                                                                                                                                                                                                                                                                            |
| `pnpm test` (unit)                                 | **108 / 108** (13 files; 39 new AZH tests: estimate math, budget/variance/change orders, ZIP routing, double-booking, San Diego time/DST, form validation + EN/ES, file allow-list, PDF)                                                                                        |
| `pnpm test:rls`                                    | **32 / 32** — includes `supabase/tests/azh_rls.sql` **78 / 0** (isolation on every AZH table + both buckets, viewer/admin rules, anon insert-only intake, anon can't read any bucket, rate limit, dedupe, estimate-total parity, deal-value sync) and the existing suite 42 / 0 |
| `pnpm e2e`                                         | **15 / 15** (8 new AZH specs incl. the 9-step chain `e2e/azh-flow.spec.ts` and `e2e/azh-mobile.spec.ts` at 390px); Phase 1 smoke + mobile still pass                                                                                                                            |
| `pnpm build`                                       | pass                                                                                                                                                                                                                                                                            |
| Lighthouse (mobile) accessibility                  | public form EN / ES / embed / thanks **100**; AZH Today, Requests, Schedule, project Budget, Estimates **100**                                                                                                                                                                  |
| GitHub CI on PR                                    | green                                                                                                                                                                                                                                                                           |

## 4. Shared files touched (and why)

| File                                       | Change                                                                                                         | Why                                                       |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `CLAUDE.md`                                | +1 line → `docs/COLLABORATION.md`                                                                              | Requested                                                 |
| `package.json`, `pnpm-lock.yaml`           | `pdf-lib` dep; `db:start` no longer excludes `storage-api`                                                     | Estimate PDFs; uploads need Storage locally (AZH-011)     |
| `vitest.config.mts`                        | unit include `src/features/**/*.test.ts`                                                                       | Tests beside AZH code                                     |
| `src/lib/db/types.ts`                      | regenerated (`pnpm db:types`), additions only                                                                  | New tables/RPCs                                           |
| `src/lib/nav.ts`                           | Requests no longer "coming in 8"; + Schedule item (construction)                                               | New pages                                                 |
| `tests/unit/misc.test.ts`                  | "Requests is a phase-8 placeholder" now asserts Community (still phase 8) + Requests resolves to the real page | Behavior intentionally changed; coverage kept             |
| `src/components/pipeline/deal-card.tsx`    | 1 import + `useDealCardExtra()` + `{extra}`                                                                    | Board card office/services (context hook, null elsewhere) |
| `src/components/pipeline/deal-drawer.tsx`  | "Project page →" link for construction                                                                         | Reach the project page                                    |
| `src/app/w/[slug]/pipeline/page.tsx`       | fetch card extras (construction) + provider                                                                    | Feeds the card hook                                       |
| `src/components/settings/settings-nav.tsx` | optional `extraTabs` prop                                                                                      | AZH tab only for construction                             |
| `src/app/w/[slug]/settings/layout.tsx`     | passes the AZH tab for construction                                                                            | Same                                                      |
| `src/app/w/[slug]/today/page.tsx`          | 1 import + 1 line `<AzhTodayCards>`                                                                            | AZH Today                                                 |
| `src/lib/supabase/proxy.ts`                | `/r` added to public paths                                                                                     | Form needs no login                                       |
| `next.config.ts`                           | DENY framing everywhere except `/r/<slug>/embed` (`frame-ancestors *`)                                         | Embeddable form (AZH-012)                                 |
| `tests/rls/azh-sql-suite.test.ts` (new)    | runs `supabase/tests/azh_rls.sql` in `pnpm test:rls`                                                           | RLS tests run with the existing command                   |

No Track A files, CI workflow files, Settings → Buy box/Integrations or `/api/inbound/*` were touched.

## 5. New migrations (in order) — **Must be applied to hosted by Keanu AFTER merge**

1. `20261014060000_azh_demo_workspace.sql` — `demo-azh` workspace, Projects pipeline + stages, integration rows, members copied from `demo`.
2. `20261014060100_azh_core.sql` — `azh_settings`, `azh_zip_routes` (+ default Fallbrook ZIPs, init trigger on new construction workspaces), `azh_projects`, `azh_estimates` + `azh_estimate_items` (DB-computed totals, status dates, project estimate_total), RPCs `azh_save_estimate`, `azh_duplicate_estimate`, `azh_replace_fallbrook_zips`; RLS.
3. `20261014060200_azh_requests.sql` — `azh_requests`, insert-only `azh_intake` + SECURITY DEFINER processing trigger, `azh_public_form()` RPC, `azh-intake` bucket (anon upload-only) + policies; RLS.
4. `20261014060300_azh_files.sql` — `azh_files` + `azh-files` bucket (10 MB, allow-list) + workspace policies.
5. `20261014060400_azh_visits.sql` — `azh_visits` + request-status trigger; RLS.
6. `20261014060500_azh_schedule_budget.sql` — `azh_milestones`, `azh_budget_lines`, `azh_costs`, `azh_change_orders`, deal-value sync triggers; RLS.
7. `20261014060600_azh_seed_demo.sql` — fictional sample data in `demo-azh` only (idempotent).

All additive (no table/column/policy/function renamed or dropped; no existing migration edited). They add one trigger on `workspaces` (construction only) and grant `usage` on `app_private` to `anon` (still not exposed via the Data API). Track A has **no** migrations on any branch yet, so there is no out-of-order concern today; if Track A ships later-timestamped migrations to hosted first, these AZH files don't depend on them and can be applied out of order (`supabase db push --include-all`). Regenerate types after applying.

## 6. Merge readiness

- `main` has not moved since the branch was cut → **no conflicts**.
- **CI green** on the PR (lint, typecheck, unit, build).
- Draft → Ready for review. **Do not merge without Keanu's review.**

## 7. Blockers and what I tried

None blocking. Docker wasn't running at first; starting `dockerd` once worked, so DB, RLS and e2e tests all **ran** locally.

## 8. Decisions made

See `docs/DECISIONS-AZH.md` (AZH-001 … AZH-012): feature folder; project details 1:1 with deals; integer-cent money math with the DB authoritative; ZIP routing table + default list; insert-only intake + SECURITY DEFINER trigger; TCPA consent handling; visits double-booking is a warning; deal value follows the project; pdf-lib PDFs; separate `demo-azh`; storage-api in the local stack; `frame-ancestors *` on the embed only.

Things I'd revisit: narrow `frame-ancestors` once AZH's website domain is known; move intake photo uploads to server-issued signed upload URLs so they share the rate limit.

## 9. What we need from Sam

1. The **CSLB license number** (PDFs say "License # pending" until it's entered in Settings → AZH).
2. Confirm the **Fallbrook ZIP list** (AZH-004) — e.g. should Temecula/Murrieta, Ramona or Encinitas go to Fallbrook?
3. Confirm the **service list** (Framing, Drywall, Painting, Carpentry, Cement & concrete, ADU, Tenant improvement, Renovation, Other).
4. Who gets new-request tasks for each office (Settings → AZH)?
5. Should sales tax apply to labor, or only materials (AZH-003)?
6. The website domain that will embed the form.
7. The full Fallbrook office ZIP for the address on PDFs ("532 E. Fallbrook Ave, Fallbrook, CA").

## 10. Recommended next steps

1. Keanu reviews, merges, applies the 7 migrations to hosted, regenerates types, adds members to `demo-azh`.
2. Enter the CSLB number and confirm ZIPs/services; embed `/r/azh-builders/embed` on the AZH website.
3. Known issues / tech debt (ranked): (a) orphaned intake photos when a form isn't submitted — add a cleanup job; (b) anon photo uploads aren't rate-limited at the storage layer (10 MB image-only, random path) — switch to signed upload URLs; (c) editing a deal's value in the drawer is overwritten by the project/estimate/change-order sync (by design, AZH-008); (d) demo visit dates are relative to when the seed runs; (e) AZH pages' mobile LCP ≈ 4 s in Lighthouse simulation (extra queries + display font) — worth caching later; (f) the shared `ListFilters` can drop a filter if two are changed before the URL updates (seen in e2e, not fixed — Track A's shared component); (g) changing a request's office doesn't change its project's office.
4. Later phases: Google Calendar sync for visits (Phase 5), messaging/GHL (Phase 5), AZH community (Phase 6 engine).

# AZH FOLLOW-UPS HANDOFF

## 1. What was built

- **A1. Photo uploads locked down.** The form now asks `POST /r/<slug>/upload` for upload slots. That server route checks the slug, photo types and the 10 MB limit, and the database applies the same per-IP / per-phone / per-workspace limits as form submits. The route returns signed upload URLs. Anon's broad insert policy on `azh-intake` is gone: Storage only accepts the exact paths the server issued (live 15 minutes, write-once), and the intake trigger only accepts photos issued to the same phone number. (AZH-013)
- **A2. Office changes follow through.** Changing a request's office moves the linked project's office and logs "Office changed from X to Y (from the request)" on the project.
- **A3. Clean up unused uploads.** An admin-only button in Settings → AZH removes form photos older than 24 hours that never got attached to a submitted request, and says how many it removed. No scheduled jobs. (AZH-014)
- **A4.** This report; every check re-run. PR left open.

## 2. How to see it locally

`pnpm db:start && pnpm db:reset && pnpm dev`. Public form at `/r/azh-builders` (add photos). Settings → AZH → "Clean up unused uploads" in `demo-azh` (add yourself as admin first; SQL in the PR).

## 3. Tests run

| Check                             | Result                                                                                                                                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| format / lint / typecheck / build | pass                                                                                                                                                                                                                |
| Unit                              | 108 / 108                                                                                                                                                                                                           |
| RLS                               | 32 / 32; AZH SQL suite now **93 / 0** (was 78: +random-path upload refused, ticketed upload ok, ticket validation ×5, wrong-phone photo refused, tickets unreadable, office sync ×3, cleanup ×3); core suite 42 / 0 |
| e2e                               | **18 / 18** (new: `azh-cleanup.spec.ts` ×2, upload-route checks in `azh-request-form.spec.ts`, office change in `azh-requests.spec.ts`; full chain with photo still passes)                                         |

## 4. Shared files touched

None beyond what the original AZH handoff lists. The new code sits in the AZH lane: a route under `/r/**`, files in `src/features/azh/**`, `*_azh_*` migrations and AZH tests. `src/lib/db/types.ts` was regenerated.

## 5. New migrations (after the original 7) — **Keanu applies them to hosted after merge, AZH first, then Phase 2A**

8. `20261020060000_azh_request_office_sync.sql`: trigger that moves the project's office and logs it.
9. `20261020060100_azh_upload_tickets.sql`: `azh_upload_tickets` table, `azh_issue_upload_tickets()` RPC, a ticket-only Storage insert policy replacing anon's direct insert, and the intake trigger now checks tickets.
10. `20261020060200_azh_cleanup_uploads.sql`: `azh_unused_intake_photos()` RPC (admin only); admins may prune old tickets.

## 6. Merge order and readiness

Merge this PR first, then Phase 2A. `main` hasn't moved, so there are no conflicts. CI is green.

## 7. Blockers

None.

## 8. Decisions

AZH-013 (server-issued upload slots), AZH-014 (manual cleanup) in `docs/DECISIONS-AZH.md`.

## 9. What we need from Sam

Same as the original handoff: CSLB number, Fallbrook ZIPs, service list, office assignees, tax on labor, website domain, Fallbrook office ZIP.

## 10. Next steps

Narrow `frame-ancestors` to Sam's domain once known. Optionally run the cleanup on a schedule once Inngest is in (Phase 2+).
