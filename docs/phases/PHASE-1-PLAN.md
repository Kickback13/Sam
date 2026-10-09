# Phase 1 Plan — Foundation & CRM Core

Status: in progress · Branch: `claude/great-curie-5qbeoz` → PR → `main` (production deploy)

## Environment findings (session start)

- Supabase MCP connector is available → migrations/seed/RLS tests go through `apply_migration` / `execute_sql` on `tpurdmhizhcuxvawxmkk`. No token needed.
- This cloud environment's egress policy blocks direct HTTPS to `*.supabase.co`, `*.vercel.app` and `ui.shadcn.com`.
  - E2E + Vitest RLS suites run against a **local Supabase stack** (Supabase CLI + Docker Hub images) with the exact same migrations.
  - The SQL RLS suite (`supabase/tests/rls_isolation.sql`) runs against the **hosted** project through the connector, inside a rolled-back transaction.
  - shadcn/ui components are vendored by hand (same file layout as the CLI output).
- Next.js 16.4 (`create-next-app` default) ships Cache Components on; we turn it off for Phase 1 (see ADR-004).

## Task breakdown

### A. Bootstrap
1. `.gitignore` first commit (env files, node_modules, .next, .vercel, test artifacts).
2. Next.js 16 App Router + TS strict + Tailwind v4 + ESLint 9 + Prettier + Vitest + Playwright + pnpm.
3. Vendored shadcn/ui primitives on `radix-ui`; lucide-react; sonner toasts; cmdk; dnd-kit.
4. `CLAUDE.md`, `README.md`, `docs/ROADMAP.md`, `docs/DECISIONS.md`, `docs/ACCOUNTS.md`, `.env.example`.

### B. Data model (`supabase/migrations`)
1. `init_core` — extensions (pg_trgm, citext), enums, `app_private` helper schema, workspaces, profiles (+ auth trigger), workspace_members, invites + RPCs (accept, preview).
2. `crm_tables` — companies, contacts (compliance fields, dedupe keys), properties (`field_sources`), pipelines, pipeline_stages, deals, deal_contacts, deal_stage_history, activities, tasks, integrations, imports, audit_log.
3. `rls_policies` — RLS on every table; member read, writer (owner/admin/agent) write, admin for settings/members.
4. `triggers_and_rpcs` — updated_at, search_text maintenance, dedupe-key normalization, deal stage-change history + activity, won/lost status sync, `global_search`, `workspace_counts`, `find_contact_duplicates`.
5. `seed_workspaces` — Housing4All + AZH Builders (config only: pipelines, stages, brand, integration rows).
6. `seed_demo` — Demo workspace with obviously fictional data (~40 contacts, 15 properties, 12 deals).
7. Generate `src/lib/db/types.ts`; run security + performance advisors.

### C. Auth & workspaces
1. `@supabase/ssr` server/browser clients; `src/proxy.ts` refreshes the session and remembers last workspace.
2. Login: magic link, Google OAuth, dev/test-only password (env-gated, hard-off on Vercel production).
3. `/auth/callback` (PKCE code) + `/auth/confirm` (token_hash) + sign out.
4. Invites: email-bound or single-use link; `/invite/[token]`; pending invites auto-accepted on sign-in by verified email.
5. Workspace switcher; last-used workspace in cookie + `profiles.last_workspace_id`.

### D. Theming & shell
1. Brand tokens from `workspaces.brand` → validated → CSS variables on the workspace layout; all four font families loaded.
2. Sidebar (#0B0C10) with grouped nav + real count badges; top bar with ⌘K + user menu; mobile bottom nav + drawer.
3. Nav per `business_type`; future modules get honest "Coming in Phase N" routes.

### E. CRM features
1. Today: my due/overdue tasks, deals by stage (count + $), recent activity, guided empty states.
2. People: table w/ search, filters, sort, pagination, bulk tag/assign; detail with compliance badges, linked deals/properties, timeline, tasks, log call/add note; create/edit/soft-delete.
3. CSV import: upload → mapping (GHL presets) → preview → dedupe (skip/update) → chunked import → error report CSV; import history.
4. Companies: list/detail/create/edit, linked contacts.
5. Properties: list/detail/create/edit, owner + deals, `field_sources` chips.
6. Pipeline: dnd-kit kanban (between + within stages, optimistic), stage history + activity via DB trigger, deal drawer, won/lost with reason, mobile stage-tabs list.
7. Activities & tasks: notes, calls, meetings; tasks with due dates; My tasks view.
8. ⌘K global search (pg_trgm) across contacts, companies, properties, deals.
9. Settings: workspace profile/branding, members & invites, pipeline/stage editor, honest integrations page.
10. Audit log written from every server action.

### F. Quality
1. Vitest: normalization, Zod schemas, CSV mapping/dedupe, brand contrast, nav; RLS isolation suite (two users) against local stack.
2. SQL RLS suite against hosted project via connector.
3. Playwright smoke: sign in → contact → 10-row CSV → property → deal → drag → activity logged → switch workspace (isolation + re-skin).
4. GitHub Actions: lint, typecheck, unit, build.
5. Lighthouse (mobile) on Today + People.

### G. Ship
1. PR → CI green → merge to `main` → verify Vercel production deploy.
2. Invite links for Keanu; handoff report.

## Out of scope (by design)
Any outbound messaging, scraping, paid services, secrets in Vercel, service-role usage.
