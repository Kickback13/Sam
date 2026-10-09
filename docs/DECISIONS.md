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
