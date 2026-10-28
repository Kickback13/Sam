# Phase 4A Plan — Outreach foundation: compliance gates + newsletters (the parts that don't need Sam yet)

Track A (Housing4All) · Branch `h4a/outreach` → one PR into `main` · rules in `docs/COLLABORATION.md`.

## Why 4A

Phase 4 (`docs/ROADMAP.md`) sends real messages, so it needs Sam's accounts: a Resend sending domain
for email, a texting provider (GHL LC Phone or Twilio, decided with Phase 5), his skip-trace account and
his calendar. 4A builds everything that works without them — the compliance gates every send must
pass, the newsletter Sam asked for on the 10/28 call (one per business, same content, separate lists),
the do-not-send list and one-click unsubscribe — with sending left **Not connected**. 4B connects
email and texting and adds sequences, the reply inbox and booking once Sam's accounts exist.

## Ground rules

- Never connect to the hosted Supabase project. A human applies the combined SQL file; the PR isn't
  merged until that's done. Vercel previews use the production database — test only on the local stack.
- New migrations only, named `<UTC timestamp>_h4a_<topic>.sql`, later than `20261027080100`, additive only.
- **Nothing sends.** Sending needs `OUTREACH_EMAIL=on` + `RESEND_API_KEY`, and is refused on Vercel
  previews even then. No texts at all in 4A.

## Scope → where it lives

| Item                              | Where                                                                                                                                                                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 4.1 Compliance gates              | `src/features/outreach/compliance.ts` (pure, unit-tested): DNC, email opt-out, suppression list, CAN-SPAM sender + mailing address; SMS consent (written for marketing), STOP, landline, quiet hours in the workspace zone; inbound STOP/START/HELP keywords |
| 4.2 Newsletters (both businesses) | `newsletters` + `newsletter_sends` · `/w/[slug]/outreach` (list) and `/outreach/newsletters/[id]` (editor, live preview, audience check, send, "Copy to workspace")                                                                                          |
| 4.3 Email rendering               | `src/features/outreach/render.ts`: plain-text markers → escaped HTML + text; CAN-SPAM footer (sender, address, reason, unsubscribe) always added                                                                                                             |
| 4.4 Email provider                | `src/features/outreach/email-provider.ts`: Resend batch API with RFC 8058 one-click headers · **Not connected** by default                                                                                                                                   |
| 4.5 Do-not-send list              | `outreach_suppressions` · `/w/[slug]/outreach/do-not-send` · "texted STOP" button on the contact page                                                                                                                                                        |
| 4.6 One-click unsubscribe         | public `/unsubscribe/[token]` (GET shows, button POSTs) + `POST /api/unsubscribe/[token]` (RFC 8058) → SECURITY DEFINER `outreach_unsubscribe(token)`                                                                                                        |
| 4.7 Settings → Outreach           | `outreach_settings`: sender name, From, reply-to, mailing address, time zone, texting hours (8am–9pm max) — admins only                                                                                                                                      |
| 4.8 Contact page                  | "Can we reach them right now?" — the same gates, evaluated live                                                                                                                                                                                              |
| 4.9 Logging                       | every recipient logged in `newsletter_sends` (sent / failed / blocked + reasons); a sent email becomes an `email` activity on the contact (trigger); every action → `audit_log`                                                                              |
| 4.10 Tests                        | unit (gates, keywords, render, provider, audience) · RLS suite `h4a_outreach_rls.sql` (44 checks) · e2e (flow, contact gates + STOP, unsubscribe without login, 390px)                                                                                       |

## Out of scope for 4A (→ 4B, needs Sam)

Actually sending (Resend sending domain), texting provider + inbound STOP webhook, sequences, reply
inbox, calendar booking, broker ranking from listings/closings, long-hold owner lists from county
data (needs the data service, 3B), skip trace (Sam's account). Spanish templates come with `contacts.language`.

## Done when

- Settings → Outreach saves; a newsletter can be written, previewed, checked and copied to the other
  workspace; Send stays off with the reason shown.
- No contact failing a gate is ever counted as sendable (unit + e2e); unsubscribe works without login.
- Lint, typecheck, unit, RLS, e2e green locally and in CI; combined live-DB SQL file proven locally.
