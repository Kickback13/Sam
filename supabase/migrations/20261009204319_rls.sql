-- =============================================================================
-- Row Level Security. Every table has RLS enabled; anon gets nothing.
--   member  = any role in the workspace      → read
--   writer  = owner | admin | agent          → create/update CRM data
--   admin   = owner | admin                  → settings, members, invites, pipelines
-- =============================================================================

alter table public.workspaces enable row level security;
alter table public.profiles enable row level security;
alter table public.workspace_members enable row level security;
alter table public.invites enable row level security;
alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.properties enable row level security;
alter table public.pipelines enable row level security;
alter table public.pipeline_stages enable row level security;
alter table public.deals enable row level security;
alter table public.deal_contacts enable row level security;
alter table public.deal_stage_history enable row level security;
alter table public.activities enable row level security;
alter table public.tasks enable row level security;
alter table public.integrations enable row level security;
alter table public.imports enable row level security;
alter table public.audit_log enable row level security;

-- Explicit grants (RLS still decides which rows). anon gets no table access.
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- workspaces
-- ---------------------------------------------------------------------------
create policy "members read workspace" on public.workspaces
  for select to authenticated
  using (id in (select app_private.member_workspace_ids()));

create policy "admins update workspace" on public.workspaces
  for update to authenticated
  using (id in (select app_private.admin_workspace_ids()))
  with check (id in (select app_private.admin_workspace_ids()));

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy "read own and coworker profiles" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or id in (select app_private.coworker_ids()));

create policy "update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- workspace_members (inserts only through accept_invite RPCs)
-- ---------------------------------------------------------------------------
create policy "members read memberships" on public.workspace_members
  for select to authenticated
  using (workspace_id in (select app_private.member_workspace_ids()));

create policy "admins update memberships" on public.workspace_members
  for update to authenticated
  using (workspace_id in (select app_private.admin_workspace_ids()))
  with check (workspace_id in (select app_private.admin_workspace_ids()));

create policy "admins remove members, anyone leaves" on public.workspace_members
  for delete to authenticated
  using (
    workspace_id in (select app_private.admin_workspace_ids())
    or user_id = (select auth.uid())
  );

-- ---------------------------------------------------------------------------
-- invites
-- ---------------------------------------------------------------------------
create policy "admins read invites" on public.invites
  for select to authenticated
  using (workspace_id in (select app_private.admin_workspace_ids()));

create policy "admins create invites" on public.invites
  for insert to authenticated
  with check (
    app_private.can_invite_role(workspace_id, role)
    and accepted_at is null
    and accepted_by is null
    and invited_by = (select auth.uid())
  );

create policy "admins update invites" on public.invites
  for update to authenticated
  using (workspace_id in (select app_private.admin_workspace_ids()))
  with check (app_private.can_invite_role(workspace_id, role));

create policy "admins delete invites" on public.invites
  for delete to authenticated
  using (workspace_id in (select app_private.admin_workspace_ids()));

-- ---------------------------------------------------------------------------
-- Standard CRM tables: members read, writers write.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['companies', 'contacts', 'properties', 'deals', 'deal_contacts', 'tasks', 'imports']
  loop
    execute format(
      'create policy "members read" on public.%I for select to authenticated
         using (workspace_id in (select app_private.member_workspace_ids()))', t);
    execute format(
      'create policy "writers insert" on public.%I for insert to authenticated
         with check (workspace_id in (select app_private.writer_workspace_ids()))', t);
    execute format(
      'create policy "writers update" on public.%I for update to authenticated
         using (workspace_id in (select app_private.writer_workspace_ids()))
         with check (workspace_id in (select app_private.writer_workspace_ids()))', t);
    execute format(
      'create policy "writers delete" on public.%I for delete to authenticated
         using (workspace_id in (select app_private.writer_workspace_ids()))', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Configuration tables: members read, admins write.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['pipelines', 'pipeline_stages', 'integrations']
  loop
    execute format(
      'create policy "members read" on public.%I for select to authenticated
         using (workspace_id in (select app_private.member_workspace_ids()))', t);
    execute format(
      'create policy "admins insert" on public.%I for insert to authenticated
         with check (workspace_id in (select app_private.admin_workspace_ids()))', t);
    execute format(
      'create policy "admins update" on public.%I for update to authenticated
         using (workspace_id in (select app_private.admin_workspace_ids()))
         with check (workspace_id in (select app_private.admin_workspace_ids()))', t);
    execute format(
      'create policy "admins delete" on public.%I for delete to authenticated
         using (workspace_id in (select app_private.admin_workspace_ids()))', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- deal_stage_history: read-only for users; written by the deals trigger.
-- ---------------------------------------------------------------------------
create policy "members read" on public.deal_stage_history
  for select to authenticated
  using (workspace_id in (select app_private.member_workspace_ids()));

-- ---------------------------------------------------------------------------
-- activities: writers log; system/stage entries are immutable; authors (or admins) edit their own.
-- ---------------------------------------------------------------------------
create policy "members read" on public.activities
  for select to authenticated
  using (workspace_id in (select app_private.member_workspace_ids()));

create policy "writers insert" on public.activities
  for insert to authenticated
  with check (
    workspace_id in (select app_private.writer_workspace_ids())
    and type not in ('stage_change', 'system')
    and created_by = (select auth.uid())
  );

create policy "authors update" on public.activities
  for update to authenticated
  using (
    workspace_id in (select app_private.writer_workspace_ids())
    and type not in ('stage_change', 'system')
    and (created_by = (select auth.uid()) or workspace_id in (select app_private.admin_workspace_ids()))
  )
  with check (
    workspace_id in (select app_private.writer_workspace_ids())
    and type not in ('stage_change', 'system')
  );

create policy "authors delete" on public.activities
  for delete to authenticated
  using (
    workspace_id in (select app_private.writer_workspace_ids())
    and type not in ('stage_change', 'system')
    and (created_by = (select auth.uid()) or workspace_id in (select app_private.admin_workspace_ids()))
  );

-- ---------------------------------------------------------------------------
-- audit_log: append-only; admins read.
-- ---------------------------------------------------------------------------
create policy "admins read audit" on public.audit_log
  for select to authenticated
  using (workspace_id in (select app_private.admin_workspace_ids()));

create policy "writers append audit" on public.audit_log
  for insert to authenticated
  with check (
    workspace_id in (select app_private.member_workspace_ids())
    and actor_id = (select auth.uid())
  );
