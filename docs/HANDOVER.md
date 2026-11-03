# Handover checklist: moving everything to Sam

Goal (contract module 12/19, roadmap Phase 9): Sam's own emails own every account, and agency access is
whatever Sam chooses. Work top to bottom; each step says who does it.

**Ground rules**

- Passwords, keys and tokens never go in chat, email or this repo. Type them only into the site that asks for them (Vercel, Supabase, or the app's own forms), or share them through a password manager.
- Sam creates and pays for his accounts himself. The agency can guide him on a call.
- Tick each box here in a pull request, so the repo keeps a dated record.

## 0. Before starting (Sam decides)

- [ ] Which email owns Housing4All accounts (`SAM_H4A_EMAIL`) and which owns AZH accounts (`SAM_AZH_EMAIL`). They can be the same.
- [ ] The app's domain (for example `app.thehousing4all.com`). The marketing site stays a separate project.
- [ ] Who from the agency keeps access after handover, and at what role.

## 1. App logins (Sam + Keanu, 5 minutes, no cost)

- [ ] Keanu invites Sam's login email as **Owner** in **both** workspaces: Settings → Members & invites.
- [ ] Sam accepts both invites and can open both workspaces.
- [ ] Sam invites Vianney as **Agent** in Housing4All.

## 2. Code: GitHub (Keanu → Sam)

- [ ] Sam creates a GitHub account or organization under `SAM_H4A_EMAIL`, with two-factor sign-in.
- [ ] Keanu: repo → Settings → General → Danger Zone → **Transfer ownership** → Sam's account/org.
- [ ] Sam: Settings → General → **Change visibility → Private**.
- [ ] Sam: Settings → Branches → protect `main`: require a pull request, require the CI checks, block force-pushes.
- [ ] Sam adds the agency as collaborators only if wanted (Settings → Collaborators).
- [ ] Re-connect Vercel to the moved repo (Vercel → Project → Settings → Git) if the transfer disconnected it.

## 3. Hosting: Vercel (Keanu → Sam)

- [ ] Sam creates a Vercel account/team under `SAM_H4A_EMAIL`. Pro ($20/month per member) is required for commercial use.
- [ ] Keanu: Project `housing4all-platform` → Settings → General → **Transfer Project** → Sam's team. Environment variables and domains move with it.
- [ ] Add the app domain (Project → Settings → Domains) and the DNS record it asks for.
- [ ] Update **Supabase → Authentication → URL configuration** (Site URL + Redirect URLs) to the new domain.
- [ ] Check: sign in on the new domain, open both workspaces.

## 4. Database: Supabase (Kondense AI org → Sam)

- [ ] Sam creates a Supabase organization under `SAM_H4A_EMAIL` on the **Pro** plan ($25/month).
- [ ] Current org owner: Project `jcrjzmflepnvvvneahvs` → Settings → General → **Transfer project** → Sam's org. Data, users, files and keys move with it; the URL stays the same, so nothing in Vercel changes.
- [ ] Sam: Organization → Members → remove anyone not approved; turn on two-factor sign-in.
- [ ] Check the boxes in `docs/SECURITY.md` §5 (auth URLs, providers, exposed schemas, backups).

## 5. Background jobs: Inngest (Keanu → Sam)

- [ ] Sam creates an Inngest account under `SAM_H4A_EMAIL` (free tier).
- [ ] Keanu removes the Inngest integration from the Vercel project. Sam installs it from his account; it sets `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` again.
- [ ] Redeploy. Check by forwarding one alert email (once Resend is set up) and confirming the listing appears.

## 6. Services Sam signs up for (when he is ready)

Each one is optional: the app shows **Not connected** until it is set up. The steps are in `docs/ACCOUNTS.md`.

- [ ] **Resend:** forwarded alert emails (inbound), sign-in emails for outside members (Supabase SMTP), newsletters.
- [ ] **Google Cloud OAuth:** "Sign in with Google".
- [ ] **RentCast:** property data (unlocks Phase 3B).
- [ ] **Anthropic:** AI deal summaries.
- [ ] **Twilio + ElevenLabs:** AI receptionist.
- [ ] **GoHighLevel:** a Private Integration token per sub-account, pasted into Settings → Integrations → GoHighLevel.

## 7. Close out (Sam + Keanu)

- [ ] Rotate every key the agency ever saw (`docs/RUNBOOK.md` §5). After the transfers this is mostly the Supabase publishable key and anything in Vercel env that was created under agency accounts.
- [ ] Remove agency logins Sam doesn't want: app Settings → Members & invites (both workspaces), Vercel team, Supabase org, GitHub collaborators.
- [ ] Update `docs/ACCOUNTS.md`: "Current owner" = Sam for every row.
- [ ] Training session with Sam and Vianney using `docs/TRAINING.md` (record it).
- [ ] Sam confirms in writing that handover is complete.
