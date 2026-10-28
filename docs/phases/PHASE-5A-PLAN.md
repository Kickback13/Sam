# Phase 5A Plan — One-time GoHighLevel import (contacts + opportunities)

Track A · Branch `h4a/ghl-import` → one PR into `main` · rules in `docs/COLLABORATION.md`.

## Why 5A (and not two-way sync)

On the 10/28 call Sam said he'll keep GoHighLevel ~2 months for Housing4All and 3–4 months for AZH, then
cancel; the platform takes over newsletters and texts. So the roadmap's two-way sync (Phase 5) is
replaced by a **one-time, re-runnable import** of each workspace's GHL contacts and opportunities. Sam
creates the GHL token himself and pastes it into the app — the agency never handles it.

## Two ways in

1. **CSV (works today, no code needed):** GHL → Contacts → export → Platform → People → Import. The
   Phase 1 importer already maps GHL's export columns (Contact Id, DND, tags…) and dedupes on the GHL id.
2. **API (this PR):** Settings → Integrations → GoHighLevel → paste a Private Integration token →
   import contacts and opportunities. Adds what a CSV can't carry: per-channel DND and the pipeline
   (opportunity → deal, stage, value, linked contact).

## Scope → where it lives

| Item                                                       | Where                                                                                                                                                                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GHL client (read-only: contacts, pipelines, opportunities) | `src/features/ghl/client.ts` — shapes from GHL's official SDK `@gohighlevel/api-client` 3.1.1                                                                                                                      |
| Mapping (pure, unit-tested)                                | `src/features/ghl/map.ts`: contact → GHL-export row; DND → DNC, Email DND → opt-out, SMS DND → do-not-send list; opportunity → deal plan; default stage map                                                        |
| Token storage                                              | Supabase Vault (`ghl_token:<workspace>`), via SECURITY DEFINER `ghl_save_connection / ghl_connection / ghl_disconnect` — owners/admins only                                                                        |
| Contact import                                             | the existing CSV import engine (`startImport` / `importChunk` / `finishImport`): same validation, dedupe, merge, import report                                                                                     |
| Opportunity import                                         | stage-mapping screen → deals; `ghl_links` makes re-runs skip what was already imported                                                                                                                             |
| UI                                                         | `/w/[slug]/settings/integrations/gohighlevel` (both business types)                                                                                                                                                |
| Tests                                                      | unit (client, mapping, round trip through the CSV transform) · RLS `h4a_ghl_rls.sql` (21) · e2e against a local GHL mock (101 contacts over 2 pages, merge, DND, stage map, re-run, disconnect, admin-only, 390px) |

## Out of scope

Writing anything to GHL; notes, conversations and custom fields (per-contact API calls — revisit if
Sam wants history); two-way sync; GHL's LC Phone number (texting provider decided separately).

## Done when

Token is stored only in Vault; a real token imports contacts and opportunities end to end (verified by
Sam/Michael on AZH's GHL after merge); re-running duplicates nothing; all checks green.
