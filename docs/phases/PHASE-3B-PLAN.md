# Phase 3B Plan — Property data (RentCast)

Track A · Branch `h4a/property-data` · ADR-034.

| Piece                                        | Where                                                                                                                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Migration `20261105010000_h4a_property_data` | `property_data_pulls` (RLS), Vault key functions `data_api_save_key / data_api_claim / data_api_disconnect / data_api_record_error / data_api_usage`                     |
| Client + mapping (pure, unit-tested)         | `src/features/h4a/property-data/rentcast.ts`                                                                                                                             |
| Fetch / save actions, queries                | `src/features/h4a/server/property-data.ts`, `property-data-queries.ts`                                                                                                   |
| UI                                           | Analysis page panel (Fetch property record / value / rent, usage, results with sources); Settings → Integrations → Property data (key, monthly limit, usage, disconnect) |
| Tests                                        | unit (7) · RLS `h4a_property_data_rls.sql` (21) · e2e against a local RentCast mock (limit stops spending, blanks-only, sources, 390 px)                                 |

Off until Sam adds the key; nothing is requested without a click, and never past the monthly limit.
