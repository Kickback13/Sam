# Housing4All Platform

Deal intelligence + CRM for **Housing4All Premier Solutions** (San Diego multifamily brokerage) and **AZH Builders** (general contractor). One app, separate workspaces per business, every number with its source.

- **Stack:** Next.js 16 (App Router, Server Actions) · TypeScript strict · Tailwind v4 · shadcn/ui · Supabase (Postgres + RLS, Auth) · Zod · Vitest · Playwright · Vercel · pnpm
- **Read first:** [`CLAUDE.md`](CLAUDE.md) (context, rules, conventions) · [`docs/ROADMAP.md`](docs/ROADMAP.md) · [`docs/DECISIONS.md`](docs/DECISIONS.md) · [`docs/ACCOUNTS.md`](docs/ACCOUNTS.md)

## Zero to running

Prerequisites: Node 22+, pnpm 10 (`corepack enable`), Docker (only for the local Supabase stack used by tests).

```bash
git clone https://github.com/Kickback13/Sam.git && cd Sam
pnpm install
cp .env.example .env.local      # public Supabase values for the hosted dev project are pre-filled
pnpm dev                        # http://localhost:3000
```

Sign in with an email magic link. New accounts land on "No workspace yet" until an admin invites them (Settings → Members & invites) — or open an invite link.

### Local Supabase stack (tests, offline dev)

```bash
pnpm db:start                   # Supabase CLI + Docker (Docker Hub images); applies supabase/migrations
pnpm db:reset                   # re-apply all migrations + seeds from scratch
```

To point the app at the local stack, use the "Local Supabase stack" block in `.env.example` (and `ENABLE_TEST_PASSWORD_LOGIN=true` for password sign-in).

## Commands

| Command                                              | What it does                                                                            |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `pnpm dev` / `pnpm build` / `pnpm start`             | Next.js dev server / production build / serve                                           |
| `pnpm lint` · `pnpm typecheck` · `pnpm format:check` | ESLint · route typegen + `tsc` · Prettier                                               |
| `pnpm test`                                          | Unit tests (no database) — also run in CI                                               |
| `pnpm test:rls`                                      | RLS isolation (real users via Auth + PostgREST), SQL↔TS parity, SQL suite — local stack |
| `pnpm test:rls:sql`                                  | `supabase/tests/rls_isolation.sql` via psql (`SUPABASE_DB_URL` to override)             |
| `pnpm e2e`                                           | Playwright smoke (desktop + 390px) against a production build wired to the local stack  |
| `pnpm lighthouse <paths…>`                           | Lighthouse mobile on authenticated pages (see `scripts/lighthouse.mjs`)                 |
| `pnpm db:types`                                      | Regenerate `src/lib/db/types.ts` from the local schema                                  |

E2E and RLS tests create throwaway users **only** in the local stack — both refuse non-local databases. If your Playwright version's browser isn't downloaded, set `PW_CHROMIUM_PATH` to an installed Chromium.

## Database

- Migrations live in `supabase/migrations/` (CLI-compatible, file names match the versions recorded on the hosted project).
- Every domain table has `workspace_id` + RLS; helper functions live in the non-exposed `app_private` schema.
- Hosted project: `tpurdmhizhcuxvawxmkk` (us-west-1). Apply new migrations with `supabase db push` or the Supabase MCP `apply_migration` tool, then run the RLS suite (`node scripts/rls-hosted-sql.mjs` prints the hosted-safe variant).
- Seeds: Housing4All + AZH Builders hold configuration only (pipelines, stages, brand). Fictional sample data lives only in the **Demo** workspace (`is_demo = true`).

## Deploy

Vercel project `housing4all-platform` (team ERA Ventures) is Git-connected: PRs get preview deploys, merging to `main` deploys production. Production needs only the two public Supabase env vars. Functions run in `sfo1` (next to Supabase us-west-1).

**Supabase Auth settings that must match the deployed URL** (Dashboard → Authentication → URL Configuration): Site URL = production URL; Redirect URLs include `https://<prod-domain>/**` and the preview pattern. Google sign-in needs the Google provider configured with Sam's OAuth client.

## Project layout

```
src/app/              routes — /login, /auth/*, /invite/[token], /w/[slug]/… (workspace app)
src/components/       ui/ (shadcn primitives), shell/, people/, pipeline/, settings/, …
src/lib/              brand, nav, normalize, csv/, validation/ (Zod), supabase/ clients, db/types.ts
src/server/           server-only queries + server actions (all under the user's session → RLS)
supabase/             config.toml, migrations/, tests/rls_isolation.sql
tests/                unit/ (CI), rls/ (local stack), fixtures/
e2e/                  Playwright smoke + fixtures (GoHighLevel-format CSV)
docs/                 roadmap, ADRs, accounts, phase plans
```
