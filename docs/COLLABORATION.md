# Two-track collaboration rules

Two Claude Code tracks build this repo in parallel. These rules keep them from
breaking each other. They apply to humans too.

## Tracks and lanes

| Track | Business                    | Branches    | Owns                                                                                                                                                                                                                         |
| ----- | --------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A** | Housing4All (real estate)   | `h4a/*`     | Deal Finder, Alerts, buy box, listings, scoring, verification, `/api/inbound/*`, Settings → Buy box, Settings → Integrations, **the CI workflow files** (`.github/workflows/*`), and anything real-estate-only.              |
| **B** | AZH Builders (construction) | `azh/track` | `/w/[slug]/projects/**`, `/w/[slug]/requests/**`, `/w/[slug]/schedule/**`, `/w/[slug]/settings/azh`, public `/r/**`, `src/features/azh/**`, migrations named `*_azh_*.sql`, `supabase/tests/azh_*.sql`, `e2e/azh-*.spec.ts`. |

- A track never edits the other track's files, even to "fix" them. If something
  of the other track's blocks you, write it in your progress log
  (`docs/progress/<TRACK>.md`) and work around it inside your own lane.
- Track B documents its decisions in `docs/DECISIONS-AZH.md` (AZH-001, AZH-002…)
  and never adds to `docs/DECISIONS.md`.

## Shared files

Shared files: the nav config (`src/lib/nav.ts`), app shell/layouts, the Today
page, the pipeline/board components, the Settings tab list, theme
(`globals.css`, `src/lib/brand.ts`), shared UI (`src/components/ui`,
`src/components/common`), DB helpers (`src/server/*`, `src/lib/db/*`),
`package.json` / `pnpm-lock.yaml`, test config, `CLAUDE.md`.

1. Touch a shared file only when truly needed, with the smallest possible change.
2. Prefer a hook-in point (one import + one line, or an optional prop) and put
   the real code in your own feature folder.
3. List every shared file you touched, and why, in your progress log.
4. `pnpm-lock.yaml` conflicts: run `pnpm install` to regenerate. Never hand-edit it.
5. `src/lib/db/types.ts` is generated (`pnpm db:types`). Never hand-edit or
   hand-merge it — after a merge, reset the local DB and regenerate.

## Database rules

1. Never edit an existing migration.
2. Additive only: never rename or drop a table, column, policy or function.
3. Track B migration files are named `<UTC timestamp>_azh_<topic>.sql`.
4. Every new table and storage bucket has `workspace_id` and RLS, with tests
   (`supabase/tests/*.sql` and/or `tests/rls`).
5. Tests run against the **local** Supabase stack only (`pnpm db:start`). Neither
   track's automation connects to the hosted project; migrations reach hosted
   only after merge, applied by Keanu.
6. When both tracks add migrations, the hosted project may need them applied out
   of timestamp order. Each track's handoff says whether its migrations depend on
   the other's.

## Merging

1. Neither track pushes to `main`, force-pushes, or rewrites history.
2. Each track syncs by merging `origin/main` **into** its branch (no rebase).
   Conflicts in the other track's files are resolved by keeping their version.
3. **Track B (`azh/track`) is never merged without Keanu's review.** Its PR stays
   a draft until the handoff, then "Ready for review"; Keanu merges.
4. Green before main: format, lint, typecheck, unit tests, e2e and CI must pass.
