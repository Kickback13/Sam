-- Network / Community push notifications (ADR-041) for Supabase project jcrjzmflepnvvvneahvs.
-- All-or-nothing (one transaction); the migration is included word for word. Additive only.

begin;

do $$ begin if to_regclass('public.network_push_subscriptions') is not null then raise exception 'Network push already applied'; end if; end $$;

-- =============================================================================
-- Network / Community push notifications (ADR-041).
--
--   network_push_subscriptions   one row per device that opted in (the browser's push
--                                endpoint and keys); only the member themselves can see it
--   public.network_push_targets(ws)     team (writers) only: devices to notify for a team
--                                       post or event
--   public.network_push_forget(ws, endpoints)   team only: drop devices the push service
--                                               says are gone
--
-- Only team posts and events notify (members can't notify everyone). Sending needs the
-- VAPID key pair in env; without it nothing is sent. Additive only.
-- =============================================================================

create table public.network_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  endpoint text not null check (char_length(endpoint) between 10 and 1000 and endpoint ~ '^https://'),
  p256dh text not null check (char_length(p256dh) between 20 and 200),
  auth text not null check (char_length(auth) between 8 and 100),
  created_at timestamptz not null default now(),
  unique (workspace_id, endpoint)
);
create index network_push_subscriptions_user_idx on public.network_push_subscriptions (user_id);
create index network_push_subscriptions_ws_idx on public.network_push_subscriptions (workspace_id);

alter table public.network_push_subscriptions enable row level security;
revoke all on public.network_push_subscriptions from anon, authenticated;
grant select, insert, delete on public.network_push_subscriptions to authenticated;

create policy "own devices read" on public.network_push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
create policy "members add own device" on public.network_push_subscriptions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (workspace_id in (select app_private.network_workspace_ids())
         or workspace_id in (select app_private.member_workspace_ids()))
  );
create policy "own devices delete" on public.network_push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.network_push_targets(p_workspace_id uuid)
returns table (endpoint text, p256dh text, auth text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_workspace_id not in (select app_private.writer_workspace_ids()) then
    raise exception 'Only the team can notify the community' using errcode = '42501';
  end if;
  return query
  select s.endpoint, s.p256dh, s.auth
  from public.network_push_subscriptions s
  where s.workspace_id = p_workspace_id
    and s.user_id <> auth.uid()
    -- Only people still in the community (active members) or on the team.
    and (exists (select 1 from public.network_members m
                 where m.workspace_id = s.workspace_id and m.user_id = s.user_id and m.status = 'active')
         or exists (select 1 from public.workspace_members w
                    where w.workspace_id = s.workspace_id and w.user_id = s.user_id))
  limit 5000;
end;
$$;

create or replace function public.network_push_forget(p_workspace_id uuid, p_endpoints text[])
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if p_workspace_id not in (select app_private.writer_workspace_ids()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  delete from public.network_push_subscriptions
   where workspace_id = p_workspace_id and endpoint = any (coalesce(p_endpoints, '{}'));
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.network_push_targets(uuid) from public, anon;
revoke all on function public.network_push_forget(uuid, text[]) from public, anon;
grant execute on function public.network_push_targets(uuid) to authenticated;
grant execute on function public.network_push_forget(uuid, text[]) to authenticated;

insert into supabase_migrations.schema_migrations (version, name) values
  ('20261111010000', 'h4a_network_push');

commit;

select 'Network push database update applied' as result;
