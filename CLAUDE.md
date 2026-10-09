# CLAUDE.md — Housing4All + AZH Builders Platform

@AGENTS.md

Read this first in every session. The 9-phase roadmap is in `docs/ROADMAP.md`, architecture decisions in `docs/DECISIONS.md`, accounts in `docs/ACCOUNTS.md`, and the per-phase plans in `docs/phases/`.

## Who

- **Client / owner:** Sam Rodriguez, CEO of **Housing4All Premier Solutions** (CA brokerage, DRE #01735348) and **AZH Builders** (general contractor). Sam owns the code and every account.
- **Builder:** Keanu (AI Entrepreneurs LLC) runs the build; Michael is the other agency admin. Vianney Rodriguez is Sam's associate at Housing4All.
- Roles in the app: `owner` (Sam), `admin` (Keanu, Michael), `agent` (Vianney), `viewer`.

## Business A — Housing4All (real estate)

- San Diego multifamily brokerage + acquisitions (Sam also buys for his own portfolio). 2–500 units: residential is duplex/triplex/fourplex only (no single-family); sweet spot 30–500 units. Office 3683 University Ave, San Diego, CA 92104 · (619) 843-1663.
- Core loop: **AI finds → buy-box filter → county-record verification → alert → contact → book → pipeline → close.**
- **Accuracy is the product.** Every number shows its source and fetched-at time (`properties.field_sources`). Manual entries show "Entered by {user}".
- Pipeline: **New Deal → Qualified → Contacted → Interested → Underwriting → Offer → Closed**, plus Lost.
- Contract modules: 1 deal finder + buy box · 2 verification · 3 instant alerts · 4 property intelligence · 5 people DB · 6 outreach + booking · 7 deal analysis · 8 pipeline + GHL sync · 9 Housing4All Network · 10 AI receptionist · 11 website/Google (separate) · 12 handover.

## Business B — AZH Builders (construction)

- GC: framing, drywall, painting, carpentry, cement, ADUs, tenant improvements, renovations; residential + commercial. Offices San Diego (3683 University Ave · (619) 202-0679) and Fallbrook (532 E. Fallbrook Ave · (760) 691-5000).
- Audiences: GCs, homeowners, investor/GC community.
- Pipeline: **Lead → Estimate → Bid Sent → Won → In Progress → Complete → Review**, plus Lost.
- Contract modules: 13 contacts/CRM · 14 project pipeline · 15 AZH community · 16 communication hub · 17 homeowner request intake · 18 website/Google (separate) · 19 handover.

## Shared

- Sam's CRM today is **GoHighLevel** (two-way sync in Phase 5). This app is the system of record for deal intelligence; GHL stays his messaging/pipeline tool.
- English now; Spanish later (`contacts.language`).

## Non-negotiable rules

1. **Real, working code only.** Unconnected integrations = real interface + adapter + a labeled **"Not connected"** state. Never fake numbers in Sam's workspaces.
2. **Demo data only in the Demo workspace** (`workspaces.is_demo = true`). Sam's workspaces hold configuration only until he adds data.
3. **No scraping** of CoStar, LoopNet, Crexi, Zillow, Redfin or the MLS. Data comes from Sam's alert emails, his exports, licensed APIs and public county records.
4. **No automated outbound messages** until Phase 4, and then only behind compliance gates: TCPA consent (`sms_consent*`), STOP opt-out, quiet hours, CAN-SPAM (`email_opt_out`), DNC (`dnc`).
5. **No secrets in git.** `.env.local` + `.env.example`. Integration tokens → Supabase Vault, never plaintext columns.
6. **Sam owns accounts.** No hardcoded agency accounts/emails in code or migrations. Log every account in `docs/ACCOUNTS.md`.
7. **Multi-tenant:** every domain table has `workspace_id` + RLS. Tested (`supabase/tests/rls_isolation.sql`, `tests/rls`).
8. **WCAG AA.** Cyan `#00D9E1` / yellow `#FFC20E` are fills only, with black text. Use `accent-text` tokens (`#007B82`, `#8A6400`) for colored text on white.
9. **Mobile-first.** Every screen works at 390px.
10. **Green before main.** Lint, typecheck, unit, e2e pass before merging; CI must be green.

## Stack

Next.js 16 (App Router, Server Components + Server Actions, Turbopack) · TypeScript strict · Tailwind v4 · shadcn/ui (vendored, on `radix-ui`) · lucide-react · dnd-kit · Supabase (Postgres + RLS, Auth, Storage, Realtime) · Zod · Vitest · Playwright · GitHub Actions · Vercel · pnpm. Phase 2+: Inngest (jobs), Anthropic SDK (AI with citations), Resend (email).

Next.js 16 notes: middleware is `src/proxy.ts` (export `proxy`); `cookies()`/`headers()`/`params`/`searchParams` are async; Cache Components is **off** (ADR-004). Read `node_modules/next/dist/docs/` before using unfamiliar APIs.

## Folder conventions

```
src/app/                    routes (App Router)
  (auth)/login, auth/*      sign-in, callbacks
  invite/[token]            invite acceptance
  w/[slug]/...              workspace-scoped app (layout applies brand + shell)
src/components/ui/          shadcn/ui primitives (vendored)
src/components/<feature>/   feature components (shell, people, pipeline, …)
src/lib/supabase/           server/browser clients + session refresh
src/lib/db/types.ts         generated DB types (pnpm db:types / MCP generate_typescript_types)
src/lib/validation/         Zod schemas shared by forms and server actions
src/lib/                    pure utils (normalize, csv, brand, nav, format)
src/server/                 server-only data access + actions (always via the user's session → RLS)
supabase/migrations/        ordered SQL migrations (CLI compatible)
supabase/tests/             SQL test suites (RLS isolation)
tests/unit, tests/rls       Vitest
e2e/                        Playwright smoke tests
docs/                       roadmap, decisions, accounts, phase plans
```

- Server actions validate with Zod, run under the user's session (RLS enforces tenancy), and write `audit_log`.
- Never use the service-role key in app code paths that a user can trigger.
- Money is `numeric`; show it with `formatCurrency`. Dates are `timestamptz`, shown in the viewer's locale.

## How to run

```bash
pnpm install
cp .env.example .env.local            # public Supabase values are pre-filled
pnpm dev                              # http://localhost:3000

# local Supabase stack (Docker) for e2e + RLS tests
pnpm db:start                         # supabase start (Docker Hub images)
pnpm test                             # unit tests
pnpm test:rls                         # RLS isolation vs local stack
pnpm e2e                              # Playwright smoke (builds + starts the app against the local stack)
pnpm lint && pnpm typecheck
```

Migrations: add a file to `supabase/migrations/` (`YYYYMMDDHHMMSS_name.sql`), apply locally with `pnpm db:reset`, and to the hosted project with the Supabase MCP `apply_migration` (or `supabase db push`). Regenerate types after every schema change.

## Handoff report format (print at the end of every phase, < ~150 lines)

```
# PHASE N HANDOFF — Housing4All Platform
## 1. Summary (3–5 lines)
## 2. Live URLs (prod temp domain, latest preview) + how to sign in
## 3. What works — feature → route → how to verify in under 1 minute
## 4. Stubbed / not connected — what and why
## 5. Data model — tables added/changed, migrations list
## 6. Env vars — name → set locally? set in Vercel? (never print values)
## 7. Accounts & costs — service, owner email, plan, $/mo
## 8. Tests — commands + pass/fail counts + Lighthouse scores
## 9. Decisions made (ADR titles) + anything you'd reverse
## 10. Known issues / tech debt (ranked)
## 11. Questions for Keanu / Sam (numbered, answerable in one line each)
## 12. Repo state — branch, last commit hash, CI status
## 13. Ready for Phase N+1? Yes/No + what's blocking
```
