# AZH Track — Architecture Decision Records

Track B (AZH Builders / construction) decisions. Numbered AZH-001, AZH-002…
Project-wide ADRs stay in `docs/DECISIONS.md` (not edited by this track).

---

## AZH-001 — Feature folder `src/features/azh/**`

**Decision:** All AZH code (pure modules, Zod schemas, server queries/actions, components, PDF) lives in `src/features/azh/`. Routes under `src/app/w/[slug]/{projects,requests,schedule}`, `src/app/w/[slug]/settings/azh` and `src/app/r/[slug]` are thin and import from it. Unit tests sit beside the code (`*.test.ts`), picked up by one added `include` glob in `vitest.config.mts`.
**Consequences:** Track A's files stay untouched; shared files get one-line hook-ins only (listed in `docs/progress/AZH-TRACK.md`).

## AZH-002 — Project details in `azh_projects`, 1:1 with `deals`

**Decision:** A construction project _is_ a deal in the Projects pipeline (stage, kanban, history, activities all reused). AZH-only fields live in `azh_projects` (primary key `deal_id`, composite FK `(workspace_id, deal_id)` → `deals`, cascade). No existing deal column changes. The row is created lazily (first save, an estimate, or the request form).
**Consequences:** Pipeline/board code needs no schema awareness; the board shows AZH data through an optional React context hook (`DealCardExtrasProvider`) instead of new props.

## AZH-003 — Money math: integer cents, half-away-from-zero, database is authoritative

**Decision:** Estimate and budget math use integer cents (BigInt for products) and round half away from zero — the same rule as Postgres `round(numeric, 2)`. Estimate totals are computed **in the database** (`azh_save_estimate`, `azh_estimate_recalc`, item triggers); `src/features/azh/estimates/math.ts` mirrors the rules for live preview and the PDF. A DB test asserts parity on the same example used in the unit tests.
Rules: `line = round(qty × unit price, 2)`; `markup = round(subtotal × markup%, 2)`; `tax = round((subtotal + markup) × tax%, 2)`; `total = subtotal + markup + tax`. Tax applies to the marked-up subtotal (simple, one rate) — confirm with Sam whether labor should be untaxed.
**Consequences:** Totals can't be forged from the client; no float drift.

## AZH-004 — ZIP → office routing table with a documented default list

**Decision:** `azh_zip_routes (workspace_id, zip, office)`; unlisted ZIPs route to San Diego. New construction workspaces get the default North County list (trigger on `workspaces` insert → `app_private.azh_init_workspace`). Default Fallbrook ZIPs (`app_private.azh_default_fallbrook_zips()`):
Fallbrook/Rainbow/De Luz 92028 · Bonsall 92003 · Pala 92059 · Pauma Valley 92061 · Valley Center 92082 · Camp Pendleton 92055 · Oceanside 92054, 92056, 92057, 92058 · Vista 92081, 92083, 92084 · San Marcos 92069, 92078 · Escondido 92025, 92026, 92027, 92029 · Carlsbad 92008, 92009, 92010, 92011.
**Consequences:** Sam can edit the list in Settings → AZH. **Needs Sam's confirmation** (e.g. whether Temecula/Murrieta in Riverside County, Ramona, or Encinitas should go to Fallbrook).

## AZH-005 — Public request form: insert-only intake table + SECURITY DEFINER trigger

**Context:** The homeowner form has no login, and production has no secret server key (ADR-007).
**Decision:** anon may only `INSERT` (column-level grant) into `azh_intake`; no select/update/delete policies exist. A `BEFORE INSERT` trigger (`SECURITY DEFINER`, `search_path=''`) validates, rate-limits and then creates/merges the contact (dedupe on normalized phone/email, role `homeowner`), creates the request, a Lead deal + `azh_projects` row, a task for the routed office (optional default assignee per office) and activities. Photos are uploaded by the browser straight to the private `azh-intake` bucket, where anon may only insert objects named `<workspace_id>/<random uuid>/<0-4>.<ext>` for a workspace whose form is open (10 MB, image types only); the trigger checks every referenced photo exists and isn't claimed by another request.
Spam/abuse: honeypot field (server action silently drops), server-side Zod validation, and database rate limits — 5 per client key (salted SHA-256 of the IP) per hour, 3 per phone per hour, 60 per workspace per 10 minutes. Rate-limit errors use `PT429` (HTTP 429 through PostgREST).
**Consequences:** No service-role key anywhere. Because the publishable key is public, someone could call PostgREST directly and vary the client key; the per-phone and per-workspace caps and DB validation still apply. Unsubmitted photo uploads can be orphaned — a cleanup job is tech debt (Phase 9). `app_private` gets `usage` for anon so storage policies can call `azh_intake_open()`; the schema is still not exposed through the Data API.

## AZH-006 — TCPA consent from the form

**Decision:** The SMS checkbox is unchecked by default. When checked, the request stores `sms_consent`, the exact consent text shown (in the submitter's language) and the timestamp; the contact gets `sms_consent = 'express'` with `sms_consent_at` and `sms_consent_source = 'AZH web request form (/r/<slug>)'`. Consent only ever upgrades from `none`; a later request without the box ticked never downgrades or erases earlier evidence, and `dnc` is never cleared. Nothing is sent (no automatic replies).

## AZH-007 — Estimate visits: internal booking, double-booking is a warning

**Decision:** `azh_visits` (date/time, office, estimator, address, notes, status). Overlaps for the same estimator (half-open intervals, canceled ignored) are detected by a pure tested module and shown as a warning before saving and on the week view — not blocked, because back-to-back or ride-along visits are sometimes intentional. Booking a visit for a request moves it to "estimate scheduled" (trigger). No external calendar and no messages (Google Calendar is Phase 5).

## AZH-008 — Deal value follows the project

**Decision:** `deals.value` (shown on the board and pipeline totals) is kept in sync by triggers: contract value + approved change orders (floored at 0) when a contract value exists, else the project's estimate total (newest accepted estimate, else newest non-declined version). Left untouched when neither is set. Change orders may be negative (credits).
**Consequences:** Editing the value in the deal drawer is overwritten on the next project/estimate/change-order change — the project page is the source of truth for AZH money.

## AZH-009 — Estimate PDF with `pdf-lib`, download only

**Decision:** Generated server-side in a route handler with `pdf-lib` (MIT, no native deps, no external service). Includes AZH branding/logo text, both offices with phones, and the CSLB number from Settings → AZH, or "License # pending" when blank. Returned as an attachment; nothing is emailed.

## AZH-010 — Separate `demo-azh` workspace

**Decision:** The existing Demo workspace is real estate, so AZH sample data lives in a new `demo-azh` workspace (`is_demo = true`, construction, AZH brand, own Projects pipeline). Members of `demo` are copied into `demo-azh` with the same role by the migration (data-driven, no hardcoded accounts).

## AZH-011 — Local stack runs storage-api

**Decision:** `pnpm db:start` no longer excludes `storage-api` (one token removed in `package.json`), because photo/file uploads and their e2e tests need the Storage API locally. CI is unaffected (it doesn't start Supabase).

## AZH-012 — Embeddable form: `frame-ancestors *` on `/r/<slug>/embed` only

**Decision:** The app keeps `X-Frame-Options: DENY` everywhere except `/r/<slug>/embed…`, which sends `Content-Security-Policy: frame-ancestors *` instead so AZH's website (domain not yet known) can iframe it. The page holds no session data and only writes through the insert-only intake path, so clickjacking risk is minimal. Once Sam's website domain is known, narrow it to `frame-ancestors https://<domain>`.
**Consequences:** One regex `source` in `next.config.ts` headers; `/r` is added to the proxy's public paths.

## AZH-013 — Public photo uploads go through server-issued slots (supersedes the upload part of AZH-005)

**Context:** AZH-005 let anon insert any `<workspace>/<uuid>/<n>.<ext>` object into `azh-intake`, unlimited except by the bucket's 10 MB / image-only settings.
**Decision:** The form first calls `POST /r/<slug>/upload` with the phone number and each file's type and size. The route calls `azh_issue_upload_tickets()` (SECURITY DEFINER), which checks the form is open, the types/sizes, and the same limits as submits (per IP key: 5 submits and 25 photos an hour; per phone: 3 submits and 15 photos an hour; per workspace: 60 submits and 300 photos per 10 minutes), then stores one ticket per photo (15-minute expiry). The route returns signed upload URLs for those paths. The broad anon insert policy is dropped; Storage only accepts objects whose name matches a live ticket — needed because Storage checks the insert policy even to sign an upload URL, and we don't use a service-role key. Upsert is off, so each slot can be written once. The intake trigger only accepts photos ticketed in the same workspace for the same phone.
**Consequences:** No anonymous writes to arbitrary paths; uploads share the submit rate limits. Someone calling the RPC directly can still vary the IP key (same caveat as AZH-005); the per-phone and per-workspace caps still apply. Unsubmitted uploads are removed with Settings → AZH → "Clean up unused uploads" (AZH-014).
