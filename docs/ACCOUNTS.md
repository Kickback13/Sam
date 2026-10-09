# Accounts & Ownership

Rule: Sam owns everything. Each third-party account ultimately lives under one of Sam's emails — one for **Housing4All** and one for **AZH Builders**. Development may run on Keanu's accounts; every account is listed here with its transfer plan. Never put credentials in this file.

Sam's account emails: **TBD (question open for Sam)** — referred to below as `SAM_H4A_EMAIL` and `SAM_AZH_EMAIL`.

| Service | Purpose | Current owner | Plan / cost | Target owner | Transfer plan | Phase |
|---|---|---|---|---|---|---|
| GitHub `Kickback13/Sam` | Source code | Keanu (`Kickback13`) | Free | Sam (`SAM_H4A_EMAIL` GitHub org/user) | Settings → Transfer ownership to Sam's account/org; make private; re-link Vercel Git | 1 |
| Vercel project `housing4all-platform` | Hosting (prod + previews) | Keanu, team **ERA Ventures** | Team plan (existing, Keanu) — $0 incremental for now | Sam's Vercel team | Project → Settings → Transfer project to Sam's team (Pro $20/mo/member if commercial use requires) | 1 |
| Supabase project `housing4all-platform` (`tpurdmhizhcuxvawxmkk`) | DB, Auth, Storage | Keanu's org | Free tier now; **Pro $25/mo recommended before go-live** (backups, no pausing) | Sam's Supabase org | Project → Settings → General → Transfer project to Sam's org | 1 |
| Google Cloud OAuth client | "Sign in with Google" | not created | Free | `SAM_H4A_EMAIL` | Create in Sam's Google Cloud project; paste client ID/secret into Supabase → Auth → Providers → Google | 1 |
| Email (SMTP for auth emails) | Magic links / invites to non-team emails | Supabase built-in (team members only, rate-limited) | Free | Resend under `SAM_H4A_EMAIL` | Configure Resend SMTP in Supabase → Auth → SMTP (Resend free 3k/mo, Pro $20/mo) | 1–2 |
| Resend | Outbound + inbound email parsing | not created | Free → $20/mo | `SAM_H4A_EMAIL` | Create under Sam; verify sending domain | 2 |
| Inngest | Background jobs | not created | Free (Hobby) | `SAM_H4A_EMAIL` | Create under Sam; link Vercel integration | 2 |
| Anthropic API | AI summaries with citations | not created | Usage-based | `SAM_H4A_EMAIL` | Create org under Sam; key in Vercel env | 2–3 |
| Data API (ATTOM / RentCast / PropertyRadar) | Property intelligence | not chosen | Paid (ADR in Phase 3) | `SAM_H4A_EMAIL` | Sam signs up; key in Vault | 3 |
| Mapbox | Maps | not created | Free tier | `SAM_H4A_EMAIL` | Create under Sam | 3 |
| Skip-trace provider | Owner contact lookup | Sam's existing account (TBD) | Usage-based | Sam | Sam supplies API access | 4 |
| GoHighLevel | CRM sync, LC Phone | Sam (existing) | Sam's plan | Sam | OAuth app connection in Phase 5 | 5 |
| Google Workspace (Gmail/Calendar/Business Profile) | Calendar, email, GBP | Sam (existing) | Sam's plan | Sam | OAuth in Phase 5 | 5 |
| Twilio | Voice for AI receptionist | not created | Usage-based | `SAM_H4A_EMAIL` | Create under Sam | 7 |
| ElevenLabs | Conversational AI receptionist | not created | Paid | `SAM_H4A_EMAIL` | Create under Sam | 7 |

## Domains

- `thehousing4all.com` — marketing site, **separate project, do not touch**.
- App runs on the Vercel temp domain (`housing4all-platform.vercel.app`) until Sam chooses an app domain (e.g. `app.thehousing4all.com`).
