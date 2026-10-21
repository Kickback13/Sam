-- =============================================================================
-- Housing4All Track (Phase 2A): Deal Engine tables.
--
--   h4a_buy_boxes          one buy box per workspace (empty until Sam fills it in)
--   h4a_listings           Deal Finder inbox: every listing that reaches the workspace
--   h4a_listing_events     history: created / updated / seen again / status / verification / promoted
--   h4a_inbound_emails     raw emails (sanitized text + HTML) and how they parsed
--   h4a_inbound_addresses  the workspace's forwarding address (only a SHA-256 hash is stored)
--   h4a_alerts             in-app alerts when a new listing scores at or above the threshold
--   h4a_imports            CSV import runs (counts + error report)
--
-- Additive only: no existing table, column, policy or function changes.
-- Every table has workspace_id + RLS. Listings, events, emails and alerts are
-- written only through the SECURITY DEFINER functions in *_h4a_deal_engine_functions.sql
-- (no insert/update/delete policies), so history can't be skipped or forged.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Buy box (one per workspace). Empty by default: no row, or a row with no criteria.
-- `version` goes up whenever a scoring criterion changes; listings store the
-- version they were scored against, so stale scores are easy to find.
-- ---------------------------------------------------------------------------
create table public.h4a_buy_boxes (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  zips text[] not null default '{}' check (cardinality(zips) <= 300),
  cities text[] not null default '{}' check (cardinality(cities) <= 100),
  submarkets text[] not null default '{}' check (cardinality(submarkets) <= 100),
  property_types text[] not null default '{}' check (property_types <@ array[
    'multifamily', 'duplex', 'triplex', 'fourplex', 'mixed_use', 'commercial', 'land', 'other'
  ]::text[]),
  units_min integer check (units_min is null or units_min between 0 and 100000),
  units_max integer check (units_max is null or units_max between 0 and 100000),
  price_min numeric(14, 2) check (price_min is null or price_min >= 0),
  price_max numeric(14, 2) check (price_max is null or price_max >= 0),
  max_price_per_unit numeric(14, 2) check (max_price_per_unit is null or max_price_per_unit >= 0),
  year_built_min integer check (year_built_min is null or year_built_min between 1700 and 2100),
  year_built_max integer check (year_built_max is null or year_built_max between 1700 and 2100),
  notes text check (notes is null or char_length(notes) <= 5000),
  alert_threshold integer not null default 70 check (alert_threshold between 0 and 100),
  version integer not null default 1,
  updated_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint h4a_buy_boxes_units_range check (units_min is null or units_max is null or units_min <= units_max),
  constraint h4a_buy_boxes_price_range check (price_min is null or price_max is null or price_min <= price_max),
  constraint h4a_buy_boxes_year_range check (year_built_min is null or year_built_max is null or year_built_min <= year_built_max)
);
comment on table public.h4a_buy_boxes is
  'Deal Finder buy box (one per workspace). Empty until the owner fills it in — never invent criteria.';
comment on column public.h4a_buy_boxes.version is
  'Bumped by trigger whenever a scoring criterion changes. Listings store the version they were scored against.';
create index h4a_buy_boxes_updated_by_idx on public.h4a_buy_boxes (updated_by);

create or replace function app_private.h4a_buy_boxes_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.version := 1;
  elsif (new.zips, new.cities, new.submarkets, new.property_types, new.units_min, new.units_max,
         new.price_min, new.price_max, new.max_price_per_unit, new.year_built_min, new.year_built_max)
        is distinct from
        (old.zips, old.cities, old.submarkets, old.property_types, old.units_min, old.units_max,
         old.price_min, old.price_max, old.max_price_per_unit, old.year_built_min, old.year_built_max) then
    new.version := old.version + 1;
  else
    new.version := old.version;
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end;
$$;

create trigger h4a_buy_boxes_before_write
  before insert or update on public.h4a_buy_boxes
  for each row execute function app_private.h4a_buy_boxes_before_write();

-- ---------------------------------------------------------------------------
-- Inbound emails: forwarded alert emails (Resend inbound), pasted emails, demo.
-- Bodies are stored sanitized (no scripts, no remote resources). Never rendered raw.
-- ---------------------------------------------------------------------------
create table public.h4a_inbound_emails (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  channel text not null check (channel in ('resend', 'paste', 'demo')),
  provider_email_id text check (provider_email_id is null or char_length(provider_email_id) <= 200),
  message_id text check (message_id is null or char_length(message_id) <= 998),
  from_address text check (from_address is null or char_length(from_address) <= 500),
  to_addresses text[] not null default '{}' check (cardinality(to_addresses) <= 50),
  subject text check (subject is null or char_length(subject) <= 998),
  received_at timestamptz not null default now(),
  text_body text check (text_body is null or char_length(text_body) <= 500000),
  html_body text check (html_body is null or char_length(html_body) <= 1000000),
  body_status text not null default 'pending' check (body_status in ('pending', 'stored', 'failed')),
  parse_status text not null default 'pending' check (parse_status in ('pending', 'parsed', 'no_listings', 'failed')),
  parser_key text check (parser_key is null or char_length(parser_key) <= 60),
  parser_label text check (parser_label is null or char_length(parser_label) <= 120),
  confidence text check (confidence is null or confidence in ('high', 'medium', 'low')),
  listing_count integer not null default 0 check (listing_count >= 0),
  parse_notes jsonb not null default '[]'::jsonb check (jsonb_typeof(parse_notes) = 'array'),
  error text check (error is null or char_length(error) <= 2000),
  attempts integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, provider_email_id)
);
comment on table public.h4a_inbound_emails is
  'Raw listing emails (sanitized). Links out of an email are never followed by the app.';
create index h4a_inbound_emails_ws_received_idx on public.h4a_inbound_emails (workspace_id, received_at desc);
create index h4a_inbound_emails_created_by_idx on public.h4a_inbound_emails (created_by);

create trigger h4a_inbound_emails_updated_at before update on public.h4a_inbound_emails
  for each row execute function app_private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Forwarding address. The address carries a random token; only its SHA-256 is
-- stored (shown once to the admin who creates it). Rotating = new token.
-- ---------------------------------------------------------------------------
create table public.h4a_inbound_addresses (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  token_hint text not null check (char_length(token_hint) between 2 and 8),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.h4a_inbound_addresses is
  'Forwarding address per workspace. Only a SHA-256 of the address token is stored.';
create index h4a_inbound_addresses_created_by_idx on public.h4a_inbound_addresses (created_by);

create trigger h4a_inbound_addresses_updated_at before update on public.h4a_inbound_addresses
  for each row execute function app_private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Listings. field_sources follows the properties convention:
--   {"price": {"source": "email", "label": "LoopNet alert", "url": "…", "fetched_at": "…", "user_id": null}}
-- price_per_unit is always calculated (price ÷ units); cap_rate is stored only
-- when the source states it.
-- ---------------------------------------------------------------------------
create table public.h4a_listings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  status text not null default 'new' check (status in ('new', 'needs_review', 'dismissed', 'promoted')),
  origin text not null check (origin in ('email', 'csv', 'manual', 'paste', 'county', 'demo')),
  source_label text not null check (char_length(source_label) between 1 and 120),
  address text not null check (char_length(address) between 1 and 300),
  city text check (city is null or char_length(city) <= 100),
  state text not null default 'CA' check (char_length(state) between 2 and 40),
  zip text check (zip is null or char_length(zip) <= 20),
  apn text check (apn is null or char_length(apn) <= 40),
  -- Dedupe keys (computed by src/features/h4a/listing/normalize.ts)
  street_key text not null check (char_length(street_key) between 1 and 300),
  apn_key text check (apn_key is null or apn_key ~ '^[0-9]{6,20}$'),
  match_keys text[] not null default '{}' check (cardinality(match_keys) <= 20),
  property_type text check (property_type is null or property_type in (
    'multifamily', 'duplex', 'triplex', 'fourplex', 'mixed_use', 'commercial', 'land', 'other'
  )),
  price numeric(14, 2) check (price is null or price >= 0),
  units integer check (units is null or units between 0 and 100000),
  price_per_unit numeric(14, 2) generated always as (
    case when units > 0 and price is not null then round(price / units, 2) end
  ) stored,
  cap_rate numeric(5, 2) check (cap_rate is null or cap_rate between 0 and 100),
  year_built integer check (year_built is null or year_built between 1700 and 2100),
  building_sqft integer check (building_sqft is null or building_sqft >= 0),
  lot_sqft integer check (lot_sqft is null or lot_sqft >= 0),
  submarket text check (submarket is null or char_length(submarket) <= 100),
  broker_name text check (broker_name is null or char_length(broker_name) <= 200),
  broker_company text check (broker_company is null or char_length(broker_company) <= 200),
  broker_phone text check (broker_phone is null or char_length(broker_phone) <= 40),
  broker_email extensions.citext check (broker_email is null or char_length(broker_email::text) <= 320),
  listing_url text check (listing_url is null or (char_length(listing_url) <= 2048 and listing_url ~* '^https?://')),
  received_at timestamptz not null default now(),
  last_received_at timestamptz not null default now(),
  field_sources jsonb not null default '{}'::jsonb check (jsonb_typeof(field_sources) = 'object'),
  review_reasons text[] not null default '{}' check (cardinality(review_reasons) <= 20),
  parse_confidence text check (parse_confidence is null or parse_confidence in ('high', 'medium', 'low')),
  -- Score (computed by src/features/h4a/scoring/score.ts)
  score integer check (score is null or score between 0 and 100),
  score_breakdown jsonb not null default '[]'::jsonb check (jsonb_typeof(score_breakdown) = 'array'),
  scored_at timestamptz,
  scored_buy_box_version integer,
  -- Verification
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'verified', 'mismatch')),
  verification_note text check (verification_note is null or char_length(verification_note) <= 2000),
  verification_source text check (verification_source is null or char_length(verification_source) <= 300),
  verified_at timestamptz,
  verified_by uuid references public.profiles (id) on delete set null,
  -- Dismiss / promote
  dismissed_reason text check (dismissed_reason is null or char_length(dismissed_reason) <= 500),
  dismissed_at timestamptz,
  dismissed_by uuid references public.profiles (id) on delete set null,
  property_id uuid,
  deal_id uuid,
  promoted_at timestamptz,
  promoted_by uuid references public.profiles (id) on delete set null,
  search_text text not null default '',
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, property_id)
    references public.properties (workspace_id, id) on delete set null (property_id),
  foreign key (workspace_id, deal_id)
    references public.deals (workspace_id, id) on delete set null (deal_id),
  constraint h4a_listings_dismissed_reason check (status <> 'dismissed' or dismissed_reason is not null),
  constraint h4a_listings_verification_evidence check (
    verification_status = 'unverified'
    or (verification_note is not null and verification_source is not null and verified_at is not null)
  )
);
comment on table public.h4a_listings is
  'Deal Finder inbox. Written only through h4a_* functions so every change lands in h4a_listing_events.';
comment on column public.h4a_listings.match_keys is
  'Dedupe keys: apn:<digits> and addr:<street>|<zip or city>. A new listing matches an existing one when keys overlap (and APNs do not conflict).';

create index h4a_listings_ws_status_idx on public.h4a_listings (workspace_id, status, received_at desc);
create index h4a_listings_ws_score_idx on public.h4a_listings (workspace_id, score desc nulls last);
create index h4a_listings_ws_received_idx on public.h4a_listings (workspace_id, received_at desc);
create index h4a_listings_ws_zip_idx on public.h4a_listings (workspace_id, zip);
create index h4a_listings_ws_verification_idx on public.h4a_listings (workspace_id, verification_status);
create index h4a_listings_match_keys_idx on public.h4a_listings using gin (match_keys);
create index h4a_listings_apn_key_idx on public.h4a_listings (workspace_id, apn_key) where apn_key is not null;
create index h4a_listings_search_idx on public.h4a_listings using gin (search_text extensions.gin_trgm_ops);
create index h4a_listings_property_idx on public.h4a_listings (workspace_id, property_id);
create index h4a_listings_deal_idx on public.h4a_listings (workspace_id, deal_id);
create index h4a_listings_created_by_idx on public.h4a_listings (created_by);
create index h4a_listings_verified_by_idx on public.h4a_listings (verified_by);
create index h4a_listings_dismissed_by_idx on public.h4a_listings (dismissed_by);
create index h4a_listings_promoted_by_idx on public.h4a_listings (promoted_by);

create or replace function app_private.h4a_listings_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.search_text := lower(concat_ws(' ',
    new.address, new.city, new.zip, new.apn, new.submarket,
    new.broker_name, new.broker_company, new.broker_email::text, new.source_label
  ));
  new.updated_at := now();
  return new;
end;
$$;

create trigger h4a_listings_before_write
  before insert or update on public.h4a_listings
  for each row execute function app_private.h4a_listings_before_write();

-- ---------------------------------------------------------------------------
-- Listing history (append-only; written by the h4a_* functions).
-- ---------------------------------------------------------------------------
create table public.h4a_listing_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  listing_id uuid not null,
  kind text not null check (kind in ('created', 'updated', 'repeat', 'status', 'verification', 'promoted')),
  origin text check (origin is null or origin in ('email', 'csv', 'manual', 'paste', 'county', 'demo', 'system')),
  source_label text check (source_label is null or char_length(source_label) <= 120),
  email_id uuid,
  actor_id uuid references public.profiles (id) on delete set null,
  summary text check (summary is null or char_length(summary) <= 1000),
  changes jsonb not null default '{}'::jsonb check (jsonb_typeof(changes) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (workspace_id, listing_id) references public.h4a_listings (workspace_id, id) on delete cascade,
  foreign key (workspace_id, email_id)
    references public.h4a_inbound_emails (workspace_id, id) on delete set null (email_id)
);
create index h4a_listing_events_listing_idx on public.h4a_listing_events (listing_id, created_at desc);
create index h4a_listing_events_ws_listing_idx on public.h4a_listing_events (workspace_id, listing_id);
create index h4a_listing_events_ws_email_idx on public.h4a_listing_events (workspace_id, email_id);
create index h4a_listing_events_actor_idx on public.h4a_listing_events (actor_id);

-- ---------------------------------------------------------------------------
-- Alerts (in-app). One per listing, created when a new or updated listing scores
-- at or above the buy box threshold. Email delivery is built but off (Not connected).
-- ---------------------------------------------------------------------------
create table public.h4a_alerts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  listing_id uuid not null,
  score integer not null check (score between 0 and 100),
  threshold integer not null check (threshold between 0 and 100),
  reason text not null default 'new_listing' check (reason in ('new_listing', 'updated_listing')),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  read_by uuid references public.profiles (id) on delete set null,
  email_status text not null default 'not_connected'
    check (email_status in ('not_connected', 'off', 'queued', 'sent', 'failed')),
  email_error text check (email_error is null or char_length(email_error) <= 1000),
  email_sent_at timestamptz,
  unique (workspace_id, listing_id),
  foreign key (workspace_id, listing_id) references public.h4a_listings (workspace_id, id) on delete cascade
);
create index h4a_alerts_ws_created_idx on public.h4a_alerts (workspace_id, created_at desc);
create index h4a_alerts_read_by_idx on public.h4a_alerts (read_by);

-- ---------------------------------------------------------------------------
-- CSV import runs.
-- ---------------------------------------------------------------------------
create table public.h4a_imports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  filename text check (filename is null or char_length(filename) <= 255),
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  mapping jsonb not null default '{}'::jsonb check (jsonb_typeof(mapping) = 'object'),
  total_rows integer not null default 0 check (total_rows >= 0),
  created_count integer not null default 0,
  updated_count integer not null default 0,
  unchanged_count integer not null default 0,
  error_count integer not null default 0,
  errors jsonb not null default '[]'::jsonb check (jsonb_typeof(errors) = 'array'),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index h4a_imports_ws_idx on public.h4a_imports (workspace_id, created_at desc);
create index h4a_imports_created_by_idx on public.h4a_imports (created_by);

create trigger h4a_imports_updated_at before update on public.h4a_imports
  for each row execute function app_private.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS. anon gets nothing. Listings, events, emails and alerts are read-only for
-- users (writes go through the h4a_* functions, which check membership).
-- ---------------------------------------------------------------------------
alter table public.h4a_buy_boxes enable row level security;
alter table public.h4a_inbound_emails enable row level security;
alter table public.h4a_inbound_addresses enable row level security;
alter table public.h4a_listings enable row level security;
alter table public.h4a_listing_events enable row level security;
alter table public.h4a_alerts enable row level security;
alter table public.h4a_imports enable row level security;

revoke all on public.h4a_buy_boxes, public.h4a_inbound_emails, public.h4a_inbound_addresses,
  public.h4a_listings, public.h4a_listing_events, public.h4a_alerts, public.h4a_imports
  from anon, authenticated;
grant select on public.h4a_inbound_emails, public.h4a_listings, public.h4a_listing_events, public.h4a_alerts
  to authenticated;
grant select, insert, update, delete on public.h4a_buy_boxes, public.h4a_inbound_addresses, public.h4a_imports
  to authenticated;

-- Members read.
do $$
declare
  t text;
begin
  foreach t in array array['h4a_buy_boxes', 'h4a_inbound_emails', 'h4a_listings', 'h4a_listing_events', 'h4a_alerts', 'h4a_imports']
  loop
    execute format(
      'create policy "members read" on public.%I for select to authenticated
         using (workspace_id in (select app_private.member_workspace_ids()))', t);
  end loop;
end;
$$;

-- Buy box: admins (owner/admin) write.
create policy "admins insert" on public.h4a_buy_boxes for insert to authenticated
  with check (workspace_id in (select app_private.admin_workspace_ids()));
create policy "admins update" on public.h4a_buy_boxes for update to authenticated
  using (workspace_id in (select app_private.admin_workspace_ids()))
  with check (workspace_id in (select app_private.admin_workspace_ids()));
create policy "admins delete" on public.h4a_buy_boxes for delete to authenticated
  using (workspace_id in (select app_private.admin_workspace_ids()));

-- Forwarding address: admins only (read and write).
create policy "admins read" on public.h4a_inbound_addresses for select to authenticated
  using (workspace_id in (select app_private.admin_workspace_ids()));
create policy "admins insert" on public.h4a_inbound_addresses for insert to authenticated
  with check (workspace_id in (select app_private.admin_workspace_ids()));
create policy "admins update" on public.h4a_inbound_addresses for update to authenticated
  using (workspace_id in (select app_private.admin_workspace_ids()))
  with check (workspace_id in (select app_private.admin_workspace_ids()));
create policy "admins delete" on public.h4a_inbound_addresses for delete to authenticated
  using (workspace_id in (select app_private.admin_workspace_ids()));

-- CSV imports: writers create and update their runs.
create policy "writers insert" on public.h4a_imports for insert to authenticated
  with check (workspace_id in (select app_private.writer_workspace_ids()));
create policy "writers update" on public.h4a_imports for update to authenticated
  using (workspace_id in (select app_private.writer_workspace_ids()))
  with check (workspace_id in (select app_private.writer_workspace_ids()));
