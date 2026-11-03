# Runbook: running the platform day to day

For whoever maintains the app after handover (a developer, or an AI coding agent working under Sam's
accounts). Plain steps, no secrets. The accounts themselves are listed in `docs/ACCOUNTS.md`.

**Where things live**

| What                  | Where                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------- |
| Code                  | GitHub `Kickback13/Sam` (moves to Sam's account at handover)                              |
| Hosting               | Vercel project `housing4all-platform`; production = the `main` branch                     |
| Database, auth, files | Supabase project `jcrjzmflepnvvvneahvs` (Postgres + RLS, Auth, Storage, Vault)            |
| Background jobs       | Inngest (forwarded alert emails); without it, jobs run inline                             |
| Secrets               | Vercel → Environment Variables, and Supabase Vault for per-workspace tokens. Never in git |

## 1. Shipping a change

1. Branch from `main`, make the change, then run `pnpm lint && pnpm typecheck && pnpm test`. For anything touching data or screens, also run `pnpm db:start`, `pnpm test:rls` and `pnpm e2e`.
2. Open a pull request. CI runs lint, typecheck, unit tests, build, the RLS suites and the e2e tests against a local database. Vercel posts a preview link.
   - **Previews use the production database.** Look, but don't submit forms on a preview.
3. Merge only when CI is green. Vercel deploys `main` to production in about 2 minutes.

**Rolling back a bad deploy:** Vercel → Project → Deployments → pick the last good production deployment → **Instant Rollback**. Then revert the bad commit on GitHub so the next deploy doesn't bring it back.

## 2. Database changes (migrations)

The live database is changed only by a person, in the Supabase SQL Editor. Never from a developer's machine or an automated tool.

1. Add a new file `supabase/migrations/<UTC timestamp>_<h4a|azh>_<topic>.sql`.
   - Never edit an old migration.
   - Additive only: never drop or rename a table, column, policy or function.
   - Every new table needs `workspace_id`, RLS, policies and a test.
2. Run `pnpm db:reset` locally, then `pnpm db:types` (regenerates `src/lib/db/types.ts`; never hand-edit it), then the tests.
3. Build one combined SQL file for the human to run:
   - `begin`;
   - a guard that refuses if the migration is already recorded;
   - the migration, verbatim;
   - an insert into `supabase_migrations.schema_migrations`;
   - `commit`.

   Prove it locally:
   - take the migration out, reset;
   - apply the combined file with `psql -f`;
   - run the verify file;
   - run the combined file again and confirm the guard refuses.

4. Make the verify file with `node scripts/rls-hosted-sql.mjs`. It wraps the feature's RLS suite so it creates and then removes its own test data.
5. The person applying it:
   - opens Supabase → SQL Editor → New query;
   - pastes the combined file and runs it (it should print the "update applied" notice);
   - then pastes and runs the verify file. It must show **failed 0, leftover_workspaces 0, leftover_users 0**.
6. Only then merge the pull request whose code needs the new schema.

## 3. Backups and restore

- Supabase Pro takes **daily backups** (Supabase → Database → Backups). Restoring replaces the whole database with that day's copy, so anything entered since is lost. Use it only for real disasters.
- **Point-in-Time Recovery** (paid add-on) restores to any second. Turn it on once Sam's live deal data matters.
- **Extra off-site copy (recommended monthly):**
  1. Supabase → Database → Connect → copy the "Session pooler" connection string.
  2. On a trusted computer: `pg_dump "<connection string>" --no-owner -Fc -f h4a-YYYY-MM.dump`.
  3. Store it somewhere private (Sam's Google Drive).

  To restore into a fresh project, run `pg_restore --no-owner -d "<new connection string>" h4a-YYYY-MM.dump`.

- **Files** (AZH photos, receipts, estimate PDFs) are in Supabase Storage and are included in project backups. They are not in `pg_dump`.
- **Single-record mistakes:** most changes are in `audit_log` (who, what, when, before/after). Look there first; usually the fix is re-entering a value, not a restore.

## 4. People and access

- **Add someone:** Settings → Members & invites → invite, then pick a role:
  - **Owner:** Sam.
  - **Admin:** full setup rights.
  - **Agent:** works deals and contacts.
  - **Viewer:** read-only.
- **Remove someone:** Settings → Members & invites → remove. Their access ends at their next page load. Their past activity stays attributed to them.
- **Network members** (outside investors) are separate from workspace members and never see the CRM. Manage them in Network → Members.

## 5. Changing a key (rotation)

Do this when someone with access leaves, or if a key may have leaked. In every case: create the new key, put it where it goes, redeploy if it is a Vercel variable (Deployments → … → Redeploy), check the feature, then delete the old key.

| Key / token                                 | Where it lives                  | How to rotate                                                                                                                                 |
| ------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`      | Vercel env (public value)       | Supabase → Settings → API Keys → new publishable key → Vercel → redeploy → revoke the old one                                                 |
| Supabase secret / service-role keys         | Not used by the app             | Rotate in Supabase → Settings → API Keys if anyone ever copied one                                                                            |
| `RESEND_API_KEY`                            | Vercel env                      | Resend → API Keys → create (Full access) → Vercel → redeploy → delete old                                                                     |
| `RESEND_WEBHOOK_SECRET`                     | Vercel env                      | Resend → Webhooks → the `email.received` webhook → roll secret → Vercel → redeploy                                                            |
| `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` | Vercel env (set by integration) | Inngest → rotate signing key; the Vercel integration updates the variables                                                                    |
| `ANTHROPIC_API_KEY`                         | Vercel env                      | Anthropic Console → API Keys → create → Vercel → redeploy → disable old                                                                       |
| `TWILIO_AUTH_TOKEN`                         | Vercel env                      | Twilio Console → Account → API keys & tokens → secondary token → Vercel → redeploy → promote it                                               |
| `ELEVENLABS_WEBHOOK_SECRET`                 | Vercel env                      | ElevenLabs → the agent's post-call webhook → new secret → Vercel → redeploy                                                                   |
| GoHighLevel token                           | Supabase Vault (via the app)    | GHL → Private Integrations → new token → app: Settings → Integrations → GoHighLevel → Disconnect, then Connect with the new token             |
| Forwarded-email address                     | App (hashed token)              | Settings → Integrations → Forwarded alert emails → **Replace forwarding address** (the old one stops working) → update Sam's alert forwarding |
| Receptionist connection links               | App (hashed token)              | Receptionist → Setup → **Make new links** (old links stop working at once) → paste into Twilio and ElevenLabs                                 |

## 6. When something breaks

1. **Is it everyone or one person?** Have them sign out and in again. Most single-user issues are an expired session.
2. **Vercel → Project → Logs** (filter by error) shows server errors with the page they happened on.
3. **Supabase → Logs** (API, Postgres, Auth) shows database or sign-in errors.
4. **An integration says "Not connected" or errors:**
   - check its Vercel variables are set for Production;
   - check the provider's own dashboard (Resend → Logs, Twilio → Monitor → Logs, Inngest → Runs).
5. **Bad deploy:** roll back (§1).
6. **Suspected leak or break-in:**
   - rotate the affected keys (§5);
   - remove unknown members (§4, and each dashboard's team page);
   - review `audit_log`;
   - write down what happened and when.

## 7. Monthly check (15 minutes)

- [ ] `pnpm audit --prod`: update anything high or critical.
- [ ] Supabase → Database → Backups shows recent backups; take the off-site `pg_dump` (§3).
- [ ] Settings → Members in both workspaces, plus the Vercel / Supabase / GitHub team pages: everyone still needs access.
- [ ] Costs: Vercel, Supabase, Resend, Twilio, ElevenLabs, Anthropic usage match expectations (`docs/ACCOUNTS.md`).
