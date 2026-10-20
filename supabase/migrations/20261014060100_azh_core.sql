-- =============================================================================
-- AZH Track: construction settings, ZIP → office routing, project details
-- (1:1 with a deal) and estimates. Additive only — no existing table changes.
--
-- Offices: 'san_diego' | 'fallbrook'. Money is numeric(14,2). Every table has
-- workspace_id + RLS (members read; writers write CRM data; admins write config).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function app_private.azh_is_office(v text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select v in ('san_diego', 'fallbrook');
$$;

-- Default North County ZIPs routed to the Fallbrook office (AZH-004).
-- Everything not listed routes to San Diego. Sam confirms/edits the list in
-- Settings → AZH; this is only the starting point for new construction workspaces.
create or replace function app_private.azh_default_fallbrook_zips()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    '92028',                                     -- Fallbrook / Rainbow / De Luz
    '92003',                                     -- Bonsall
    '92059',                                     -- Pala
    '92061',                                     -- Pauma Valley
    '92082',                                     -- Valley Center
    '92055',                                     -- Camp Pendleton
    '92054', '92056', '92057', '92058',          -- Oceanside
    '92081', '92083', '92084',                   -- Vista
    '92069', '92078',                            -- San Marcos
    '92025', '92026', '92027', '92029',          -- Escondido
    '92008', '92009', '92010', '92011'           -- Carlsbad
  ]::text[];
$$;

create or replace function app_private.azh_default_service_types()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'Framing', 'Drywall', 'Painting', 'Carpentry', 'Cement & concrete', 'ADU',
    'Tenant improvement', 'Renovation', 'Other'
  ]::text[];
$$;

-- ---------------------------------------------------------------------------
-- Settings (one row per construction workspace)
-- ---------------------------------------------------------------------------
create table public.azh_settings (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  cslb_license text check (cslb_license is null or char_length(cslb_license) between 1 and 20),
  service_types text[] not null default app_private.azh_default_service_types()
    check (cardinality(service_types) between 1 and 40),
  intake_enabled boolean not null default true,
  san_diego_assignee uuid references public.profiles (id) on delete set null,
  fallbrook_assignee uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.azh_settings is 'AZH construction settings. cslb_license is blank until Sam enters it — never invent one.';
comment on column public.azh_settings.san_diego_assignee is 'Optional default assignee for tasks created by the request form for the San Diego office.';

create trigger azh_settings_updated_at before update on public.azh_settings
  for each row execute function app_private.set_updated_at();

-- ---------------------------------------------------------------------------
-- ZIP → office routing
-- ---------------------------------------------------------------------------
create table public.azh_zip_routes (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  zip text not null check (zip ~ '^[0-9]{5}$'),
  office text not null check (app_private.azh_is_office(office)),
  created_at timestamptz not null default now(),
  primary key (workspace_id, zip)
);
comment on table public.azh_zip_routes is 'ZIPs routed to a specific office. Unlisted ZIPs route to San Diego.';

/** Office for a ZIP (first 5 digits); unknown/blank → san_diego. */
create or replace function app_private.azh_route_office(p_workspace_id uuid, p_zip text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select r.office from public.azh_zip_routes r
     where r.workspace_id = p_workspace_id
       and r.zip = substring(regexp_replace(coalesce(p_zip, ''), '\D', '', 'g') from 1 for 5)),
    'san_diego'
  );
$$;
revoke all on function app_private.azh_route_office(uuid, text) from public, anon;
grant execute on function app_private.azh_route_office(uuid, text) to authenticated;

-- Initialize settings + default routes for a construction workspace (idempotent).
create or replace function app_private.azh_init_workspace(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.azh_settings (workspace_id) values (p_workspace_id)
  on conflict (workspace_id) do nothing;
  if not exists (select 1 from public.azh_zip_routes where workspace_id = p_workspace_id) then
    insert into public.azh_zip_routes (workspace_id, zip, office)
    select p_workspace_id, z, 'fallbrook' from unnest(app_private.azh_default_fallbrook_zips()) z
    on conflict do nothing;
  end if;
end;
$$;
revoke all on function app_private.azh_init_workspace(uuid) from public, anon, authenticated;

create or replace function app_private.azh_workspaces_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.business_type = 'construction' then
    perform app_private.azh_init_workspace(new.id);
  end if;
  return null;
end;
$$;

create trigger azh_workspaces_after_insert
  after insert on public.workspaces
  for each row execute function app_private.azh_workspaces_after_insert();

select app_private.azh_init_workspace(w.id) from public.workspaces w where w.business_type = 'construction';

-- Replace a workspace's Fallbrook ZIP list atomically (SECURITY INVOKER → admin RLS applies).
create or replace function public.azh_replace_fallbrook_zips(p_workspace_id uuid, p_zips text[])
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  n integer;
begin
  if exists (select 1 from unnest(coalesce(p_zips, '{}')) z where z !~ '^[0-9]{5}$') then
    raise exception 'ZIPs must be 5 digits' using errcode = '22023';
  end if;
  delete from public.azh_zip_routes where workspace_id = p_workspace_id;
  insert into public.azh_zip_routes (workspace_id, zip, office)
  select distinct p_workspace_id, z, 'fallbrook' from unnest(coalesce(p_zips, '{}')) z;
  get diagnostics n = row_count;
  return n;
end;
$$;
grant execute on function public.azh_replace_fallbrook_zips(uuid, text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Project details (1:1 with a deal in a construction pipeline)
-- ---------------------------------------------------------------------------
create table public.azh_projects (
  deal_id uuid primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  job_address text check (job_address is null or char_length(job_address) <= 300),
  job_zip text check (job_zip is null or job_zip ~ '^[0-9]{5}$'),
  property_id uuid,
  service_types text[] not null default '{}' check (cardinality(service_types) <= 20),
  office text check (office is null or app_private.azh_is_office(office)),
  source text check (source is null or char_length(source) <= 100),
  estimate_total numeric(14, 2) check (estimate_total is null or estimate_total >= 0),
  contract_value numeric(14, 2) check (contract_value is null or contract_value >= 0),
  bid_sent_on date,
  start_on date,
  target_on date,
  completed_on date,
  project_lead uuid references public.profiles (id) on delete set null,
  notes text check (notes is null or char_length(notes) <= 20000),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, deal_id),
  foreign key (workspace_id, deal_id) references public.deals (workspace_id, id) on delete cascade,
  foreign key (workspace_id, property_id)
    references public.properties (workspace_id, id) on delete set null (property_id)
);
comment on table public.azh_projects is 'AZH project details, keyed 1:1 to deals. contract_value excludes change orders.';
create index azh_projects_ws_idx on public.azh_projects (workspace_id, office);
create index azh_projects_property_idx on public.azh_projects (workspace_id, property_id);
create index azh_projects_lead_idx on public.azh_projects (project_lead);
create index azh_projects_created_by_idx on public.azh_projects (created_by);

create trigger azh_projects_updated_at before update on public.azh_projects
  for each row execute function app_private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Estimates + line items. Totals are computed here (AZH-003), never trusted
-- from the client; src/features/azh/estimates/math.ts mirrors the rules.
--   line_total = round(qty * unit_price, 2)
--   markup     = round(subtotal * markup_pct / 100, 2)
--   tax        = round((subtotal + markup) * tax_pct / 100, 2)
--   total      = subtotal + markup + tax
-- ---------------------------------------------------------------------------
create table public.azh_estimates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  deal_id uuid not null,
  version integer not null default 1 check (version between 1 and 999),
  revised_from uuid,
  title text not null default 'Estimate' check (char_length(title) between 1 and 200),
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'declined')),
  sent_on date,
  accepted_on date,
  declined_on date,
  valid_until date,
  markup_pct numeric(6, 3) not null default 0 check (markup_pct between 0 and 100),
  tax_pct numeric(6, 3) not null default 0 check (tax_pct between 0 and 100),
  subtotal numeric(14, 2) not null default 0,
  markup_amount numeric(14, 2) not null default 0,
  tax_amount numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  notes text check (notes is null or char_length(notes) <= 5000),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (deal_id, version),
  foreign key (workspace_id, deal_id) references public.deals (workspace_id, id) on delete cascade,
  foreign key (workspace_id, revised_from)
    references public.azh_estimates (workspace_id, id) on delete set null (revised_from)
);
create index azh_estimates_deal_idx on public.azh_estimates (workspace_id, deal_id, version desc);
create index azh_estimates_status_idx on public.azh_estimates (workspace_id, status);
create index azh_estimates_revised_from_idx on public.azh_estimates (workspace_id, revised_from);
create index azh_estimates_created_by_idx on public.azh_estimates (created_by);

create trigger azh_estimates_updated_at before update on public.azh_estimates
  for each row execute function app_private.set_updated_at();

create table public.azh_estimate_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  estimate_id uuid not null,
  position integer not null default 0,
  description text not null check (char_length(description) between 1 and 500),
  qty numeric(12, 3) not null default 1 check (qty >= 0 and qty <= 1000000),
  unit text check (unit is null or char_length(unit) <= 20),
  unit_price numeric(14, 2) not null default 0 check (unit_price >= 0 and unit_price <= 100000000),
  line_total numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, estimate_id) references public.azh_estimates (workspace_id, id) on delete cascade
);
create index azh_estimate_items_estimate_idx on public.azh_estimate_items (workspace_id, estimate_id, position);

create or replace function app_private.azh_estimate_items_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.line_total := round(new.qty * new.unit_price, 2);
  return new;
end;
$$;

create trigger azh_estimate_items_before_write
  before insert or update on public.azh_estimate_items
  for each row execute function app_private.azh_estimate_items_before_write();

create or replace function app_private.azh_estimate_recalc(p_estimate_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  sub numeric;
  e public.azh_estimates;
  mk numeric;
  tx numeric;
begin
  select * into e from public.azh_estimates where id = p_estimate_id;
  if not found then
    return;
  end if;
  select coalesce(sum(line_total), 0) into sub from public.azh_estimate_items where estimate_id = p_estimate_id;
  mk := round(sub * e.markup_pct / 100, 2);
  tx := round((sub + mk) * e.tax_pct / 100, 2);
  update public.azh_estimates
  set subtotal = sub, markup_amount = mk, tax_amount = tx, total = sub + mk + tx
  where id = p_estimate_id
    and (subtotal, markup_amount, tax_amount, total) is distinct from (sub, mk, tx, sub + mk + tx);
end;
$$;

create or replace function app_private.azh_estimate_items_after_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform app_private.azh_estimate_recalc(old.estimate_id);
  end if;
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.estimate_id is distinct from old.estimate_id) then
    perform app_private.azh_estimate_recalc(new.estimate_id);
  end if;
  return null;
end;
$$;

create trigger azh_estimate_items_after_write
  after insert or update or delete on public.azh_estimate_items
  for each row execute function app_private.azh_estimate_items_after_write();

create or replace function app_private.azh_estimates_after_pct_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform app_private.azh_estimate_recalc(new.id);
  return null;
end;
$$;

create trigger azh_estimates_after_pct_change
  after update of markup_pct, tax_pct on public.azh_estimates
  for each row execute function app_private.azh_estimates_after_pct_change();

-- Status dates follow the status.
create or replace function app_private.azh_estimates_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    if new.status = 'sent' then
      new.sent_on := coalesce(new.sent_on, current_date);
      new.accepted_on := null;
      new.declined_on := null;
    elsif new.status = 'accepted' then
      new.sent_on := coalesce(new.sent_on, current_date);
      new.accepted_on := coalesce(new.accepted_on, current_date);
      new.declined_on := null;
    elsif new.status = 'declined' then
      new.sent_on := coalesce(new.sent_on, current_date);
      new.declined_on := coalesce(new.declined_on, current_date);
      new.accepted_on := null;
    else
      new.sent_on := null;
      new.accepted_on := null;
      new.declined_on := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger azh_estimates_before_write
  before insert or update on public.azh_estimates
  for each row execute function app_private.azh_estimates_before_write();

-- The project's estimate_total follows its estimates: the newest accepted
-- version, else the newest version that isn't declined (null when none).
create or replace function app_private.azh_refresh_project_estimate(p_workspace_id uuid, p_deal_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  t numeric;
begin
  select e.total into t
  from public.azh_estimates e
  where e.deal_id = p_deal_id and e.status <> 'declined'
  order by (e.status = 'accepted') desc, e.version desc
  limit 1;

  insert into public.azh_projects (deal_id, workspace_id, estimate_total)
  values (p_deal_id, p_workspace_id, t)
  on conflict (deal_id) do update set estimate_total = excluded.estimate_total
  where public.azh_projects.estimate_total is distinct from excluded.estimate_total;
end;
$$;

create or replace function app_private.azh_estimates_after_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    -- Skip when the whole deal is being deleted (cascade).
    if exists (select 1 from public.deals where id = old.deal_id) then
      perform app_private.azh_refresh_project_estimate(old.workspace_id, old.deal_id);
    end if;
  else
    perform app_private.azh_refresh_project_estimate(new.workspace_id, new.deal_id);
  end if;
  return null;
end;
$$;

create trigger azh_estimates_after_write
  after insert or delete or update of total, status on public.azh_estimates
  for each row execute function app_private.azh_estimates_after_write();

-- Save an estimate's header + items atomically (SECURITY INVOKER → RLS applies).
-- p_items: [{ description, qty, unit, unit_price }] in display order.
create or replace function public.azh_save_estimate(
  p_estimate_id uuid,
  p_title text,
  p_markup_pct numeric,
  p_tax_pct numeric,
  p_items jsonb,
  p_valid_until date default null,
  p_notes text default null
)
returns public.azh_estimates
language plpgsql
security invoker
set search_path = ''
as $$
declare
  e public.azh_estimates;
begin
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 200 then
    raise exception 'Items must be a list of at most 200 lines' using errcode = '22023';
  end if;

  update public.azh_estimates
  set title = p_title, markup_pct = p_markup_pct, tax_pct = p_tax_pct,
      valid_until = p_valid_until, notes = p_notes
  where id = p_estimate_id
  returning * into e;
  if not found then
    raise exception 'Estimate not found' using errcode = 'P0002';
  end if;

  delete from public.azh_estimate_items where estimate_id = e.id;
  insert into public.azh_estimate_items (workspace_id, estimate_id, position, description, qty, unit, unit_price)
  select e.workspace_id, e.id, (i.ord - 1)::integer,
         btrim(i.item ->> 'description'),
         coalesce((i.item ->> 'qty')::numeric, 1),
         nullif(btrim(coalesce(i.item ->> 'unit', '')), ''),
         coalesce((i.item ->> 'unit_price')::numeric, 0)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as i(item, ord);

  perform app_private.azh_estimate_recalc(e.id);
  select * into e from public.azh_estimates where id = e.id;
  return e;
end;
$$;
grant execute on function public.azh_save_estimate(uuid, text, numeric, numeric, jsonb, date, text) to authenticated;

-- "Duplicate to revise": copy an estimate + items as the next version (draft).
create or replace function public.azh_duplicate_estimate(p_estimate_id uuid)
returns public.azh_estimates
language plpgsql
security invoker
set search_path = ''
as $$
declare
  src public.azh_estimates;
  e public.azh_estimates;
  next_version integer;
begin
  select * into src from public.azh_estimates where id = p_estimate_id;
  if not found then
    raise exception 'Estimate not found' using errcode = 'P0002';
  end if;
  select coalesce(max(version), 0) + 1 into next_version from public.azh_estimates where deal_id = src.deal_id;

  insert into public.azh_estimates (workspace_id, deal_id, version, revised_from, title, status, valid_until, markup_pct, tax_pct, notes)
  values (src.workspace_id, src.deal_id, next_version, src.id, src.title, 'draft', src.valid_until, src.markup_pct, src.tax_pct, src.notes)
  returning * into e;

  insert into public.azh_estimate_items (workspace_id, estimate_id, position, description, qty, unit, unit_price)
  select e.workspace_id, e.id, position, description, qty, unit, unit_price
  from public.azh_estimate_items where estimate_id = src.id;

  perform app_private.azh_estimate_recalc(e.id);
  select * into e from public.azh_estimates where id = e.id;
  return e;
end;
$$;
grant execute on function public.azh_duplicate_estimate(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.azh_settings enable row level security;
alter table public.azh_zip_routes enable row level security;
alter table public.azh_projects enable row level security;
alter table public.azh_estimates enable row level security;
alter table public.azh_estimate_items enable row level security;

revoke all on public.azh_settings, public.azh_zip_routes, public.azh_projects,
  public.azh_estimates, public.azh_estimate_items from anon;
grant select, insert, update, delete on public.azh_settings, public.azh_zip_routes, public.azh_projects,
  public.azh_estimates, public.azh_estimate_items to authenticated;

-- Configuration: members read, admins write.
do $$
declare
  t text;
begin
  foreach t in array array['azh_settings', 'azh_zip_routes']
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

-- CRM data: members read, writers write.
do $$
declare
  t text;
begin
  foreach t in array array['azh_projects', 'azh_estimates', 'azh_estimate_items']
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
