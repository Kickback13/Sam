-- =============================================================================
-- AZH Track: project milestones, budget lines, cost entries and change orders.
-- Approved change orders add to the contract value; the deal's value follows
-- (contract value + approved change orders, else the estimate total) (AZH-008).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Milestones
-- ---------------------------------------------------------------------------
create table public.azh_milestones (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  deal_id uuid not null,
  name text not null check (char_length(name) between 1 and 200),
  planned_on date,
  done_on date,
  status text not null default 'planned' check (status in ('planned', 'in_progress', 'done', 'delayed')),
  position integer not null default 0,
  notes text check (notes is null or char_length(notes) <= 2000),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, deal_id) references public.deals (workspace_id, id) on delete cascade
);
create index azh_milestones_deal_idx on public.azh_milestones (workspace_id, deal_id, position);
create index azh_milestones_upcoming_idx on public.azh_milestones (workspace_id, planned_on) where status <> 'done';
create index azh_milestones_created_by_idx on public.azh_milestones (created_by);

create trigger azh_milestones_updated_at before update on public.azh_milestones
  for each row execute function app_private.set_updated_at();

create or replace function app_private.azh_milestones_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'done' then
    new.done_on := coalesce(new.done_on, current_date);
  else
    new.done_on := null;
  end if;
  return new;
end;
$$;

create trigger azh_milestones_before_write
  before insert or update on public.azh_milestones
  for each row execute function app_private.azh_milestones_before_write();

-- ---------------------------------------------------------------------------
-- Budget lines, costs, change orders
-- ---------------------------------------------------------------------------
create table public.azh_budget_lines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  deal_id uuid not null,
  category text not null check (char_length(category) between 1 and 60),
  budgeted numeric(14, 2) not null default 0 check (budgeted >= 0),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, deal_id) references public.deals (workspace_id, id) on delete cascade,
  unique (deal_id, category)
);
create index azh_budget_lines_deal_idx on public.azh_budget_lines (workspace_id, deal_id, position);

create table public.azh_costs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  deal_id uuid not null,
  spent_on date not null default current_date,
  vendor text check (vendor is null or char_length(vendor) <= 120),
  amount numeric(14, 2) not null check (amount >= 0 and amount <= 100000000),
  category text not null check (char_length(category) between 1 and 60),
  receipt_file_id uuid,
  notes text check (notes is null or char_length(notes) <= 1000),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, deal_id) references public.deals (workspace_id, id) on delete cascade,
  foreign key (workspace_id, receipt_file_id) references public.azh_files (workspace_id, id) on delete set null (receipt_file_id)
);
create index azh_costs_deal_idx on public.azh_costs (workspace_id, deal_id, spent_on desc);
create index azh_costs_receipt_idx on public.azh_costs (workspace_id, receipt_file_id);
create index azh_costs_created_by_idx on public.azh_costs (created_by);

create table public.azh_change_orders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  deal_id uuid not null,
  number integer not null check (number between 1 and 9999),
  description text not null check (char_length(description) between 1 and 1000),
  -- Negative amounts are credits back to the owner.
  amount numeric(14, 2) not null check (amount between -100000000 and 100000000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  decided_on date,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, deal_id) references public.deals (workspace_id, id) on delete cascade,
  unique (deal_id, number)
);
create index azh_change_orders_deal_idx on public.azh_change_orders (workspace_id, deal_id, number);
create index azh_change_orders_created_by_idx on public.azh_change_orders (created_by);

create trigger azh_budget_lines_updated_at before update on public.azh_budget_lines
  for each row execute function app_private.set_updated_at();
create trigger azh_costs_updated_at before update on public.azh_costs
  for each row execute function app_private.set_updated_at();
create trigger azh_change_orders_updated_at before update on public.azh_change_orders
  for each row execute function app_private.set_updated_at();

create or replace function app_private.azh_change_orders_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.number is null or new.number = 0 then
    select coalesce(max(number), 0) + 1 into new.number from public.azh_change_orders where deal_id = new.deal_id;
  end if;
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    new.decided_on := case when new.status = 'pending' then null else coalesce(new.decided_on, current_date) end;
  end if;
  return new;
end;
$$;

create trigger azh_change_orders_before_write
  before insert or update on public.azh_change_orders
  for each row execute function app_private.azh_change_orders_before_write();

-- ---------------------------------------------------------------------------
-- Deal value follows the project: contract value + approved change orders
-- (never below 0), else the estimate total. Left alone when neither is set.
-- Mirrors src/features/azh/budget/math.ts (adjustedContract).
-- ---------------------------------------------------------------------------
create or replace function app_private.azh_sync_deal_value(p_deal_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  p public.azh_projects;
  v numeric;
begin
  select * into p from public.azh_projects where deal_id = p_deal_id;
  if not found then
    return;
  end if;
  if p.contract_value is not null then
    v := greatest(0, p.contract_value + coalesce((
      select sum(amount) from public.azh_change_orders where deal_id = p_deal_id and status = 'approved'
    ), 0));
  else
    v := p.estimate_total;
  end if;
  if v is not null then
    update public.deals set value = v where id = p_deal_id and value is distinct from v;
  end if;
end;
$$;

create or replace function app_private.azh_projects_after_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform app_private.azh_sync_deal_value(new.deal_id);
  return null;
end;
$$;

create trigger azh_projects_after_write
  after insert or update of contract_value, estimate_total on public.azh_projects
  for each row execute function app_private.azh_projects_after_write();

create or replace function app_private.azh_change_orders_after_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform app_private.azh_sync_deal_value(coalesce(new.deal_id, old.deal_id));
  return null;
end;
$$;

create trigger azh_change_orders_after_write
  after insert or delete or update of amount, status on public.azh_change_orders
  for each row execute function app_private.azh_change_orders_after_write();

-- ---------------------------------------------------------------------------
-- RLS: members read, writers write
-- ---------------------------------------------------------------------------
alter table public.azh_milestones enable row level security;
alter table public.azh_budget_lines enable row level security;
alter table public.azh_costs enable row level security;
alter table public.azh_change_orders enable row level security;

revoke all on public.azh_milestones, public.azh_budget_lines, public.azh_costs, public.azh_change_orders from anon;
grant select, insert, update, delete on public.azh_milestones, public.azh_budget_lines, public.azh_costs,
  public.azh_change_orders to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['azh_milestones', 'azh_budget_lines', 'azh_costs', 'azh_change_orders']
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
