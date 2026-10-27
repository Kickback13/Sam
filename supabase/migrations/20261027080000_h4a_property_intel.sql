-- =============================================================================
-- Housing4All Track (Phase 3A): property analysis tables.
--
--   h4a_underwriting  saved underwriting scenarios for a property (inputs + where each came from)
--   h4a_comps         sale and rent comps for a property, each with its source and date
--
-- Additive only: no existing table, column, policy or function changes.
-- Every table has workspace_id + RLS: members read, writers (owner/admin/agent)
-- write, viewers read only, anon gets nothing.
--
-- Results (NOI, cap rate, DSCR…) are never stored: they're computed from the
-- inputs by src/features/h4a/underwriting/math.ts, the same module the PDF uses,
-- so the screen, the PDF and a saved scenario can't disagree.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Underwriting scenarios. `inputs` is the UnderwritingInputs object (validated by
-- Zod in the server action); `input_sources` says where each input came from:
--   {"price": {"source": "listing", "label": "Listing email 10/24", "at": "…"},
--    "vacancyPct": {"source": "manual", "label": "Entered by Sam", "user_id": "…", "at": "…"}}
-- ---------------------------------------------------------------------------
create table public.h4a_underwriting (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  property_id uuid not null,
  name text not null check (char_length(name) between 1 and 120),
  inputs jsonb not null default '{}'::jsonb
    check (jsonb_typeof(inputs) = 'object' and pg_column_size(inputs) <= 32768),
  input_sources jsonb not null default '{}'::jsonb
    check (jsonb_typeof(input_sources) = 'object' and pg_column_size(input_sources) <= 32768),
  notes text check (notes is null or char_length(notes) <= 5000),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, property_id)
    references public.properties (workspace_id, id) on delete cascade
);
comment on table public.h4a_underwriting is
  'Underwriting scenarios per property. Inputs only — results are computed by the app (never stored).';
create index h4a_underwriting_property_idx on public.h4a_underwriting (workspace_id, property_id, updated_at desc);
create index h4a_underwriting_created_by_idx on public.h4a_underwriting (created_by);
create index h4a_underwriting_updated_by_idx on public.h4a_underwriting (updated_by);

create trigger h4a_underwriting_updated_at before update on public.h4a_underwriting
  for each row execute function app_private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Comps. A sale comp needs a price; a rent comp needs a monthly rent. Every comp
-- says where it came from and as of when (Sam's export, a broker OM, a public
-- record, or the data service in 3B). No scraping.
-- ---------------------------------------------------------------------------
create table public.h4a_comps (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  property_id uuid not null,
  kind text not null check (kind in ('sale', 'rent')),
  address text not null check (char_length(address) between 1 and 300),
  city text check (city is null or char_length(city) <= 100),
  zip text check (zip is null or char_length(zip) <= 20),
  units integer check (units is null or units between 1 and 100000),
  building_sqft integer check (building_sqft is null or building_sqft >= 0),
  year_built integer check (year_built is null or year_built between 1700 and 2100),
  price numeric(14, 2) check (price is null or price > 0),
  sale_date date,
  cap_rate numeric(5, 2) check (cap_rate is null or cap_rate between 0 and 100),
  price_per_unit numeric(14, 2) generated always as (
    case when price is not null and units is not null and units > 0 then round(price / units, 2) end
  ) stored,
  unit_type text check (unit_type is null or char_length(unit_type) <= 40),
  monthly_rent numeric(12, 2) check (monthly_rent is null or monthly_rent > 0),
  distance_miles numeric(6, 2) check (distance_miles is null or distance_miles >= 0),
  source_label text not null check (char_length(source_label) between 1 and 200),
  source_url text check (source_url is null or (char_length(source_url) <= 2048 and source_url ~* '^https?://')),
  as_of date not null,
  notes text check (notes is null or char_length(notes) <= 2000),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, property_id)
    references public.properties (workspace_id, id) on delete cascade,
  constraint h4a_comps_sale_has_price check (kind <> 'sale' or price is not null),
  constraint h4a_comps_rent_has_rent check (kind <> 'rent' or monthly_rent is not null)
);
comment on table public.h4a_comps is
  'Sale and rent comps for a property. source_label + as_of are required on every comp.';
create index h4a_comps_property_idx on public.h4a_comps (workspace_id, property_id, kind);
create index h4a_comps_created_by_idx on public.h4a_comps (created_by);

create trigger h4a_comps_updated_at before update on public.h4a_comps
  for each row execute function app_private.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS.
-- ---------------------------------------------------------------------------
alter table public.h4a_underwriting enable row level security;
alter table public.h4a_comps enable row level security;

revoke all on public.h4a_underwriting, public.h4a_comps from anon, authenticated;
grant select, insert, update, delete on public.h4a_underwriting, public.h4a_comps to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['h4a_underwriting', 'h4a_comps']
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
