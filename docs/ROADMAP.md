# Roadmap — Housing4All + AZH Builders Platform

Nine phases over ~6 months. Each phase ends with a handoff report (format in `CLAUDE.md`). Acceptance criteria are the definition of done.

## Phase 1 — Foundation & CRM core ← current

**Scope:** Next.js + Supabase foundation, multi-tenant data model with RLS, auth (magic link, Google, invites), workspace theming, app shell, Today, People + CSV import, Companies, Properties (source chips), Pipeline kanban, Activities/Tasks, ⌘K search, Settings (branding, members, pipelines, honest integrations), CI, Vercel deploy.
**Acceptance:**

- Live on the temp Vercel URL; magic link + Google sign-in work.
- Housing4All, AZH Builders and Demo workspaces exist; switching re-skins the app and changes nav + pipeline.
- RLS isolation proven by automated tests.
- Contacts CRUD/filters/tags/timeline; CSV import with mapping, dedupe and error report.
- Properties + companies CRUD with links; source chips render.
- Kanban drag-and-drop persists with stage history; mobile list view.
- Tasks/activities work; Today shows real data only; ⌘K works.
- Pipeline editor, members/invites, honest integrations page.
- No fake data outside Demo. Lint/typecheck/unit/e2e pass; CI green. Docs written.

## Phase 2 — Deal engine

**Scope:** Buy box per workspace; ingestion from Sam's saved-search alert emails (Resend inbound parsing), CSV and manual entry; county-record verification (San Diego Assessor/Recorder public data); deal scoring vs buy box; instant alerts (email + SMS through Sam's own accounts, compliance-gated); real Today dashboard (new matches, verification queue). Inngest for ingestion/verification jobs.
**Acceptance:** a forwarded alert email becomes a parsed, deduped listing within 2 minutes; every field shows source + fetched-at; buy-box matches trigger an alert to Sam only (opt-in); verification status visible per listing; no scraping anywhere.

## Phase 3 — Property intelligence & deal analysis

**Scope:** Ownership, mortgage, foreclosure and tax data via a licensed API (ADR: ATTOM vs RentCast vs PropertyRadar); comps; underwriting calculator (price/unit, rents, NOI, cap rate, DSCR, cash flow); red flags; AI summary (Anthropic) with citations to the underlying fields; PDF export.
**Acceptance:** analyze any property in < 30 s; every computed number traces to inputs with sources; AI summary cites sources inline; PDF matches screen.

## Phase 4 — People database & outreach

**Scope:** Broker ranking by real listings/closings; long-hold owners (15+ years) from county data; property managers; skip trace via Sam's account; outreach sequences behind compliance gates (TCPA consent, STOP, quiet hours, CAN-SPAM, DNC); reply inbox; calendar booking.
**Acceptance:** no message can be sent to a contact failing any gate (tested); STOP handled within one message; every send logged as an activity; bookings land on Sam's calendar.

## Phase 5 — GoHighLevel two-way sync

**Scope:** Contacts, opportunities and conversations sync with GHL (webhooks + polling fallback); local text-only number (GHL LC Phone); Google Calendar sync. Tokens in Supabase Vault.
**Acceptance:** create/update in either system appears in the other within 1 minute; conflicts resolved by last-write-wins with an audit entry; `ghl_contact_id` populated; sync status visible on the integrations page.

## Phase 6 — Housing4All Network (community PWA)

**Scope:** Installable PWA inside this app: feed, deal posts, member directory, segments, events, broadcasts (push/email/SMS, compliance-gated), invites; members sync to CRM contacts.
**Acceptance:** installs on iOS/Android; members only see community data; broadcast respects opt-outs; new members appear as CRM contacts.

## Phase 7 — AI receptionist

**Scope:** ElevenLabs Conversational AI + Twilio: answers after 3 rings, English/Spanish, routes to Sam / Vianney / property management, transcripts + summaries to CRM activities.
**Acceptance:** test calls in both languages are answered, routed correctly and logged with transcript within 1 minute.

## Phase 8 — AZH Builders build-out

**Scope:** Project pipeline details (scope, budget, schedule), embeddable homeowner request form → routed to San Diego or Fallbrook office → estimate booking; AZH community (reuses Phase 6 engine); communication hub.
**Acceptance:** form submission creates contact + project lead in the right office within seconds; estimate booking works end to end; community live for AZH members.

## Phase 9 — Marketing ops & handover

**Scope:** Cold-email infrastructure on warmed secondary domains, reporting, security hardening (pen-test checklist, backups, key rotation), documentation, training, transfer of repo and all accounts to Sam.
**Acceptance:** Sam's emails own every account in `docs/ACCOUNTS.md`; agency access reduced to what Sam chooses; runbooks and training recordings delivered.
