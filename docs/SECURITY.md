# Security review: Housing4All + AZH Builders platform

Phase 9A review, **2026-11-02**, of `main` at `bb94373` (all phases through 7A plus the font fix).
It covers the code, the database schema and policies, and the dependencies. It does **not** cover account
settings in Vercel, Supabase, GitHub or third-party dashboards, which this review could not access. Sam's
team checks those with the list in [§5](#5-account-settings-to-check-by-hand).

The automated checks in §1 run in CI on every pull request (`tests/rls/security-invariants.test.ts`
plus the per-feature RLS suites), so a later change that breaks them fails the build.

## 1. Database (Supabase Postgres)

| Check                                                                             | Result | Enforced by                                   |
| --------------------------------------------------------------------------------- | ------ | --------------------------------------------- |
| Every `public` table has row-level security (RLS) **and** at least one policy     | Pass   | `security-invariants.test.ts`                 |
| Every table except `workspaces` / `profiles` has `workspace_id`                   | Pass   | `security-invariants.test.ts`                 |
| One workspace can never read or write another's rows (users, roles, every table)  | Pass   | `rls_isolation.sql` + 7 feature suites (CI)   |
| The anonymous role has no direct table privileges                                 | Pass   | `security-invariants.test.ts`                 |
| Every `SECURITY DEFINER` function pins `search_path`                              | Pass   | `security-invariants.test.ts`                 |
| Anonymous callers can run only 22 reviewed functions, each guarded inside         | Pass   | allow-list in `security-invariants.test.ts`   |
| `app_private` (RLS helpers, triggers) is not exposed through the Data API         | Pass   | `supabase/config.toml` check in the same test |
| Storage buckets are private, with size limits and file-type allow-lists           | Pass   | `security-invariants.test.ts`                 |
| Integration secrets (GoHighLevel token) live in Supabase Vault, not table columns | Pass   | `h4a_ghl_rls.sql`                             |
| Webhook tokens are stored only as SHA-256 hashes                                  | Pass   | inbound email + receptionist suites           |

The anonymous functions fall into three groups:

- **Token-guarded webhooks:** inbound email, Twilio, ElevenLabs. A random per-workspace token, stored hashed, plus the provider's signature.
- **Link pages:** invites and unsubscribe, guarded by random tokens.
- **Public pages:** the AZH request form and Network branding, which are public by design and rate-limited.

Those functions that need a person (GoHighLevel, receptionist setup, accepting an invite) refuse a caller who isn't signed in. I verified this by calling each one as `anon`.

## 2. Application (Next.js on Vercel)

| Check                                                                                                           | Result                                                      |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| The service-role (master) key is not used anywhere in app code; every query runs as the user                    | Pass                                                        |
| No secrets in tracked files or git history (API keys, private keys, JWTs, tokens)                               | Pass                                                        |
| Only `.env.example` is committed; it holds public values only                                                   | Pass                                                        |
| Server actions validate input with Zod and write `audit_log`                                                    | Pass                                                        |
| Every page and API route requires a session except an explicit public list (`src/lib/supabase/proxy.ts`)        | Pass                                                        |
| Webhooks reject unsigned requests in production (Resend, Twilio, ElevenLabs, Inngest)                           | Pass                                                        |
| Rate limits: sign-in, public AZH form + photo uploads, inbound email                                            | Pass                                                        |
| Test password sign-in is hard-disabled in production (`VERCEL_ENV=production`)                                  | Pass                                                        |
| No automatic outbound texts/emails; newsletters stay behind consent + opt-out gates and a flag                  | Pass                                                        |
| Security headers: `nosniff`, `X-Frame-Options: DENY` (except the AZH form embed), referrer + permissions policy | Pass                                                        |
| HTTPS + HSTS                                                                                                    | Pass. Vercel serves HTTPS only and adds HSTS on its domains |

## 3. Dependencies

`pnpm audit --prod` found 3 advisories. All of them come in through Inngest's OpenTelemetry instrumentation:

| Package                       | Severity                                         | Status                                                                                                   |
| ----------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `systeminformation` < 5.33.16 | High (Windows-only command injection)            | **Fixed**: pinned to 5.33.19 with a pnpm override (`pnpm-workspace.yaml`)                                |
| `glob` 9–14.0.1               | Moderate                                         | Not reachable: used only by `rimraf` inside the Google Cloud metadata detector; no user input reaches it |
| `minimatch` < 11.0.1          | Moderate (ReDoS on attacker-controlled patterns) | Not reachable: same path; patterns are fixed                                                             |

Re-run `pnpm audit --prod` monthly. Dependabot or Renovate, if Sam enables it on GitHub, will open update PRs automatically.

## 4. Known gaps (ranked)

1. **The repository is public.** Make it private when it moves to Sam's GitHub (`docs/HANDOVER.md`). Nothing secret is in it, but the code and docs describe the business.
2. **Accounts still under the agency:** GitHub, Vercel, Supabase org, Inngest. Transfer them per `docs/HANDOVER.md`.
3. **No Content-Security-Policy header.** Next.js inline scripts and the per-workspace brand `<style>` would need nonces, which would make every page dynamic. The other headers plus React's escaping cover the common cases. Revisit if a page ever renders user-supplied HTML (none does today).
4. **Auth emails use Supabase's built-in sender**, which is rate-limited and meant for testing. Set up Resend SMTP before outside Network members sign in (`docs/ACCOUNTS.md`).
5. **Agency access after handover.** The agency's admin logins stay until Sam removes them. Sam decides who keeps access (Settings → Members → change role or remove).

## 5. Account settings to check by hand

These need dashboard access, so Sam or Keanu does them. Tick each one at handover.

- [ ] **Supabase → Authentication → URL configuration:** Site URL and Redirect URLs list only the production domain(s) and `http://localhost:3000`.
- [ ] **Supabase → Authentication → Providers:** only Email (and Google, once set up) enabled; "Allow new users to sign up" matches the plan (invites only).
- [ ] **Supabase → Settings → API:** exposed schemas are `public` and `graphql_public` only.
- [ ] **Supabase → Database → Backups:** daily backups are on (included in the Pro plan); consider Point-in-Time Recovery when there is real deal data.
- [ ] **Supabase → Organization → Members:** only people Sam approves; MFA on for owners.
- [ ] **Vercel → Project → Settings → Environment Variables:** secrets set for Production only where possible; previews never hold live messaging keys.
- [ ] **Vercel → Team → Members:** only people Sam approves; MFA on.
- [ ] **GitHub → Settings:** repo private; branch protection on `main` (require the CI checks, no force-push); MFA required for collaborators.
- [ ] **Every third-party account** (Resend, Twilio, ElevenLabs, Inngest, Anthropic, GoHighLevel): Sam's email is the owner, MFA on, billing in Sam's name.
