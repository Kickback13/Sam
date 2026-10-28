# Accounts & Ownership

Rule: Sam owns everything. Each third-party account ultimately lives under one of Sam's emails — one for **Housing4All** and one for **AZH Builders**. Development may run on Keanu's accounts; every account is listed here with its transfer plan. Never put credentials in this file.

Sam's account emails: **TBD (question open for Sam)** — referred to below as `SAM_H4A_EMAIL` and `SAM_AZH_EMAIL`.

Sam's **app login** (confirmed 2026-10-28): his personal Gmail — invite it as **Owner** in both the Housing4All and AZH Builders workspaces (Settings → Members). Kept out of this file on purpose while the repo isn't private.

| Service                                                | Purpose                                                                | Current owner                                                                                                                      | Plan / cost                                          | Target owner                          | Transfer plan                                                                                                                                                                                 | Phase |
| ------------------------------------------------------ | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| GitHub `Kickback13/Sam`                                | Source code                                                            | Keanu (`Kickback13`)                                                                                                               | Free                                                 | Sam (`SAM_H4A_EMAIL` GitHub org/user) | Settings → Transfer ownership to Sam's account/org; make private; re-link Vercel Git                                                                                                          | 1     |
| Vercel project `housing4all-platform`                  | Hosting (prod + previews)                                              | Keanu, team **ERA Ventures**                                                                                                       | Team plan (existing, Keanu) — $0 incremental for now | Sam's Vercel team                     | Project → Settings → Transfer project to Sam's team (Pro $20/mo/member if commercial use requires)                                                                                            | 1     |
| Supabase project `jcrjzmflepnvvvneahvs` (ca-central-1) | DB, Auth, Storage                                                      | Org **Kondense AI**                                                                                                                | **Pro** — $25/mo (org plan)                          | Sam's Supabase org                    | Project → Settings → General → Transfer project to Sam's org                                                                                                                                  | 1     |
| Google Cloud OAuth client                              | "Sign in with Google"                                                  | not created                                                                                                                        | Free                                                 | `SAM_H4A_EMAIL`                       | Create in Sam's Google Cloud project; paste client ID/secret into Supabase → Auth → Providers → Google                                                                                        | 1     |
| Email (SMTP for auth emails)                           | Magic links / invites to non-team emails                               | Supabase built-in (team members only, rate-limited)                                                                                | Free                                                 | Resend under `SAM_H4A_EMAIL`          | Configure Resend SMTP in Supabase → Auth → SMTP (Resend free 3k/mo, Pro $20/mo)                                                                                                               | 1–2   |
| Resend                                                 | Inbound (forwarded alert emails, Phase 2A) · later outbound            | not created                                                                                                                        | Free → $20/mo                                        | `SAM_H4A_EMAIL`                       | Create under Sam; receiving domain + webhook — exact steps below                                                                                                                              | 2     |
| Inngest                                                | Background jobs (forwarded-email processing, Phase 2A)                 | Keanu (`kickback13`) via the Inngest Vercel integration — `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` set for Production + Preview | Free (Hobby)                                         | `SAM_H4A_EMAIL`                       | Transfer: Sam creates an Inngest account, Keanu removes the integration, Sam installs it on the project (keys are replaced automatically)                                                     | 2     |
| Anthropic API                                          | AI summaries with citations                                            | not created                                                                                                                        | Usage-based                                          | `SAM_H4A_EMAIL`                       | Create org under Sam; key in Vercel env                                                                                                                                                       | 2–3   |
| Data API (ATTOM / RentCast / PropertyRadar)            | Property intelligence                                                  | not chosen                                                                                                                         | Paid (ADR in Phase 3)                                | `SAM_H4A_EMAIL`                       | Sam signs up; key in Vault                                                                                                                                                                    | 3     |
| Mapbox                                                 | Maps                                                                   | not created                                                                                                                        | Free tier                                            | `SAM_H4A_EMAIL`                       | Create under Sam                                                                                                                                                                              | 3     |
| Skip-trace provider                                    | Owner contact lookup                                                   | Sam's existing account (TBD)                                                                                                       | Usage-based                                          | Sam                                   | Sam supplies API access                                                                                                                                                                       | 4     |
| GoHighLevel                                            | One-time import of contacts + opportunities (Phase 5A), then cancelled | Sam (existing) — AZH active; Housing4All to be reactivated                                                                         | Sam's plan                                           | Sam                                   | Sam creates a read-only Private Integration token per sub-account and pastes it in Settings → Integrations → GoHighLevel (stored in Supabase Vault); disconnect + cancel GHL after the import | 5     |
| Google Workspace (Gmail/Calendar/Business Profile)     | Calendar, email, GBP                                                   | Sam (existing)                                                                                                                     | Sam's plan                                           | Sam                                   | OAuth in Phase 5                                                                                                                                                                              | 5     |
| Twilio                                                 | Voice for AI receptionist                                              | not created                                                                                                                        | Usage-based                                          | `SAM_H4A_EMAIL`                       | Create under Sam                                                                                                                                                                              | 7     |
| ElevenLabs                                             | Conversational AI receptionist                                         | not created                                                                                                                        | Paid                                                 | `SAM_H4A_EMAIL`                       | Create under Sam                                                                                                                                                                              | 7     |

## Domains

- `thehousing4all.com` — marketing site, **separate project, do not touch**.
- App runs on the Vercel temp domain (`housing4all-platform.vercel.app`) until Sam chooses an app domain (e.g. `app.thehousing4all.com`).

## Phase 2A — forwarded alert emails (Resend inbound): what Sam creates

Until these are done, **Settings → Integrations → Forwarded alert emails** shows **Not connected**, and listings come in by hand, CSV upload or **Deal Finder → Paste an email** (all working now). Nothing below is done by the agency; Sam creates the accounts and pastes the values into Vercel (or shares them with Keanu through a password manager — never by email or chat).

**1. Resend account** — sign up at resend.com with `SAM_H4A_EMAIL`. Free plan is enough to start.

**2. Receiving domain** — pick one:

- **Recommended: a subdomain of thehousing4all.com** (keeps Sam's normal email untouched). In Resend → **Domains** → **Add domain** → `inbound.thehousing4all.com` → turn on **Receiving**. Resend then shows the exact DNS record; add it where thehousing4all.com's DNS is managed:

  | Type | Host / name | Value (copy from Resend)                                                     | Priority |
  | ---- | ----------- | ---------------------------------------------------------------------------- | -------- |
  | MX   | `inbound`   | the receiving host Resend shows, e.g. `inbound-smtp.us-east-1.amazonaws.com` | 10       |

  **Do not change the existing MX records on `thehousing4all.com` itself** — those deliver Sam's normal mail. Only the new `inbound` subdomain record is added. Wait for Resend to show the domain as verified.

- **No-DNS option:** use the receiving domain Resend gives every account (`<something>.resend.app`). Works immediately; the forwarding address just looks less branded.

**3. Webhook** — Resend → **Webhooks** → **Add endpoint**:

- URL: `https://housing4all-platform.vercel.app/api/inbound/email` (or the final app domain once Sam picks one)
- Event: **`email.received`** only
- Copy the **signing secret** (starts with `whsec_`).

**4. API key** — Resend → **API Keys** → create a key with **Full access** (the app needs to read received emails; a sending-only key can't). Name it `housing4all-platform`.

**5. Vercel environment variables** — project `housing4all-platform` → Settings → Environment Variables, **Production only** (leave Preview empty: previews use the production database, and without the secret the preview endpoint refuses every request):

| Name                    | Value                                                                   |
| ----------------------- | ----------------------------------------------------------------------- |
| `RESEND_API_KEY`        | the key from step 4                                                     |
| `RESEND_WEBHOOK_SECRET` | the `whsec_…` secret from step 3                                        |
| `INBOUND_EMAIL_DOMAIN`  | `inbound.thehousing4all.com` (or the `….resend.app` domain from step 2) |

Then redeploy production. The app never stores these in the database or in git.

**6. Create the forwarding address** — in the app, an owner/admin opens **Settings → Integrations → Forwarded alert emails → Create forwarding address**. It looks like `deals.<random>@inbound.thehousing4all.com`, is shown **once** (copy it), and works only for that workspace. "Replace address" revokes the old one.

**7. Forward the alerts** — in the inbox that receives the LoopNet / Crexi / broker alerts (Gmail): Settings → **Forwarding and POP/IMAP** → **Add a forwarding address** → paste the address. Gmail sends a confirmation code to it; the code appears in **Deal Finder → Emails** within a minute. Enter it in Gmail, then create a filter (e.g. from the alert senders) → **Forward it to** that address. Forwarding by hand also works.

**8. Inngest — already connected (on Keanu's account).** The Inngest Vercel integration is installed on `housing4all-platform` and sets `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` (Production + Preview); after the merge, Inngest syncs the app at `/api/inngest` on each deploy. Each forwarded email is then processed in the background with retries. Nothing for Sam to do now; to move it to Sam's account later, see the table above. (Without Inngest the same processing runs inside the webhook request and Resend retries on failure.)

**Owner alert email (off in 2A)** — built but switched off. To turn it on later: verify a **sending** domain in Resend (e.g. `send.thehousing4all.com`, with the SPF/DKIM records Resend lists), then set `ALERT_EMAIL_FROM` (e.g. `Housing4All Alerts <alerts@send.thehousing4all.com>`) and `H4A_ALERT_EMAILS=on`. It only ever emails the workspace owner's address. No SMS.

**Newsletters (Phase 4A, off)** — built but switched off. To turn on: in Sam's Resend account verify a **sending** domain per business (e.g. `send.thehousing4all.com` for Housing4All and a subdomain of AZH's own domain for AZH, each with the SPF/DKIM records Resend lists); in the app, **Settings → Outreach** in each workspace: sender name, From address on that domain, reply-to, and the business's mailing address (required by CAN-SPAM); then set `OUTREACH_EMAIL=on` (with `RESEND_API_KEY`) in Vercel **Production only**. Previews never send. Resend's free plan covers 3,000 emails/month; paid plans start at $20/month (check current pricing before choosing).

**Costs:** Resend Free ($0; Pro $20/mo if volume grows). Inngest Hobby ($0). No other new services in 2A.

## GoHighLevel import (Phase 5A): what Sam (or Michael, as admin) does

Per workspace (AZH now; Housing4All once its GHL is reactivated):

1. In GoHighLevel, open the sub-account → **Settings → Private Integrations → Create new integration**. Name it e.g. "Platform import". Scopes: **View Contacts** (`contacts.readonly`) and **View Opportunities** (`opportunities.readonly`) — nothing else. Copy the token (shown once).
2. Copy the **Location ID** (Settings → Business Profile, or the id after `/location/` in the GHL address bar).
3. In the platform, as owner/admin: **Settings → Integrations → GoHighLevel → Connect and import**, paste both, click **Test and connect**.
4. **Import contacts**, check the import report, then map stages and **Import opportunities**.
5. When GHL is about to be cancelled, run both again (repeats only add what's new), then **Disconnect** and delete the integration in GHL.

Never send the token by email or chat; paste it straight into the app.
