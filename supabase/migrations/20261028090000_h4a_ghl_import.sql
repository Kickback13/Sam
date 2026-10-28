-- =============================================================================
-- Housing4All Track (Phase 5A): one-time GoHighLevel import (both workspaces).
--
--   ghl_links                       which local record a GHL record was imported as
--                                   (opportunities → deals), so a re-run never duplicates
--   public.ghl_save_connection()    admin: store the Private Integration token in Supabase
--                                   Vault and mark the integration connected
--   public.ghl_connection()         admin: read the token back (server-side import only)
--   public.ghl_disconnect()         admin: delete the token, mark not connected
--
-- The token never touches a table column: it lives in vault.secrets (encrypted),
-- named 'ghl_token:<workspace_id>'. integrations.config holds only the location
-- id/name. Contacts imported from GHL reuse public.imports (the CSV import job).
--
-- Additive only: no existing table, column, policy or function changes.
-- =============================================================================

create table public.ghl_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  object text not null check (object in ('opportunity')),
  ghl_id text not null check (char_length(ghl_id) between 1 and 100),
  local_id uuid not null,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (workspace_id, object, ghl_id)
);
comment on table public.ghl_links is
  'GoHighLevel record → local record (opportunity → deal). Makes the GHL import safe to re-run.';
create index ghl_links_local_idx on public.ghl_links (workspace_id, local_id);
create index ghl_links_created_by_idx on public.ghl_links (created_by);

alter table public.ghl_links enable row level security;
revoke all on public.ghl_links from anon, authenticated;
grant select, insert on public.ghl_links to authenticated;
create policy "members read" on public.ghl_links for select to authenticated
  using (workspace_id in (select app_private.member_workspace_ids()));
create policy "writers insert" on public.ghl_links for insert to authenticated
  with check (workspace_id in (select app_private.writer_workspace_ids()));

-- ---------------------------------------------------------------------------
-- Token storage (Vault). Every function checks that the caller is an owner or
-- admin of the workspace; nobody else can store, read or remove the token.
-- ---------------------------------------------------------------------------
create or replace function public.ghl_save_connection(
  p_workspace_id uuid,
  p_token text,
  p_location_id text,
  p_location_name text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  secret_name text := 'ghl_token:' || p_workspace_id::text;
  existing uuid;
begin
  if p_workspace_id not in (select app_private.admin_workspace_ids()) then
    raise exception 'Only an owner or admin can connect GoHighLevel' using errcode = '42501';
  end if;
  if p_token is null or char_length(p_token) not between 10 and 4000 then
    raise exception 'That token doesn''t look right' using errcode = '22023';
  end if;
  if p_location_id is null or p_location_id !~ '^[A-Za-z0-9_-]{5,64}$' then
    raise exception 'That location ID doesn''t look right' using errcode = '22023';
  end if;

  select id into existing from vault.secrets where name = secret_name;
  if existing is null then
    perform vault.create_secret(p_token, secret_name, 'GoHighLevel Private Integration token');
  else
    perform vault.update_secret(existing, p_token, secret_name, 'GoHighLevel Private Integration token');
  end if;

  insert into public.integrations (workspace_id, provider, status, config, connected_at, last_error)
  values (
    p_workspace_id, 'gohighlevel', 'connected',
    jsonb_build_object('location_id', p_location_id, 'location_name', left(coalesce(p_location_name, ''), 200),
                       'connected_by', auth.uid()),
    now(), null
  )
  on conflict (workspace_id, provider) do update
    set status = 'connected', config = excluded.config, connected_at = now(), last_error = null;

  insert into public.audit_log (workspace_id, actor_id, action, entity_type, diff)
  values (p_workspace_id, auth.uid(), 'ghl.connected', 'integration',
          jsonb_build_object('location_id', p_location_id, 'location_name', p_location_name));
end;
$$;

create or replace function public.ghl_connection(p_workspace_id uuid)
returns table (token text, location_id text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_workspace_id not in (select app_private.admin_workspace_ids()) then
    raise exception 'Only an owner or admin can use the GoHighLevel connection' using errcode = '42501';
  end if;
  return query
  select s.decrypted_secret::text, i.config ->> 'location_id'
  from public.integrations i
  join vault.decrypted_secrets s on s.name = 'ghl_token:' || p_workspace_id::text
  where i.workspace_id = p_workspace_id and i.provider = 'gohighlevel' and i.status = 'connected';
end;
$$;

create or replace function public.ghl_disconnect(p_workspace_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_workspace_id not in (select app_private.admin_workspace_ids()) then
    raise exception 'Only an owner or admin can disconnect GoHighLevel' using errcode = '42501';
  end if;
  delete from vault.secrets where name = 'ghl_token:' || p_workspace_id::text;
  update public.integrations
     set status = 'not_connected', connected_at = null, last_error = null,
         config = config - 'connected_by'
   where workspace_id = p_workspace_id and provider = 'gohighlevel';
  insert into public.audit_log (workspace_id, actor_id, action, entity_type, diff)
  values (p_workspace_id, auth.uid(), 'ghl.disconnected', 'integration', '{}'::jsonb);
end;
$$;

-- Record a failed call (bad token, missing scope) so the Integrations page shows it.
create or replace function public.ghl_record_error(p_workspace_id uuid, p_message text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_workspace_id not in (select app_private.admin_workspace_ids()) then
    raise exception 'Only an owner or admin can use the GoHighLevel connection' using errcode = '42501';
  end if;
  update public.integrations
     set last_error = left(p_message, 500)
   where workspace_id = p_workspace_id and provider = 'gohighlevel';
end;
$$;

revoke all on function public.ghl_save_connection(uuid, text, text, text) from public;
revoke all on function public.ghl_connection(uuid) from public;
revoke all on function public.ghl_disconnect(uuid) from public;
revoke all on function public.ghl_record_error(uuid, text) from public;
grant execute on function public.ghl_save_connection(uuid, text, text, text) to authenticated;
grant execute on function public.ghl_connection(uuid) to authenticated;
grant execute on function public.ghl_disconnect(uuid) to authenticated;
grant execute on function public.ghl_record_error(uuid, text) to authenticated;
