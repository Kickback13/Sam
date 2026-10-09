-- =============================================================================
-- Covering indexes for foreign keys flagged by the Supabase performance advisor.
-- =============================================================================
create index if not exists activities_created_by_idx on public.activities (created_by);
create index if not exists audit_log_actor_idx on public.audit_log (actor_id);
create index if not exists companies_created_by_idx on public.companies (created_by);
create index if not exists contacts_created_by_idx on public.contacts (created_by);
create index if not exists deal_contacts_ws_deal_idx on public.deal_contacts (workspace_id, deal_id);
create index if not exists deal_stage_history_changed_by_idx on public.deal_stage_history (changed_by);
create index if not exists deal_stage_history_from_stage_idx on public.deal_stage_history (from_stage_id);
create index if not exists deal_stage_history_to_stage_idx on public.deal_stage_history (to_stage_id);
create index if not exists deal_stage_history_ws_deal_idx on public.deal_stage_history (workspace_id, deal_id);
create index if not exists deals_created_by_idx on public.deals (created_by);
create index if not exists imports_created_by_idx on public.imports (created_by);
create index if not exists invites_accepted_by_idx on public.invites (accepted_by);
create index if not exists invites_invited_by_idx on public.invites (invited_by);
create index if not exists pipeline_stages_ws_pipeline_idx on public.pipeline_stages (workspace_id, pipeline_id);
create index if not exists profiles_last_workspace_idx on public.profiles (last_workspace_id);
create index if not exists properties_created_by_idx on public.properties (created_by);
create index if not exists tasks_assigned_to_idx on public.tasks (assigned_to);
create index if not exists tasks_created_by_idx on public.tasks (created_by);
