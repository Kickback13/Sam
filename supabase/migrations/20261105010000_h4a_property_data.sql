-- =============================================================================
-- Housing4All Track (Phase 3B): licensed property data (RentCast).
--
--   property_data_pulls          every request made to the data service: what was
--                                asked, what came back (raw), when and by whom, so
--                                every number shown keeps its source and fetched-at
--   public.data_api_save_key()   admin: store the API key in Vault, set the monthly
--                                request limit (or change only the limit)
--   public.data_api_claim()      writer: the key for ONE request, only while this
--                                month's requests are under the limit (cost guard)
--   public.data_api_disconnect() admin: delete the key
--   public.data_api_record_error() writer: show a bad key / provider error on the
--                                Integrations page
--
-- The key never touches a table column (vault.secrets 'data_api_key:<workspace>').
-- Uses the existing integrations row with provider 'data_api'.
-- Additive only.
-- =============================================================================

create table public.property_data_pulls (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  property_id uuid not null,
  provider text not null default 'rentcast' check (provider in ('rentcast')),
  kind text not null check (kind in ('record', 'value', 'rent')),
  status text not null check (status in ('found', 'not_found', 'error')),
  payload jsonb check (payload is null or jsonb_typeof(payload) in ('object', 'array')),
  message text check (message is null or char_length(message) <= 500),
  fetched_by uuid references public.profiles (id) on delete set null default auth.uid(),
  fetched_at timestamptz not null default now(),
  foreign key (workspace_id, property_id) references public.properties (workspace_id, id) on delete cascade
);
comment on table public.property_data_pulls is
  'Requests to the licensed property data service (RentCast) and the raw answers — the source behind every number it supplied.';
create index property_data_pulls_property_idx on public.property_data_pulls (workspace_id, property_id, fetched_at desc);
create index property_data_pulls_month_idx on public.property_data_pulls (workspace_id, fetched_at);
create index property_data_pulls_fetched_by_idx on public.property_data_pulls (fetched_by);

alter table public.property_data_pulls enable row level security;
revoke all on public.property_data_pulls from anon, authenticated;
grant select, insert on public.property_data_pulls to authenticated;
create policy "members read" on public.property_data_pulls for select to authenticated
  using (workspace_id in (select app_private.member_workspace_ids()));
create policy "writers insert their own" on public.property_data_pulls for insert to authenticated
  with check (workspace_id in (select app_private.writer_workspace_ids()) and fetched_by = (select auth.uid()));

-- Requests counted this calendar month (Pacific time), for the cost guard.
create or replace function app_private.data_api_used_this_month(p_workspace_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.property_data_pulls
  where workspace_id = p_workspace_id
    and status <> 'error'
    and fetched_at >= (date_trunc('month', now() at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles');
$$;
revoke all on function app_private.data_api_used_this_month(uuid) from public, anon, authenticated;

create or replace function public.data_api_save_key(
  p_workspace_id uuid,
  p_key text,
  p_monthly_limit integer
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  secret_name text := 'data_api_key:' || p_workspace_id::text;
  existing uuid;
begin
  if p_workspace_id not in (select app_private.admin_workspace_ids()) then
    raise exception 'Only an owner or admin can connect the property data service' using errcode = '42501';
  end if;
  if p_monthly_limit is null or p_monthly_limit not between 0 and 100000 then
    raise exception 'Set a monthly request limit between 0 and 100,000' using errcode = '22023';
  end if;
  select id into existing from vault.secrets where name = secret_name;
  if p_key is not null then
    if char_length(btrim(p_key)) not between 16 and 200 then
      raise exception 'That API key doesn''t look right' using errcode = '22023';
    end if;
    if existing is null then
      perform vault.create_secret(btrim(p_key), secret_name, 'RentCast API key');
    else
      perform vault.update_secret(existing, btrim(p_key), secret_name, 'RentCast API key');
    end if;
  elsif existing is null then
    raise exception 'Paste the API key first' using errcode = '22023';
  end if;

  insert into public.integrations (workspace_id, provider, status, config, connected_at, last_error)
  values (p_workspace_id, 'data_api', 'connected',
          jsonb_build_object('provider_name', 'RentCast', 'monthly_limit', p_monthly_limit, 'connected_by', auth.uid()),
          now(), null)
  on conflict (workspace_id, provider) do update
    set status = 'connected',
        config = public.integrations.config
                 || jsonb_build_object('provider_name', 'RentCast', 'monthly_limit', p_monthly_limit, 'connected_by', auth.uid()),
        connected_at = coalesce(case when p_key is not null then now() end, public.integrations.connected_at, now()),
        last_error = case when p_key is not null then null else public.integrations.last_error end;

  insert into public.audit_log (workspace_id, actor_id, action, entity_type, diff)
  values (p_workspace_id, auth.uid(), case when p_key is not null then 'data_api.connected' else 'data_api.limit_changed' end,
          'integration', jsonb_build_object('provider', 'rentcast', 'monthly_limit', p_monthly_limit));
end;
$$;

-- One request's worth of access. Refuses once this month's requests reach the limit,
-- so nobody can run up a bill by clicking — the limit is the owner's spending cap.
create or replace function public.data_api_claim(p_workspace_id uuid)
returns table (api_key text, used integer, monthly_limit integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  lim integer;
  n integer;
begin
  if p_workspace_id not in (select app_private.writer_workspace_ids()) then
    raise exception 'Only team members who can edit can fetch property data' using errcode = '42501';
  end if;
  select coalesce((i.config ->> 'monthly_limit')::integer, 0) into lim
  from public.integrations i
  where i.workspace_id = p_workspace_id and i.provider = 'data_api' and i.status = 'connected';
  if not found then
    raise exception 'The property data service isn''t connected' using errcode = 'P0002';
  end if;
  n := app_private.data_api_used_this_month(p_workspace_id);
  if n >= lim then
    raise exception 'This month''s property data limit (% requests) is used up. An owner or admin can raise it in Settings → Integrations.', lim
      using errcode = 'P0001';
  end if;
  return query
  select s.decrypted_secret::text, n, lim
  from vault.decrypted_secrets s where s.name = 'data_api_key:' || p_workspace_id::text;
end;
$$;

create or replace function public.data_api_disconnect(p_workspace_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_workspace_id not in (select app_private.admin_workspace_ids()) then
    raise exception 'Only an owner or admin can disconnect the property data service' using errcode = '42501';
  end if;
  delete from vault.secrets where name = 'data_api_key:' || p_workspace_id::text;
  update public.integrations
     set status = 'not_connected', connected_at = null, last_error = null, config = config - 'connected_by'
   where workspace_id = p_workspace_id and provider = 'data_api';
  insert into public.audit_log (workspace_id, actor_id, action, entity_type, diff)
  values (p_workspace_id, auth.uid(), 'data_api.disconnected', 'integration', '{}'::jsonb);
end;
$$;

create or replace function public.data_api_record_error(p_workspace_id uuid, p_message text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_workspace_id not in (select app_private.writer_workspace_ids()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.integrations set last_error = left(p_message, 500)
   where workspace_id = p_workspace_id and provider = 'data_api';
end;
$$;

-- This month's usage for the Integrations page and the property page (no key).
create or replace function public.data_api_usage(p_workspace_id uuid)
returns table (used integer, monthly_limit integer, connected boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.data_api_used_this_month(p_workspace_id),
         coalesce((i.config ->> 'monthly_limit')::integer, 0),
         coalesce(i.status = 'connected', false)
  from (select p_workspace_id as ws) w
  left join public.integrations i on i.workspace_id = w.ws and i.provider = 'data_api'
  where p_workspace_id in (select app_private.member_workspace_ids());
$$;

revoke all on function public.data_api_save_key(uuid, text, integer) from public, anon;
revoke all on function public.data_api_claim(uuid) from public, anon;
revoke all on function public.data_api_disconnect(uuid) from public, anon;
revoke all on function public.data_api_record_error(uuid, text) from public, anon;
revoke all on function public.data_api_usage(uuid) from public, anon;
grant execute on function public.data_api_save_key(uuid, text, integer) to authenticated;
grant execute on function public.data_api_claim(uuid) to authenticated;
grant execute on function public.data_api_disconnect(uuid) to authenticated;
grant execute on function public.data_api_record_error(uuid, text) to authenticated;
grant execute on function public.data_api_usage(uuid) to authenticated;
