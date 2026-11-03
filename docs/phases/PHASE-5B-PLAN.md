# Phase 5B Plan — Automatic GoHighLevel import (one-way)

Track A · Branch `h4a/ghl-auto-import` → one PR into `main` · rules in `docs/COLLABORATION.md` · ADR-032.

## Why

Sam keeps GoHighLevel for a few more months before cancelling it. The Phase 5A import is manual, so new
GHL leads and deal moves were missed between runs. Michael chose (2026-11-02) an automatic, one-way import
over two-way sync, which would write into a system that is being switched off.

## What

| Piece                       | Where                                                                                                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Settings + run state + lock | `ghl_sync_settings` (migration `20261103010000_h4a_ghl_auto_import`)                                                                                                        |
| Change detection            | `ghl_sync_state` (fingerprint per GHL record) + `src/features/ghl/sync.ts` (pure, unit-tested)                                                                              |
| Run lock / result           | `ghl_sync_claim()` / `ghl_sync_finish()` (owners/admins; audit)                                                                                                             |
| Runner                      | `src/features/ghl/server/auto-import.ts`: contacts (changed only → CSV import engine), then opportunities (new → deal; changed → move)                                      |
| Triggers                    | **Import now** (waits for the result) · `GhlAutoImportKick` in the workspace layout for owners/admins → `kickGhlAutoImport` → `after()` background run when due             |
| UI                          | Settings → Integrations → GoHighLevel → **Automatic import** card (on/off, how often, Import now, last run)                                                                 |
| Tests                       | unit `sync.test.ts` (11) · RLS `h4a_ghl_sync_rls.sql` (26) · e2e `h4a-ghl-auto-import.spec.ts` (first run, no-change run, GHL change vs local edit, background run, 390 px) |

## Out of scope

Writing to GHL; GHL notes/conversations; a server-side cron (would need a server key in Vercel; possible later
without changing the import logic).
