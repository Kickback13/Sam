-- =============================================================================
-- Housing4All Track (Phase 5B): automatic GoHighLevel import (both workspaces).
--
-- One-way and read-only, like the Phase 5A import: GHL → this app, never back.
-- It runs while Sam keeps GHL (ADR-029 / ADR-033) so new GHL leads and deal moves
-- show up here without anyone re-running the import.
--
--   ghl_sync_settings        per workspace: on/off, how often, the saved stage map,
--                            and the last run (status, summary, lock)
--   ghl_sync_state           fingerprint of each GHL contact / opportunity as last
--                            seen, so a run only touches records GHL actually changed
--   public.ghl_sync_claim()  admin: take the run lock if a run is due (or forced)
--   public.ghl_sync_finish() admin: release the lock and record the result
--
-- The GHL token stays in Supabase Vault (Phase 5A functions). Runs execute under
-- the signed-in owner/admin's session, so every write goes through RLS.
--
-- Additive only: no existing table, column, policy or function changes.
-- =============================================================================

create table public.ghl_sync_settings (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  enabled boolean not null default false,
  interval_minutes integer not null default 360 check (interval_minutes in (60, 360, 1440)),
  -- GHL stage id → local stage id, saved by the last manual opportunity import.
  stage_map jsonb not null default '{}'::jsonb check (jsonb_typeof(stage_map) = 'object'),
  enabled_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  -- Run state: written only by ghl_sync_claim / ghl_sync_finish.
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_status text check (last_status in ('running', 'ok', 'error')),
  last_summary jsonb,
  last_error text check (char_length(last_error) <= 500),
  lock_until timestamptz
);
comment on table public.ghl_sync_settings is
  'Automatic GoHighLevel import (one-way, read-only): schedule, saved stage map and last run.';
create index ghl_sync_settings_enabled_by_idx on public.ghl_sync_settings (enabled_by);

alter table public.ghl_sync_settings enable row level security;
revoke all on public.ghl_sync_settings from anon, authenticated;
grant select on public.ghl_sync_settings to authenticated;
-- Admins change only the settings columns; run state goes through the functions below.
grant insert (workspace_id, enabled, interval_minutes, stage_map, enabled_by, updated_at)
  on public.ghl_sync_settings to authenticated;
grant update (enabled, interval_minutes, stage_map, enabled_by, updated_at)
  on public.ghl_sync_settings to authenticated;
create policy "members read" on public.ghl_sync_settings for select to authenticated
  using (workspace_id in (select app_private.member_workspace_ids()));
create policy "admins insert" on public.ghl_sync_settings for insert to authenticated
  with check (workspace_id in (select app_private.admin_workspace_ids()));
create policy "admins update" on public.ghl_sync_settings for update to authenticated
  using (workspace_id in (select app_private.admin_workspace_ids()))
  with check (workspace_id in (select app_private.admin_workspace_ids()));

create table public.ghl_sync_state (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  object text not null check (object in ('contact', 'opportunity')),
  ghl_id text not null check (char_length(ghl_id) between 1 and 100),
  fingerprint text not null check (char_length(fingerprint) between 1 and 128),
  synced_at timestamptz not null default now(),
  primary key (workspace_id, object, ghl_id)
);
comment on table public.ghl_sync_state is
  'Last-seen fingerprint of each GoHighLevel record, so automatic imports skip unchanged ones.';

alter table public.ghl_sync_state enable row level security;
revoke all on public.ghl_sync_state from anon, authenticated;
grant select, insert, update on public.ghl_sync_state to authenticated;
create policy "members read" on public.ghl_sync_state for select to authenticated
  using (workspace_id in (select app_private.member_workspace_ids()));
create policy "writers insert" on public.ghl_sync_state for insert to authenticated
  with check (workspace_id in (select app_private.writer_workspace_ids()));
create policy "writers update" on public.ghl_sync_state for update to authenticated
  using (workspace_id in (select app_private.writer_workspace_ids()))
  with check (workspace_id in (select app_private.writer_workspace_ids()));

-- ---------------------------------------------------------------------------
-- Run lock. Returns true when the caller may run now: GHL is connected, no other
-- run holds the lock, and either p_force or (enabled and the interval has passed).
-- The lock expires on its own after 10 minutes in case a run dies mid-way.
-- ---------------------------------------------------------------------------
create or replace function public.ghl_sync_claim(p_workspace_id uuid, p_force boolean default false)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_workspace_id not in (select app_private.admin_workspace_ids()) then
    raise exception 'Only an owner or admin can run the GoHighLevel import' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.integrations
    where workspace_id = p_workspace_id and provider = 'gohighlevel' and status = 'connected'
  ) then
    return false;
  end if;

  insert into public.ghl_sync_settings (workspace_id) values (p_workspace_id)
  on conflict (workspace_id) do nothing;

  update public.ghl_sync_settings
     set lock_until = now() + interval '10 minutes',
         last_started_at = now(),
         last_status = 'running',
         last_error = null
   where workspace_id = p_workspace_id
     and (lock_until is null or lock_until < now())
     and (p_force or (enabled and (last_started_at is null
                                   or last_started_at < now() - make_interval(mins => interval_minutes))));
  return found;
end;
$$;

create or replace function public.ghl_sync_finish(
  p_workspace_id uuid,
  p_ok boolean,
  p_summary jsonb,
  p_error text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_workspace_id not in (select app_private.admin_workspace_ids()) then
    raise exception 'Only an owner or admin can run the GoHighLevel import' using errcode = '42501';
  end if;
  update public.ghl_sync_settings
     set lock_until = null,
         last_finished_at = now(),
         last_status = case when p_ok then 'ok' else 'error' end,
         last_summary = case when jsonb_typeof(p_summary) = 'object' then p_summary else null end,
         last_error = case when p_ok then null else left(coalesce(p_error, 'Unknown error'), 500) end
   where workspace_id = p_workspace_id;
  insert into public.audit_log (workspace_id, actor_id, action, entity_type, diff)
  values (p_workspace_id, auth.uid(), 'ghl.auto_import', 'integration',
          jsonb_build_object('ok', p_ok, 'summary', p_summary, 'error', left(p_error, 500)));
end;
$$;

revoke all on function public.ghl_sync_claim(uuid, boolean) from public, anon;
revoke all on function public.ghl_sync_finish(uuid, boolean, jsonb, text) from public, anon;
grant execute on function public.ghl_sync_claim(uuid, boolean) to authenticated;
grant execute on function public.ghl_sync_finish(uuid, boolean, jsonb, text) to authenticated;
