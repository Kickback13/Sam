-- =============================================================================
-- AZH Track: internal estimate-visit booking (no external calendar, no messages).
-- Double-booking is a warning in the app, not a database error (AZH-007).
-- =============================================================================

create table public.azh_visits (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  request_id uuid,
  deal_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  office text not null check (app_private.azh_is_office(office)),
  estimator_id uuid references public.profiles (id) on delete set null,
  address text check (address is null or char_length(address) <= 300),
  notes text check (notes is null or char_length(notes) <= 2000),
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'canceled')),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, request_id) references public.azh_requests (workspace_id, id) on delete set null (request_id),
  foreign key (workspace_id, deal_id) references public.deals (workspace_id, id) on delete cascade,
  constraint azh_visits_time_order check (ends_at > starts_at and ends_at <= starts_at + interval '12 hours')
);
create index azh_visits_ws_time_idx on public.azh_visits (workspace_id, starts_at);
create index azh_visits_estimator_idx on public.azh_visits (estimator_id, starts_at);
create index azh_visits_request_idx on public.azh_visits (workspace_id, request_id);
create index azh_visits_deal_idx on public.azh_visits (workspace_id, deal_id);
create index azh_visits_created_by_idx on public.azh_visits (created_by);

create trigger azh_visits_updated_at before update on public.azh_visits
  for each row execute function app_private.set_updated_at();

-- Booking a visit for a request moves it to "estimate scheduled" (unless it is
-- already converted or closed).
create or replace function app_private.azh_visits_after_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.request_id is not null and new.status = 'scheduled'
     and (tg_op = 'INSERT' or new.request_id is distinct from old.request_id or old.status <> 'scheduled') then
    update public.azh_requests
    set status = 'estimate_scheduled'
    where id = new.request_id and status in ('new', 'contacted');
  end if;
  return null;
end;
$$;

create trigger azh_visits_after_write
  after insert or update of request_id, status on public.azh_visits
  for each row execute function app_private.azh_visits_after_write();

alter table public.azh_visits enable row level security;
revoke all on public.azh_visits from anon;
grant select, insert, update, delete on public.azh_visits to authenticated;

create policy "members read" on public.azh_visits for select to authenticated
  using (workspace_id in (select app_private.member_workspace_ids()));
create policy "writers insert" on public.azh_visits for insert to authenticated
  with check (workspace_id in (select app_private.writer_workspace_ids()));
create policy "writers update" on public.azh_visits for update to authenticated
  using (workspace_id in (select app_private.writer_workspace_ids()))
  with check (workspace_id in (select app_private.writer_workspace_ids()));
create policy "writers delete" on public.azh_visits for delete to authenticated
  using (workspace_id in (select app_private.writer_workspace_ids()));
