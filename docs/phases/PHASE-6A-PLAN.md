# Phase 6A Plan — Housing4All Network (community app)

Track A · Branch `h4a/network` → one PR into `main` · rules in `docs/COLLABORATION.md`.

## What it is

An invite-only community app for Sam's investors and partners at `/n/<workspace-slug>` (e.g.
`/n/housing4all`), installable on phones (PWA). Members have their own login and see **only**
community content: the feed, deal posts, events, and a directory of members who chose to be listed.
They never see the CRM. The team manages it at `/w/<slug>/network`.

## Scope → where it lives

| Item                 | Where                                                                                                                                                                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data + security      | `network_members / invites / posts / comments / events / rsvps` · members are **not** workspace members, so every CRM table's RLS gives them nothing (proven in `h4a_network_rls.sql`, 43 checks)                                                         |
| Invites + join       | team creates a private link (optionally email-bound) → `/n/<slug>/join/<token>` (public) → sign in → join · `accept_network_invite` links the CRM contact by email or creates one (tag `network`, source "Housing4All Network", activity on the timeline) |
| Feed + deal posts    | members and the team post updates and deals; deal numbers are labelled "As posted by … · not independently verified"; comments                                                                                                                            |
| Moderation           | team pins, hides (members stop seeing it at once) and deletes; authorship is set by the database                                                                                                                                                          |
| Events + RSVP        | team creates/cancels; members RSVP                                                                                                                                                                                                                        |
| Directory + profiles | members choose to be listed and which contact details (if any) to show; the CRM keeps the real ones                                                                                                                                                       |
| Segments             | team tags members (e.g. `1031`, `north-county`)                                                                                                                                                                                                           |
| Broadcasts           | Outreach newsletter with **"Only Housing4All Network members"** — every send still passes the Phase 4A gates (opt-out, DNC, CAN-SPAM). Push and SMS broadcasts: not in 6A                                                                                 |
| Installable          | per-network manifest, generated PNG icons, service worker (network-first, nothing private cached), install hint (Android prompt / iPhone steps)                                                                                                           |
| Landing              | a signed-in member with no workspace goes straight to their Network                                                                                                                                                                                       |
| Tests                | RLS (43) · e2e: team invite/event/pinned post → member joins → contact created → deal/comment/RSVP/profile/directory → member can't reach the CRM → team moderates → members-only newsletter audience → install files public · 390px                      |

## Blocker for real members (Sam's accounts)

Members sign in with an emailed magic link (or Google). Supabase's built-in email only delivers to
the project's team, so **outside members can't receive a sign-in email until Resend SMTP is set up in
Supabase Auth** (or the Google OAuth client is created) — both under Sam's accounts, see
`docs/ACCOUNTS.md`. Everything else works today.

## Out of scope (later)

Push notifications (needs VAPID keys), SMS broadcasts (texting provider), invite emails sent by the
app (Resend), photo uploads in posts, the AZH community (Track B, Phase 8 — reuses this engine).
