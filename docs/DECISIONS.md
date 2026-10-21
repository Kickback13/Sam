# Architecture Decision Records

Short ADRs. Status is Accepted unless noted. Newest at the bottom.

---

## ADR-001 — Next.js App Router, single app, TypeScript strict

**Context:** One team, two businesses, a CRM plus a future community PWA.
**Decision:** One Next.js 16 app (App Router, Server Components, Server Actions, Turbopack). No monorepo. TypeScript `strict`. The community app (Phase 6) ships as a PWA route group inside this app.
**Consequences:** Simple deploys on Vercel; shared auth/session; must keep route groups tidy as modules grow.

## ADR-002 — Supabase for Postgres, Auth, Storage, Realtime

**Decision:** Supabase project `jcrjzmflepnvvvneahvs` (ca-central-1, Pro org Kondense AI — see ADR-018). Schema lives in `supabase/migrations/*.sql` (CLI-compatible, ordered, idempotent seeds). TS types generated into `src/lib/db/types.ts`.
**Consequences:** RLS is the tenancy boundary; every query runs under the signed-in user's JWT. No service-role key in Phase 1.

## ADR-003 — Multi-tenancy via `workspace_id` + RLS helper functions

**Decision:** Every domain table carries `workspace_id`. Policies call `app_private.is_member(ws)` / `app_private.can_write(ws)` / `app_private.is_admin(ws)` — `SECURITY DEFINER`, `search_path=''`, in a schema not exposed through the Data API. Roles: owner > admin > agent (read/write CRM) > viewer (read-only).
**Consequences:** One policy pattern for every table; helper functions avoid recursive policy evaluation on `workspace_members`. Tested by `supabase/tests/rls_isolation.sql` (hosted) and `tests/rls` (local).

## ADR-004 — Cache Components disabled in Phase 1

**Context:** Next.js 16.4's `create-next-app` enables `cacheComponents` + `partialPrefetching`. With them on, every session/cookie read must sit behind `<Suspense>` or `use cache: private`, and routes are validated for instant navigation.
**Decision:** Turn both off. Every page in this app is authenticated and per-request (RLS-scoped data), so a prerendered static shell buys little and the constraints add risk.
**Consequences:** Classic dynamic rendering. Revisit before Next.js 17, which makes Cache Components the default (migration guide: `node_modules/next/dist/docs/01-app/02-guides/migrating-to-cache-components.md`).

## ADR-005 — Tailwind v4 + vendored shadcn/ui on `radix-ui`

**Decision:** Tailwind v4 (Turbopack loader). shadcn/ui components are copied into `src/components/ui` (the registry host was unreachable from the build environment, and shadcn is copy-in source by design). `components.json` is present so `pnpm dlx shadcn add` works later.
**Consequences:** We own the component code; updates are manual diffs.

## ADR-006 — Theming through CSS variables from `workspaces.brand`

**Decision:** Brand tokens (primary, primary-deep, accent, accent-text, danger, ink, surface, display/body font) live in `workspaces.brand` jsonb, are validated with Zod (hex colors only, whitelisted fonts), and are written as CSS variables on the workspace layout. All four font families load via `next/font`. Accent colors are fills with black text; `accent-text` is for colored text on white (WCAG AA, unit-tested).
**Consequences:** Switching workspace re-skins the whole app with no rebuild; admins can edit branding safely.

## ADR-007 — Auth: magic link + Google OAuth + invites; password only for tests

**Decision:** Supabase Auth with PKCE (`@supabase/ssr`). Invites are rows in `invites` (email-bound or single-use link) accepted through `SECURITY DEFINER` RPCs — no admin API, no secret env var in production. Pending invites for a verified email are auto-accepted on sign-in. Email+password sign-in exists only for automated tests: enabled by `ENABLE_TEST_PASSWORD_LOGIN=true` and hard-disabled when `VERCEL_ENV=production`.
**Consequences:** Production needs only the two public Supabase values. Google sign-in requires configuring the Google provider in Supabase (credential owned by Sam).

## ADR-008 — Dedupe on normalized email/phone keys maintained in the database

**Decision:** `contacts.email_keys` / `phone_keys` (text[]) are derived by trigger from the `emails`/`phones` jsonb (lowercased emails, E.164-style US phones) and GIN-indexed. The CSV importer and manual create use the same normalization (shared TS + SQL, unit-tested for parity).
**Consequences:** Fast duplicate lookup at import time; GHL contacts dedupe cleanly.

## ADR-009 — Stage changes logged by a database trigger

**Decision:** An `AFTER UPDATE OF stage_id` trigger on `deals` writes `deal_stage_history` and a `stage_change` activity, and keeps `status` in sync with won/lost stages.
**Consequences:** History is complete no matter which code path moves a deal (kanban, drawer, future GHL sync).

## ADR-010 — Global search with pg_trgm over a maintained `search_text`

**Decision:** Each searchable table keeps a `search_text` column (trigger-maintained) with a trigram GIN index; `public.global_search(ws, q)` unions results ranked by similarity. RLS still applies (SECURITY INVOKER).
**Consequences:** Works for partial names, emails, phones and addresses; good enough to ~1M rows per workspace.

## ADR-011 — Local Supabase stack for e2e; hosted project via MCP for migrations

**Context:** The build environment cannot reach `*.supabase.co` directly; the Supabase MCP connector can.
**Decision:** Migrations, seed and the SQL RLS suite are applied to the hosted project through the connector. Playwright and the Vitest RLS suite run against a local Supabase stack (Supabase CLI, Docker Hub images) built from the same migrations.
**Consequences:** Hosted DB never holds e2e users. If full network access is enabled later, the same suites can target the hosted project via env vars.

## ADR-012 — TypeScript 5.9 and ESLint 9 (not TS 7 / ESLint 10)

**Decision:** Keep the versions `create-next-app@16.4` selects. TS 7 (native) and ESLint 10 are newer than Next's tested toolchain.
**Consequences:** Revisit when `eslint-config-next` and Next's type-check step support them.

## ADR-013 — Progressive enhancement + hydration guard for forms

**Context:** Clicking a form before React hydrates submits it natively (GET with the field values in the URL).
**Decision:** Auth forms use `<form action={serverAction}>` (`useActionState`) so they work before JavaScript loads. Other forms keep controlled state but disable their submit button until hydrated (`useHydrated()`); `<html data-hydrated>` is set for tests.
**Consequences:** No accidental GET submits on slow phones; e2e waits on a deterministic signal.

## ADR-014 — Vercel functions in `yul1`

**Decision:** `vercel.json` pins functions to `yul1` (Montréal), next to Supabase `ca-central-1`. Every page is server-rendered with several RLS-scoped queries, so round-trip latency to the database dominates. (Was `sfo1` next to `us-west-1` until ADR-018.)
**Consequences:** Same-region database round trips instead of a cross-region hop from the default `iad1`. Revisit if the database region changes.

## ADR-015 — CSV import rules

**Decision:** Rows are re-validated on the server (the client preview is advisory). A row with an unparseable email or phone fails and goes to the error report rather than being imported without it. Duplicates match on normalized email, phone or GoHighLevel contact ID; "skip" leaves the match untouched, "update" fills values and unions emails/phones/tags but never clears DNC or email opt-out. Duplicates inside one file are skipped and reported. Companies are matched by name (case-insensitive) or created. Imports run in 250-row chunks and record counts + up to 2,000 errors on `imports`.
**Consequences:** Imports are honest and repeatable; re-importing the same GHL export is idempotent with "skip".

## ADR-016 — Invite model and owner bootstrap

**Decision:** Invites are email-bound (accepted automatically when that verified email signs in) or single-use links. Only owners can invite owners — except while a workspace has no owner yet, when an admin may invite the owner (how Sam gets owner rights). Owners can't be demoted/removed by admins, and the last owner can't leave.
**Consequences:** No service-role key needed; Sam's ownership is established by an invite Keanu creates once Sam's emails are confirmed.

## ADR-017 — Hosted RLS verification through the connector

**Context:** The Supabase connector pauses `DELETE`/`TRUNCATE` statements for manual confirmation.
**Decision:** `supabase/tests/rls_isolation.sql` is a `pg_temp` function whose fixtures live in an always-rolled-back subtransaction. The hosted run (`node scripts/rls-hosted-sql.mjs`) omits the one `@destructive` assertion; that policy is verified locally, and a checksum of every function, policy, column and constraint proves the local and hosted schemas are identical.
**Consequences:** RLS is proven on the hosted project with zero residue and no confirmation prompts.

## ADR-018 — Supabase moved to Pro org Kondense AI (ca-central-1)

**Decision:** Supabase moved to Pro org Kondense AI, project `jcrjzmflepnvvvneahvs` (ca-central-1); functions moved to `yul1`; old project `tpurdmhizhcuxvawxmkk` retired.
**Consequences:** `.env.example`, CI and the docs point at the new project URL and publishable key; migrations are unchanged. Vercel's two `NEXT_PUBLIC_SUPABASE_*` env vars and the new project's Auth URL configuration must match. The Phase 1 hosted RLS run (ADR-017) was executed on the retired project — re-run `node scripts/rls-hosted-sql.mjs` against the new one.

## Notes

- **Big Shoulders Display** is now published on Google Fonts as **Big Shoulders** with an optical-size axis (the display cut is its large-size end). We load `Big_Shoulders` with `axes: ["opsz"]`; the brand token key stays `big-shoulders-display`.

---

# Phase 2A — Deal Engine (Track A, Housing4All)

## ADR-019 — Deal Finder listings, dedupe keys and source precedence

**Context:** The same building reaches Sam many times (two marketplaces, repeat alerts, price drops, his own CSVs). Every number must keep its source.
**Decision:**

- Listings live in their own inbox table (`h4a_listings`), separate from Properties. "Promote" copies the sourced fields into a Property (new, or an existing one for the same building) and creates the Deal.
- Dedupe keys are computed by one pure module (`src/features/h4a/listing/normalize.ts`): `apn:<digits>`, `addr:<street>|<ZIP5>` and `addr:<street>|<city>`. The street is normalized (suffixes and directions abbreviated, unit/suite dropped — we track whole buildings). Two listings are the same building when their APNs match, or their keys overlap and their APNs don't conflict. The database stores the keys, matches by array overlap (GIN index) and serializes ingestion per workspace (advisory lock), so two copies of an alert arriving together can't create duplicates.
- Merge is field by field. Manual entries and county records outrank alert emails, CSV rows and pasted emails; a lower-ranked source never overwrites a higher-ranked value — it's recorded as "kept". Address, city, ZIP and APN only change through manual/county. A repeat with the same value from the same kind of source refreshes the date; a different source repeating a value keeps the original provenance.
- Listings, history, emails and alerts are written only through `SECURITY DEFINER` functions (no insert/update/delete policies), so history can't be skipped or forged. Every function checks membership/role itself.

**Consequences:** No duplicates; complete history ("Updated from LoopNet alert: price $4,950,000 → $4,800,000"). A listing with no ZIP and no city only matches others with the same bare street line (it lands in Needs review anyway).

## ADR-020 — Email parser registry

**Decision:** One pipeline for forwarded emails and "Paste an email": HTML → readable text (`htmlparser2`), unwrap Gmail/Outlook/Apple Mail forwards, pick the parser for the **original** sender, fall back to a generic reader, validate every field with the shared Zod schema (an unreadable value is dropped and noted, never fatal), then rate confidence: high (address + city/ZIP + price + units), medium, low. Anything below high lands in **Needs review** with the email shown beside the parsed fields. The generic reader is never high.
Registry: one parser per sender format (`src/features/h4a/email/parsers/`). Phase 2A ships two **placeholder** formats written against made-up fixtures (a LoopNet-style digest and a Crexi-style HTML alert), labeled as such in code, notes and tests. Phase 2B adds/replaces parsers from Sam's real samples — a parser + its fixture + a test, nothing else changes. The Gmail forwarding-confirmation email is recognized and its code shown.
Safety: links are recorded, never fetched. HTML is stored through an allow-list sanitizer (no scripts, styles, images or attributes beyond safe links) and only shown inside a sandboxed frame whose content policy blocks every network request. No AI parsing in 2A.
**Consequences:** Until 2B, real alert emails will mostly go through the generic reader → Needs review. That's intended: honest, and nothing is guessed silently.

## ADR-021 — Scoring: one pure module, stored with the buy-box version

**Decision:** `src/features/h4a/scoring/score.ts` is the single scoring implementation. Only criteria the buy box sets count; weights location 25, units 20, price per unit 20, price 15, type 10, year built 10; score = points passed ÷ points set, 0–100. Missing data is "unknown" and earns nothing. Bounds are inclusive. An empty buy box gives no score (not 0). Each criterion produces one plain line ("Price/unit $206,250, over your $200,000 max.").
Scores are stored on the listing with the breakdown and the buy-box `version` they used. A trigger bumps the version whenever a criterion changes; a save computed against an older version is ignored. Saving the buy box re-scores every open listing (synchronously, ADR-023); pages also re-score any never-scored or stale listing on open (self-healing, writers only).
Alerts: an in-app alert when a **new or updated** listing (from an ingest) scores at or above the workspace threshold (default 70) — one per listing, ever. Buy-box edits re-score but never alert.
**Consequences:** The breakdown shown is exactly what produced the stored score. Sorting/filtering by score is a plain index scan.

## ADR-022 — Inbound email: Resend, the forwarding address, and no service-role key

**Context:** Forwarded alerts must reach the right workspace with no user session. ADR-007 keeps production free of a service-role key.
**Decision:**

- Resend inbound. The `email.received` webhook is metadata only; the body comes from `GET https://api.resend.com/emails/receiving/{email_id}` with `RESEND_API_KEY` (shapes match the official `resend` SDK types).
- `POST /api/inbound/email` verifies the Svix signature whenever `RESEND_WEBHOOK_SECRET` is set, and refuses every request when it isn't set on a production runtime (Vercel production **and previews**, which share the production database, plus `next start`). Requests over 256 KB are refused.
- Each workspace gets a forwarding address `deals.<20 random base32 chars>@<INBOUND_EMAIL_DOMAIN>`. Only the SHA-256 of the token is stored; the full address is shown once to the admin who creates it; replacing it revokes the old one.
- The webhook and the job call token-gated `SECURITY DEFINER` functions (`h4a_inbound_*`) with the publishable key. The token is the same capability as the address itself: it reaches only that workspace, only through those functions (emails, listings from that email, scores for listings that email touched). `anon` still has no table access (tested). 500 emails per workspace per hour.
- Idempotent per Resend email id (retries don't duplicate). Unknown recipients and other event types get 200 so Resend doesn't retry them.

**Consequences:** No new powerful secret in Vercel. Anyone who learns the address can submit listings — as with any email-in inbox — so they land as New/Needs review, never promoted, and the admin can rotate the address. The token travels in the Inngest event payload (Inngest account owned by Sam). Exact setup steps: `docs/ACCOUNTS.md`.

## ADR-023 — Inngest for forwarded email; user actions stay synchronous

**Decision:** Forwarded emails run in the Inngest function `h4a-process-inbound-email` (fetch body → store sanitized → parse → dedupe → score → alert; 4 retries; one at a time per workspace). The webhook records the email first, then sends the event; when Inngest isn't configured (local dev without the dev server, e2e, CI) the same code runs inline. `/api/inngest` serves the functions (signed by `INNGEST_SIGNING_KEY` in production).
**Synchronous by decision:** manual entry, CSV upload (200-row chunks), Paste an email, buy-box re-scoring, verify/dismiss/promote. The person is waiting for the result (the paste tool and CSV error report need it immediately), and these run under the user's own session so RLS and role checks apply — an Inngest function has no user session and we don't use a service-role key. Sizes are bounded (CSV ≤ 10,000 rows in chunks; re-scoring pages 1,000 listings and saves in batches of 500).
**Consequences:** Revisit re-scoring in a background job if a workspace passes ~20,000 open listings.

## ADR-024 — County records: interface now, data source in 2B

**Context:** Verification needs owner name, APN, units, year built and last sale from official San Diego County data — free, documented and allowed by our rules (no scraping).
**Findings:**

1. SanGIS / County parcel layers (ArcGIS services, e.g. `gis-public.sandiegocounty.gov` Parcels, `webmaps.sandiego.gov` PARCELS_ALL) carry APN, situs address and, in the member version, owner data — but those layers state they are **not authorized for release to the general public** and are for SanGIS JPA members only. Year built / unit counts aren't confirmed in the public layers.
2. The Assessor's online parcel lookup and the Recorder's grantor/grantee index are websites, not APIs — reading them by program would be scraping. Not allowed.
3. The Assessor/Recorder offers official data products for purchase (e.g. assessment-roll extracts) — terms and fields to be confirmed with the County; a business decision for Sam.
4. Licensed APIs (Phase 3 decision): ATTOM, PropertyRadar, RentCast, Regrid (parcels with owner names) — documented, paid, keys under Sam's account.

**Decision:** Ship `CountyRecordsAdapter` (`lookup({apn, address}) → found | not_found | not_connected | error`, plus a field-by-field mismatch helper) with a `NotConnectedCountyAdapter`, shown as "County lookup: Not connected". Verification works by hand now: "Mark verified" / "Mark mismatch" require a note and where it was checked, saved with user and date.

**For 2B (needs Sam):** pick one — (a) a licensed API from item 4 (fastest; also feeds Phase 3), (b) an Assessor roll purchase loaded as periodic CSV imports, or (c) SanGIS membership/data request if the County grants it. Each plugs into the same interface; listings then show the county value with its source and fetched-at date.

## ADR-025 — CI runs the database and browser tests

**Decision:** A second CI job starts the local Supabase stack (all migrations in order), runs `pnpm test:rls` (Phase 1 isolation + SQL suite, AZH suite, Deal Engine suite, inbound webhook end-to-end, demo seed check) and the Playwright e2e (desktop + 390px). It's separate from the fast job so lint/typecheck/unit/build still report first. Everything targets the throwaway local stack; the suites refuse non-local databases.
