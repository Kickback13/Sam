# Handoff to Keanu: where the build stands (2026-11-03)

Michael ran the Housing4All track (Track A) with Claude Code through Phase 7A, 9A and 5B. His credits are running out, so this is everything you need to carry on. **Deadline: November 15.**

Read first: `CLAUDE.md`, `docs/COLLABORATION.md`, `docs/RUNBOOK.md` (especially §2, how live database updates work).

## 1. Open pull requests: what to do with each

| PR | What | State | Your action |
| --- | --- | --- | --- |
| [#17](https://github.com/Kickback13/Sam/pull/17) `h4a/handover` | Phase 9A: security review, automated security checks (CI), runbook, handover and training guides, this file, Phase 5B SQL files | CI green, **no migrations** | Review and merge. |
| [#18](https://github.com/Kickback13/Sam/pull/18) `h4a/ghl-auto-import` | Phase 5B: automatic one-way GoHighLevel import | Adds migration `20261103010000_h4a_ghl_auto_import`. CI was running at handoff. | **First** apply the live DB update (below), then merge when CI is green. |
| [#16](https://github.com/Kickback13/Sam/pull/16) `azh/budget-refresh-race` (draft) | AZH budget screen: removes an extra `router.refresh()` that raced with the next action (3 lines) | Green; AZH lane, so it needs **your** review | Review, mark ready, merge. |

**Merge order:** #17, then the #18 DB update and #18, then #16 (any order works; they don't touch the same files). After merging #17, the security test in `tests/rls/security-invariants.test.ts` also checks #18's functions. They are revoked from `anon`, so it stays green.

### Applying the Phase 5B live database update (needed before merging #18)
Both files are in `docs/db-updates/` (on #17's branch; also attached to the chat with Michael).
1. Supabase → project `jcrjzmflepnvvvneahvs` → **SQL Editor → New query** → paste all of `2026-11-h4a-phase-5b.sql` → Run. It should print **"Housing4All Phase 5B database update applied"**. If it says "already applied", it was done before.
2. New query → paste all of `2026-11-h4a-phase-5b-verify.sql` → Run. It must show **passed 26, failed 0, leftover_workspaces 0, leftover_users 0**.
3. Merge #18.

I proved these locally: migrations go from 29 to 30, verify shows 26/0, and a re-run is refused.

## 2. What's live in production now (main @ `bb94373`)

- **Phases 1–4A:** CRM, Deal Finder + buy box + verification + alerts, property analysis, and outreach behind compliance gates.
- **5A:** GoHighLevel one-time import.
- **6A:** Housing4All Network (PWA).
- **7A:** AI receptionist.
- **Faster AZH pages on phones:** fonts are self-hosted and preloaded per workspace.
- All DB updates through 7A are applied and verified.

## 3. What only people can do (nothing for an AI to build)

These are all in `docs/HANDOVER.md` (account transfers) and `docs/ACCOUNTS.md` (per-service steps):
1. Invite Sam's personal Gmail as **Owner** in both workspaces (Settings → Members & invites).
2. Sam's data:
   - Housing4All buy box (30+ units, San Diego ZIPs, 1995+);
   - the Blythe property (535 W Barnard St; price and acreage to confirm);
   - Outreach settings in each workspace.
3. **AZH GoHighLevel:**
   - create a read-only Private Integration in GHL;
   - paste it into Settings → Integrations → GoHighLevel;
   - import contacts and opportunities;
   - after #18, tick **Import automatically**.
4. **Sam's accounts:**
   - Resend (email, plus Supabase SMTP);
   - Google OAuth;
   - Twilio + ElevenLabs (receptionist);
   - RentCast (unlocks Phase 3B);
   - Anthropic key (AI summaries);
   - reactivate Housing4All GHL.
5. **Transfers to Sam:** GitHub repo (then make it private), Vercel project, Supabase project, Inngest.
6. Work through `docs/SECURITY.md` §5, the settings you can only check in the dashboards.

## 4. What's left to build

- **Phase 3B:** property data via RentCast. Blocked until Sam signs up and the key is set.
- **Phase 4B:** broker ranking from Sam's listings, plus a long-hold owners list (15+ years) from county data. No accounts needed.
- **Phase 8:** AZH build-out. Track B, yours.
- **Phase 9 (rest):** cold-email infrastructure on warmed domains. Needs Sam's domains and Resend.
- **Optional follow-ups:**
  - add the one-line font preload to the public AZH request form (`src/features/azh/components/public-shell.tsx`, Track B lane);
  - a server-side cron for the GHL auto-import (needs a server key in Vercel; see ADR-032).

## 5. House rules this track followed (keep them)

- **Live DB:** never connect to the live DB from an agent. Build the combined SQL and verify files, prove them locally, and a human runs them in the SQL Editor. Never merge a PR that needs a migration until the verify passes.
- **Previews:** Vercel previews use the **production** database. Don't submit forms on a preview.
- **Migrations:** new files only, additive, named `<UTC timestamp>_<h4a|azh>_<topic>.sql`. The latest is `20261103010000`. Every new table gets `workspace_id`, RLS and an SQL test suite.
- **Generated types:** `src/lib/db/types.ts` is generated (`pnpm db:types`); never hand-edit it.
- **Git:** sync by merging `origin/main`. No rebase, no force-push, never push to `main`.
- **Messages and data:** no scraping, no automatic texts or emails, no fake data outside demo workspaces, no secrets in git. Tokens are pasted by admins into the app, never sent through chat.

## 6. Running tests in a Claude Code cloud container (gotchas)

- **Docker dies when the container restarts.** Restart `dockerd` and run `supabase start`. If `pnpm db:types` ran while the DB was down and emptied the types file, run `git checkout -- src/lib/db/types.ts`.
- **E2E needs the pre-installed browser:** `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium pnpm e2e`. Don't run `playwright install`.
- **Lint:** delete `playwright-report/` and `test-results/` before `pnpm lint`.
- **Stale e2e results:** if an e2e fails on leftover data from earlier runs, run `pnpm db:reset` first.
- **Expected numbers at handoff (#18 branch):**
  - unit 387;
  - RLS 47 (13 files);
  - e2e 45 (desktop + 390 px).
