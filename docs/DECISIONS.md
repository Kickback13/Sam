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

**Consequences:** No new powerful secret in Vercel. Anyone who learns the address can submit listings — as with any email-in inbox — so they land as New/Needs review, never promoted, and the admin can rotate the address. The token travels in the Inngest event payload, so the Inngest account is as sensitive as the inbox (today Keanu's, moving to Sam — `docs/ACCOUNTS.md`). Exact setup steps: `docs/ACCOUNTS.md`.

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

## ADR-026 — Property analysis: inputs stored, results computed; licensed data behind an adapter

**Decision (3A):**

- An underwriting scenario stores only its **inputs** and where each came from (`h4a_underwriting.inputs` / `input_sources`). Every result (NOI, cap rate, DSCR, cash-on-cash, break-even…) is computed by one pure module, `src/features/h4a/underwriting/math.ts`, used by the page, the PDF and the AI fact list — so the three can't disagree, and a formula fix applies to every saved scenario.
- Nothing is assumed. Price comes from the promoted listing (never the last sale price), units and sq ft from the property, each with its original source. Rents, vacancy, expenses and the loan start blank; a result that needs a blank input shows "Needs input". Optional add-ons (other income, single expense lines, closing costs) count as $0 when blank and the formula says so.
- Property tax is a **rate of the price** because California reassesses at sale (Prop 13); a rate under 1% raises a red flag.
- Red flags are rules of thumb kept as constants (`FLAG_RULES`), worded as "check", not "wrong".
- Comps are entered by hand (or later by the data service) and every comp requires a source label and an as-of date.

**Ownership / mortgage / foreclosure / tax data:** `PropertyDataAdapter` with a `NotConnectedPropertyData` implementation, shown as "Not connected" on the analysis page. **Sam chooses the provider**; the account is created under his email and the key goes in Vercel env (never the database). Candidates, to compare on a current quote and the terms of use:

| Provider      | What it's known for                                                                 | Questions for the quote                                  |
| ------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------- |
| ATTOM         | National property, ownership, mortgage, foreclosure, tax and AVM data via REST API  | Price per call / plan, San Diego coverage, display terms |
| RentCast      | Rent estimates and comps, property records, listings; self-serve API plans          | Owner/mortgage depth, rent-comp coverage in 92104 etc.   |
| PropertyRadar | California-rooted owner, equity, mortgage and foreclosure data; API on higher plans | API plan price, export/display terms, contact data rules |

Prices aren't written here because they change; get a current quote before choosing. Whichever is picked plugs into the adapter (and can also back `CountyRecordsAdapter`, ADR-024) without other changes.

## ADR-027 — AI summary: fact list in, every sentence checked before it's shown

**Decision:** The AI summary (Anthropic, model `claude-opus-5-5`, effort `low`, structured output) receives only a numbered **fact list** built from the saved scenario — each fact is an id, a label, the value exactly as the page shows it, and its source. No names, addresses or contact details are sent. The model returns sentences, each with the fact ids it used. Before anything is shown, `checkSummary()` drops any sentence that cites no fact or an unknown fact, or **states a number that isn't in one of the facts it cites**. If nothing survives, nothing is shown. Summaries aren't stored; each generation is written to `audit_log` (model, sentence count, dropped count).

**Connection:** "Not connected" until `ANTHROPIC_API_KEY` (an API key on Sam's Anthropic account, logged in `docs/ACCOUNTS.md`) is set in Vercel. Requests use the server-side refusal fallback (`fallbacks: "default"`), so a safety-classifier decline is retried on a fallback model instead of failing; a final refusal shows a plain message. Cost is usage-based and only incurred when someone clicks "Summarize".

## ADR-028 — Outreach: one gate module, checked at send time; newsletters per workspace; nothing sends until switched on

**Decision (4A):**

- Every outbound message goes through `src/features/outreach/compliance.ts` — pure functions that return _all_ failing gates, not just the first. The server re-runs them for every recipient at the moment of sending; a preview result is never trusted.
  - **Email (CAN-SPAM):** not DNC, has a valid address, not opted out (`contacts.email_opt_out`), not on the do-not-send list, and the workspace has a sender name, From address and physical mailing address. The footer (sender, address, why they're receiving it, unsubscribe link) is added by the renderer and can't be removed.
  - **Text (TCPA):** not DNC; a number that isn't a landline (unknown type warns); no STOP on _any_ of the contact's numbers; consent on file with its date — **written** consent for marketing, express is enough for informational; inside the texting window in the workspace time zone (default 8am–9pm Pacific; can be narrowed, never widened — enforced by a check constraint).
  - Inbound keywords: STOP/STOPALL/UNSUBSCRIBE/CANCEL/END/QUIT/REVOKE/OPT OUT → stop; START/UNSTOP → start; HELP/INFO → help. Whole-message match only.
- **Do-not-send list** (`outreach_suppressions`) is separate from the contact record, keyed by normalized email / +1 phone, so an unsubscribe or STOP survives contact edits, merges and re-imports. Writers can add; only admins can remove (with a confirmation that the person asked to be contacted again).
- **Newsletters are per workspace** (Sam: separate Housing4All and AZH newsletters, same content). "Copy to workspace" duplicates a draft into another workspace the user can write to; each sends to its own contacts with its own sender details. Content locks once sending starts; status only moves draft → sending → sent (trigger).
- **Send log:** `newsletter_sends` keeps one row per recipient — sent, failed, or blocked with the gate codes. Rows can't be deleted and only delivery fields can be updated (column grants). A sent row writes an `email` activity on the contact (trigger), so every send is on the timeline.
- **Unsubscribe:** a random per-recipient token. `GET /unsubscribe/{token}` only shows the page (link scanners pre-fetch links); the button and RFC 8058 one-click `POST /api/unsubscribe/{token}` call a SECURITY DEFINER function that adds the address to the do-not-send list, opts the contact out, logs it once, and reveals only the workspace name and a masked email.
- **Sending is off by default:** needs `OUTREACH_EMAIL=on` and `RESEND_API_KEY`, and is refused on Vercel previews regardless (they share the production database). Until then the UI shows "Not connected" and the Send button explains why. 4A sends in one server action in batches of 100, capped at 5,000 contacts; a background job (Inngest) replaces that if lists grow.
- Texting has no provider yet (GHL LC Phone vs Twilio is decided with Phase 5); the gates are built and shown on each contact.

## ADR-029 — GoHighLevel: one-time read-only import, token in Vault, contacts through the CSV engine

**Context:** Sam is leaving GoHighLevel (Housing4All in ~2 months, AZH in 3–4). Two-way sync would be built for a system about to be switched off.

**Decision (5A):**

- **Import, don't sync.** A re-runnable, read-only import per workspace: contacts, then opportunities. Nothing is written to GHL.
- **Token:** a sub-account _Private Integration_ token with `contacts.readonly` + `opportunities.readonly`, created by Sam and pasted into Settings → Integrations → GoHighLevel by an owner/admin. It is tested against GHL before saving and stored only in **Supabase Vault** (`vault.secrets`, encrypted), never in a column. `integrations.config` keeps just the location id/label. SECURITY DEFINER functions let owners/admins store, read (server-side, for the import) and delete it; nobody else, including other workspaces' admins and anon. Trade-off: an admin's session can read the token back through `ghl_connection()` — acceptable because only owners/admins (who pasted it) can, and keeping it out of the browser otherwise.
- **Contacts reuse the CSV import engine.** Each GHL page is turned into rows shaped like GHL's own CSV export and passed to `importChunk`, so API and CSV imports share validation, dedupe (GHL id / email / phone), merge rules (fill blanks, union tags, compliance flags only tighten) and the import report.
- **Compliance:** GHL all-channel DND → DNC; Email DND → email opt-out; SMS DND (or all-channel) → the do-not-send list. **SMS consent is never inferred** — GHL has no consent record — so every imported contact starts at "No SMS consent".
- **Opportunities → deals** through a stage-mapping screen (same-name stage by default, else the first open stage; "Don't import" per stage). Won → the pipeline's won stage, lost/abandoned → lost. `ghl_links (workspace, object, ghl_id) → local_id` makes re-runs skip already-imported opportunities; `deals` is not altered.
- **API shapes** come from GHL's official SDK (`@gohighlevel/api-client` 3.1.1) because the docs host isn't reachable from the build environment: `GET /contacts/` (startAfterId/startAfter paging), `GET /opportunities/pipelines`, `GET /opportunities/search`, header `Version: 2021-07-28`. Rate limits (429) are waited out client-side. `GHL_API_BASE` (tests only, ignored on Vercel) points e2e at a local mock.

## ADR-030 — Housing4All Network: members are a separate population, not workspace members

**Decision (6A):**

- Network members get their own Supabase login but are stored in `network_members`, **never** in `workspace_members`. Every CRM table's RLS is keyed on `member_workspace_ids()`, so a member sees no contacts, deals, properties, activities, tasks or companies by construction — no CRM policy had to change. Network tables use a separate helper, `app_private.network_workspace_ids()` (active members only), plus the existing staff helpers.
- The member app lives at `/n/<slug>` with its own shell (no CRM navigation). `network_context(slug)` returns only what it needs (name, brand, my member row) because members can't read `workspaces`. Staff can open the same app to see what members see.
- **Authorship and moderation are enforced in the database:** triggers set `author_user_id` / `author_member_id` (a member posts as themselves, staff as the business) and stop members from pinning, hiding, reassigning or changing their own type/segments/status. Triggers skip trusted code running as the table owner (the join function).
- **Joining** (`accept_network_invite`, SECURITY DEFINER): checks the invite (expiry, revoked, used, email-bound) and the user's confirmed email, links the CRM contact with that email or creates one (tag `network`, source "Housing4All Network"), logs a timeline activity and an audit entry. Invite tokens are random hex like workspace invites.
- **Privacy:** the directory shows only members who opt in, and only the contact details they choose to publish (`public_email`, `public_phone`); the CRM keeps the real ones. Deal-post numbers are labelled as the poster's own, never as verified data.
- **Broadcasts reuse Outreach:** a newsletter audience flag "Only Network members" (contacts linked to active members), so the Phase 4A compliance gates apply unchanged.
- **PWA:** manifest, icons (rendered with `next/og` in the workspace brand) and the service worker are public; the worker is network-first and caches nothing private.

## ADR-031 — AI receptionist: Twilio rings people first, ElevenLabs answers the rest, the CRM gets every call

**Decision (7A):**

- **Twilio owns the phone number and the ringing; ElevenLabs only talks.** Twilio's voice webhook rings the default route for `ring_seconds` during business hours, then hands unanswered (or after-hours) calls to the ElevenLabs agent over SIP (`RECEPTIONIST_AI_SIP_URI`). If that address isn't set or can't be reached, the caller gets a bilingual voicemail — a call is never dropped.
- **Webhooks are doubly authenticated:** a per-workspace token in the URL (only its SHA-256 is stored; checked inside `receptionist_record_call` / `receptionist_config`, which run as anon and can touch only that workspace) **and** the provider's signature (Twilio `X-Twilio-Signature` HMAC-SHA1; ElevenLabs `t=…,v0=…` HMAC-SHA256, 30-minute window). Unsigned requests are refused on any production runtime. No service-role key.
- **One row per call, filled in as events arrive** (Twilio outcome, ElevenLabs transcript/summary, keyed by Twilio's call SID when the AI answered). Outcomes only move forward, so a late "missed" never overwrites "answered".
- **Routing after the call** is by keywords in what the caller said (accent-insensitive, whole words, per language), falling back to the default route. The route decides who gets the follow-up task — kept simple and testable rather than letting the AI pick a person.
- **CRM:** callers are matched by normalized phone; unknown numbers become contacts (tag `receptionist`, source "AI receptionist", name from the agent's data collection when given). Each call is one `call` activity on the timeline (updated as details arrive). Missed calls, voicemails and AI-taken calls create one "Call back …" task due in 4 hours for the route's person (only if they're still a member).
- **Recording consent (California, all-party):** default greetings disclose recording; the agent's first message must too.

## ADR-032 — Automatic GoHighLevel import: one-way, change-detected, runs under an admin's session

**Context (5B):** Sam keeps GoHighLevel for a few more months (Housing4All ~2, AZH 3–4) before cancelling it (ADR-029). Re-running the one-time import by hand means new GHL leads and deal moves are missed in between. Two-way sync was rejected again on 2026-11-02: GHL is being switched off and the platform is the system of record.

**Decision:**

- **One way, read-only.** Same Private Integration token and scopes as 5A (`contacts.readonly`, `opportunities.readonly`); nothing is ever written to GHL.
- **Only what GHL changed.** Each run reads GHL and compares every contact/opportunity with the fingerprint stored at the last run (`ghl_sync_state`, a SHA-256 of exactly the fields the import reads). Unchanged records are not touched, so edits made in the app are not overwritten every few hours by an unchanged GHL copy. Changed contacts go through the same CSV import engine (merge rules, dedupe, compliance flags only tighten, SMS DND → do-not-send list). A new opportunity becomes a deal; a linked deal moves only when GHL moved or changed it. Deals created by the one-time import get a baseline on the first run (no surprise moves).
- **No service-role key and no new secrets.** Runs execute under a signed-in owner/admin's session, so RLS covers every write: **Import now** on the GoHighLevel page, and a background run that the app shell starts (Next.js `after()` in a server action) when an owner/admin has the app open and a run is due (hourly / 6-hourly / daily). A database lock (`ghl_sync_claim`, 10-minute expiry) prevents overlapping runs; `ghl_sync_finish` records the result and writes `audit_log`. Trade-off: if nobody with admin rights opens the app, nothing imports until someone does — acceptable because the data is only needed when someone is working. A true cron (Vercel Cron + a server key) can be added later without changing the import logic.
- **Stage map:** the map chosen in the last manual opportunity import is saved and reused; before that, stages match by name (else the pipeline's first open stage).
- **Time budget:** a run stops starting new pages after 2 minutes and the next run continues (unchanged records are skipped quickly).

## ADR-033 — Prospect lists are computed from existing data, not stored

**Context (4B):** Sam wants to know which brokers send the best deals and which owners have held a long time. Both answers already exist in the workspace: every listing carries its broker's details, and every property its last sale date (with source).

**Decision:** compute both lists on request under the user's session (RLS), with no new tables. Brokers are grouped by normalized email, else phone, else name + company, and ranked by listings, buy-box matches (score ≥ 70, the alert threshold), volume, pipeline and closed deals. Long-hold owners are properties with a last sale date at least N years ago (default 15), showing the date's source and the owner's compliance flags. A broker can be added to People as a contact with role Broker through the normal duplicate-checked contact action. Nothing is sent from these pages.

**Consequences:** always current, no sync to maintain, no live database change. Reads up to 10,000 recent listings and 2,000 properties per page view, which is plenty for one brokerage; a materialized view can replace it if volumes grow.

## ADR-034 — RentCast property data: fetched on request, blanks only, behind a monthly request cap

**Context (3B):** Sam picked RentCast (Oct 28) for ownership, tax and sale data plus value / rent estimates. Every request is billable, and the app must never present a number without its source.

**Decision:**

- **Read-only client** (`src/features/h4a/property-data/rentcast.ts`): `GET /properties`, `/avm/value`, `/avm/rent/long-term` with the `X-Api-Key` header. RentCast's docs host isn't reachable from the build environment, so the shapes come from RentCast's public reference as quoted by open-source clients; **every field is optional** and a missing one stays blank.
- **Key in Supabase Vault** per workspace (`data_api_key:<ws>`), stored by owners/admins (`data_api_save_key`), never in a column. Saving makes no request.
- **Cost guard:** `data_api_claim` hands out the key for ONE request only while this calendar month's requests (Pacific time; answers and "no record" count, errors don't) are below the owner-set limit (default 40). Requests happen only when someone clicks Fetch on the analysis page; nothing runs in the background.
- **Provenance:** every answer is kept raw in `property_data_pulls` (who, when, what); the panel shows "Source: RentCast · fetched …". A property record **fills only blank property fields**, each stamped `RentCast property record` in `field_sources`, so manual and verified values are never overwritten (and long-hold owners light up from the sale date).
- Estimates are shown, never written into the underwriting inputs automatically.

**Consequences:** no surprise bills; the app works unchanged without a key ("Not connected"). Swapping providers later means a new client behind the same panel and tables.

## ADR-035 — Booking page: stored in the app, no calendar account, nothing sent

**Context (4C):** module 6 needs leads to book a time with Sam. A Google Calendar connection (OAuth app review, a paid Workspace in some setups) and confirmation emails or texts (Resend/Twilio) are both on hold: "build everything but not the things that charge yet".

**Decision:**

- **Public page** `/b/[slug]` (Housing4All workspaces only), **off by default**. Owners/admins set the host, meeting length, gap, minimum notice, how far ahead, time zone and weekly hours on **Calendar**.
- **Open slots are computed in Postgres** (`app_private.booking_open_slots`). This is the only authority: weekly hours in the page's time zone (DST-safe), minus anything booked or blocked (plus the gap), minus the notice window. `booking_public_book` re-checks the exact slot under a per-workspace advisory lock, so two people can't take the same time. It also enforces limits: 3 per visitor per hour (salted daily IP hash, never the raw IP), 50 per workspace per day, and at most 2 upcoming bookings per person. A hidden honeypot field catches bots.
- **CRM:** each booking matches the contact by email/phone keys or creates one (tag `booked-call`), logs a `meeting` activity and gives the host a task due at the meeting time. Staff mark bookings done / no-show / canceled (logged on the contact) and **block time** for things outside the app.
- **Nothing is sent.** The lead downloads an `.ics` file from the confirmation page. Sam can subscribe to a **private read-only iCalendar feed** (`/api/calendar/<token>.ics`; only the token's SHA-256 is stored; making a new link turns the old one off). That puts bookings on his Google/Apple Calendar with no account connected.

**Consequences:** bookings don't see Sam's other calendar events. He blocks time by hand until a Google Calendar connection exists. Google refreshes subscribed feeds every few hours. Confirmation and reminder messages come with the messaging work, behind the compliance gates.

## ADR-036 — Texting: one-to-one only, gates enforced by the database, off until switched on

**Context (4D):** module 6 needs texting, and CLAUDE.md rule 4 allows outbound messages only behind the compliance gates. Twilio charges per text. US business texting also requires A2P 10DLC brand and campaign registration, which has fees. Instruction: build it, but don't turn on anything that charges.

**Decision:**

- **One-to-one only.** A person writes and sends every text from a contact's page. There are no sequences, no bulk sends and no automation.
- **Off by default, three locks.** Sending needs:
  1. Twilio credentials in env (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`; never in the database);
  2. a sending number or Messaging Service saved by an owner/admin;
  3. **Texting on**.
     Until then, the contact page and the AZH hub say exactly which step is missing.
- **Gates twice.**
  - The app runs `checkSms` (`informational` purpose) to explain any block in plain words. Blocked attempts are logged with their reasons.
  - The database is the authority. `sms_messages_guard` refuses to queue a text unless texting is on and:
    - the contact is not DNC and has SMS consent on file (with date);
    - the number belongs to the contact and is not a landline;
    - the number is not on the STOP list;
    - it is inside texting hours (`app_private.sms_in_window`, 8am–9pm at most, Settings → Outreach);
    - the daily caps aren't hit (10 per contact, 300 per workspace).
  - Twilio is called only after the queued row exists.
- **Inbound** (`/api/sms/inbound/<token>`, Twilio signature required):
  - each text matches or creates the contact, lands on the timeline and gives the owner a task to reply;
  - STOP-type words add the number to the suppression list at once, and START removes it (consent on file still applies);
  - HELP gets the admin-set reply;
  - Twilio's retries don't duplicate.
- **Delivery status** (`/api/sms/status`, signature required) is keyed by Twilio's message ID and only moves a message forward.

**Consequences:**

- Turning texting on is a settings change plus env vars; no code change is needed.
- A2P 10DLC registration and the number purchase are Sam's decisions (they cost money).
- Marketing texts (which need written consent) are not built. They would reuse the same gates with purpose `marketing`.

## ADR-037 — Messages inbox reads the text log; "needs reply" is computed, not stored

**Context:** the Phase 4 reply inbox and AZH module 16 both need one place for every text conversation. Texts already live in `sms_messages` (ADR-036).

**Decision:** `/w/[slug]/messages` (both businesses) groups the latest 2,000 texts per contact, newest first (`src/features/outreach/inbox.ts`, unit-tested). A conversation **needs a reply** when inbound texts arrived after our last text that actually went out. Blocked or failed attempts don't count, and STOP/START/HELP never need a reply. Opening a conversation shows the same Texts card as the contact page, so every send passes the same gates. No migration, no read/unread state.

**Consequences:** nothing to keep in sync. Answering a text clears "needs reply". If Sam wants "mark as done without replying", that needs a small table later. While texting is off the page says so, and it fills up once texting is on.

## ADR-038 — Reports are counted live by one invoker function

**Context (Phase 9 reporting):** Sam needs a quick view of how both businesses are doing. Every number has to come from real records, and nothing new should be stored that could drift.

**Decision:** `public.report_summary(workspace, days)` returns one JSON summary for 30, 90 or 365 days:

- weekly counts (contacts, deals, calls, texts, meetings, listings, requests, bookings);
- open deals and value per stage;
- won/lost and the top lost reasons;
- tasks, listings, alerts, bookings, AZH requests by office and estimates.

It is **SECURITY INVOKER**, so row-level security decides what is counted. It also refuses non-members outright. `/w/[slug]/reports` shows it with stat tiles and single-series weekly charts (tooltips plus a table view), and AZH sees its own measures. There are no new tables.

**Consequences:** numbers are always current. The query cost grows with data, but it is bounded to one workspace and at most 365 days. If it ever gets slow, a nightly rollup table can sit behind the same function.

## ADR-039 — Follow-up sequences: steps come due for a person, nothing sends by itself

**Context (4E):** Phase 4 lists "outreach sequences behind compliance gates". Email sending (Resend) and texting (Twilio) aren't connected, and automated sends are the riskiest kind for TCPA and CAN-SPAM.

**Decision:**

- A sequence is up to 20 steps (email or text), each **due N days after the previous one**. Messages use `{first_name}`, `{last_name}`, `{full_name}`, `{company}` and `{my_name}`, and missing values are flagged before sending.
- Due steps appear under **Outreach → Sequences → Due now** and on the contact's page. A person completes each one:
  - **text** steps go through the gated texting path (ADR-036). A block is recorded and the enrollment doesn't advance;
  - **email** steps open in the person's own mail app (`mailto:`) and are then marked sent. Do-not-contact and unsubscribed contacts are refused, and the email is logged on the timeline;
  - **skip** and **stop** are always available.
- Database triggers end active enrollments the moment a contact is marked do-not-contact or texts STOP. Only writers build or enroll, viewers read, and the caller authors every record (`supabase/tests/h4a_sequences_rls.sql`).

**Consequences:** works today at no cost and can't send anything unattended. Automatic sending can be added later behind the same gates, once Resend and Twilio are live and Sam opts in. It would be a background job completing due steps.

## ADR-040 — Community photos: private bucket, own-folder uploads, paths checked by the database

**Context:** Network (Housing4All) and Community (AZH) posts needed photos (deals, job sites). The Phase 6A plan left them out.

**Decision:**

- Up to **4 photos per post** in a **private** `network-photos` bucket: JPG, PNG or WebP, 5 MB each.
- **Upload:** files go straight from the browser to storage at `<workspace>/<uploader>/<uuid>.<ext>`. Storage policies let the team and active community members upload **only into their own folder** in a community they belong to.
- **Post check:** `network_posts.photo_paths` is checked by a trigger. Every new path must be in the poster's own folder in this workspace, exist in storage, and be a photo file, with at most 4. Existing photos may stay when a post is edited.
- **Viewing:** the team and the community's members can view photos; other workspaces and anon cannot. Pages show short-lived (1 hour) signed links.

**Consequences:** no public image URLs. A deleted post or a failed post can leave an unused file in storage, which is harmless and can be swept later like AZH intake photos (AZH-014). Push notifications for new posts remain a separate item.

## ADR-041 — Community push notifications: opt-in per device, team posts only, off until keys exist

**Context:** the Phase 6A plan left push notifications out (they need a VAPID key pair). Members asked to hear about new deals and events without checking the app.

**Decision:**

- **Opt-in:** members (and staff) opt in per device with **Notify me about new posts and events** in the member app. The browser's push subscription is stored in `network_push_subscriptions`, and only its owner can see it.
- **What notifies:** only **team** posts and events, never members' posts, so nobody can notify the whole community. Notifications go out after the response (`after()`) through `web-push` with the VAPID keys from env (`NETWORK_PUSH_PUBLIC_KEY`, `NETWORK_PUSH_PRIVATE_KEY`, `NETWORK_PUSH_SUBJECT`). The device list comes from `network_push_targets`, which is team-only, skips removed members and the poster, and is capped at 5,000. Devices the push service reports gone (404/410) are dropped.
- **Content:** a notification shows the community name and the post title or "New event: …", with no private data. Tapping it opens the post in the app.
- **Off until keys exist:** with no keys, the button is hidden and the team page says "not connected". The key pair is free (`npx web-push generate-vapid-keys`) and goes into Vercel.

**Consequences:** on iPhone it works once the app is installed to the home screen (Apple's rule). A failed notification never undoes a post.

## ADR-042 — Automatic comps: suggested from data already in the workspace, added by a person

**Context:** comps were entered by hand (ADR-026). The Phase 3A plan left automatic comps for later. Buying a comps feed costs money, and scraping is ruled out. The workspace already holds three kinds of comparable data, each with its source.

**Decision:**

- The analysis page suggests comps, computed on request under the user's session (RLS). Nothing is stored, no migration is needed, and **no outside request is made**. Suggestions come from three places:
  - **Sales on file:** another property's last sale price and date. It is suggested only if the price has a source in `field_sources`. The comp's label is "Last sale on file · {that source}" and its as-of is that source's fetched date.
  - **Comps on other properties:** used as saved, with the same source, link and as-of. Their distance was measured from a different property, so it is dropped.
  - **RentCast comparables** inside the value and rent estimates already fetched for this property. They are listings, so a sale comparable is labeled "list price, not a recorded sale" and has no sale date.
- **Ranking** is one pure module, `src/features/h4a/comps/suggest.ts` (unit-tested):
  - **Filters:** within 3 mi when both sides have coordinates, otherwise the same ZIP, then the same city. 2–4-unit properties are compared with 2–4 units, and 5+ units with 5+ (between 1/4x and 4x). Building types must be compatible. Sales must be from the last 3 years and rents from the last 2.
  - **Score:** a match score out of 100 (location 40, size 30, recency 30), shown on each suggestion.
  - **Skipped:** the property itself, addresses already saved as its comps, and duplicates. Only one suggestion is kept per address and kind, in order of preference: a sale on file, then a saved comp, then RentCast.
- **A person adds them.** Each suggestion has **Add**, and there is an **Add all** button. The browser sends only suggestion keys. The server recomputes the suggestions and saves exactly those rows, so a saved comp always has its source's own numbers. Viewers see suggestions but can't add them. Each add is audited as `comp.create` with `suggested: true`.

**Consequences:** free and always current, and the suggestions get better as Sam's data grows: imported properties with sale dates, verified records, RentCast pulls. Each page view reads at most 2,000 recorded sales and 2,000 saved comps from the workspace. A paid comps feed could be added later as a fourth origin behind the same panel.
