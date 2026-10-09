# Architecture Decision Records

Short ADRs. Status is Accepted unless noted. Newest at the bottom.

---

## ADR-001 — Next.js App Router, single app, TypeScript strict

**Context:** One team, two businesses, a CRM plus a future community PWA.
**Decision:** One Next.js 16 app (App Router, Server Components, Server Actions, Turbopack). No monorepo. TypeScript `strict`. The community app (Phase 6) ships as a PWA route group inside this app.
**Consequences:** Simple deploys on Vercel; shared auth/session; must keep route groups tidy as modules grow.

## ADR-002 — Supabase for Postgres, Auth, Storage, Realtime

**Decision:** Supabase project `housing4all-platform` (us-west-1). Schema lives in `supabase/migrations/*.sql` (CLI-compatible, ordered, idempotent seeds). TS types generated into `src/lib/db/types.ts`.
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

## ADR-014 — Vercel functions in `sfo1`

**Decision:** `vercel.json` pins functions to `sfo1`, next to Supabase `us-west-1`. Every page is server-rendered with several RLS-scoped queries, so round-trip latency to the database dominates.
**Consequences:** ~1–3 ms per query instead of ~70 ms from the default `iad1`. Revisit if the database region changes.

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

## Notes

- **Big Shoulders Display** is now published on Google Fonts as **Big Shoulders** with an optical-size axis (the display cut is its large-size end). We load `Big_Shoulders` with `axes: ["opsz"]`; the brand token key stays `big-shoulders-display`.
