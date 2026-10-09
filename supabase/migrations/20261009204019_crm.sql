-- =============================================================================
-- CRM tables. Every table carries workspace_id. Cross-table references use
-- composite (workspace_id, id) foreign keys so a row can never point at
-- another tenant's data, even for users who belong to several workspaces.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Companies
-- ---------------------------------------------------------------------------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  type text check (type is null or type in (
    'brokerage', 'property_management', 'lender', 'investor', 'developer', 'gc',
    'subcontractor', 'supplier', 'vendor', 'government', 'other'
  )),
  website text check (website is null or char_length(website) <= 500),
  phone text check (phone is null or char_length(phone) <= 40),
  email extensions.citext,
  address text,
  city text,
  state text,
  zip text,
  notes text,
  tags text[] not null default '{}',
  search_text text not null default '',
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workspace_id, id)
);
create index companies_ws_name_idx on public.companies (workspace_id, name) where deleted_at is null;
create index companies_search_idx on public.companies using gin (search_text extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Contacts (people). Compliance fields are designed for Phase 4 outreach gates.
-- ---------------------------------------------------------------------------
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  first_name text check (first_name is null or char_length(first_name) <= 100),
  last_name text check (last_name is null or char_length(last_name) <= 100),
  full_name text generated always as (
    nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')
  ) stored,
  company_id uuid,
  title text check (title is null or char_length(title) <= 150),
  roles text[] not null default '{}' check (roles <@ array[
    'owner', 'broker', 'property_manager', 'investor', 'buyer', 'seller', 'lender',
    'gc', 'subcontractor', 'homeowner', 'tenant', 'vendor', 'other'
  ]::text[]),
  -- [{ value, label, is_primary }]
  emails jsonb not null default '[]'::jsonb check (jsonb_typeof(emails) = 'array'),
  -- [{ value, label, type: mobile|landline|unknown, is_primary }]
  phones jsonb not null default '[]'::jsonb check (jsonb_typeof(phones) = 'array'),
  -- Normalized dedupe keys, maintained by trigger from emails/phones.
  email_keys text[] not null default '{}',
  phone_keys text[] not null default '{}',
  address text,
  city text,
  state text,
  zip text,
  source text check (source is null or char_length(source) <= 100),
  tags text[] not null default '{}',
  assigned_to uuid references public.profiles (id) on delete set null,
  language text not null default 'en' check (language in ('en', 'es')),
  -- Compliance (TCPA / CAN-SPAM / DNC). Nothing sends in Phase 1.
  dnc boolean not null default false,
  sms_consent public.sms_consent not null default 'none',
  sms_consent_at timestamptz,
  sms_consent_source text,
  email_opt_out boolean not null default false,
  email_opt_out_at timestamptz,
  ghl_contact_id text,
  notes text,
  search_text text not null default '',
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workspace_id, id),
  foreign key (workspace_id, company_id)
    references public.companies (workspace_id, id) on delete set null (company_id),
  constraint contacts_identifiable check (
    first_name is not null or last_name is not null
    or jsonb_array_length(emails) > 0 or jsonb_array_length(phones) > 0
  ),
  constraint contacts_sms_consent_evidence check (
    sms_consent = 'none' or (sms_consent_at is not null and sms_consent_source is not null)
  )
);
comment on column public.contacts.sms_consent is 'TCPA consent level. express/written require sms_consent_at + sms_consent_source.';
comment on column public.contacts.email_keys is 'Normalized emails for dedupe (lowercase).';
comment on column public.contacts.phone_keys is 'Normalized phones for dedupe (+1XXXXXXXXXX for US numbers).';

create index contacts_ws_created_idx on public.contacts (workspace_id, created_at desc) where deleted_at is null;
create index contacts_ws_name_idx on public.contacts (workspace_id, last_name, first_name) where deleted_at is null;
create index contacts_email_keys_idx on public.contacts using gin (email_keys);
create index contacts_phone_keys_idx on public.contacts using gin (phone_keys);
create index contacts_tags_idx on public.contacts using gin (tags);
create index contacts_roles_idx on public.contacts using gin (roles);
create index contacts_search_idx on public.contacts using gin (search_text extensions.gin_trgm_ops);
create index contacts_company_idx on public.contacts (workspace_id, company_id);
create index contacts_assigned_idx on public.contacts (assigned_to);
create unique index contacts_ghl_id_uniq on public.contacts (workspace_id, ghl_contact_id) where ghl_contact_id is not null;

-- ---------------------------------------------------------------------------
-- Properties. field_sources is the trust layer: per field { source, label, url, fetched_at, user_id }.
-- ---------------------------------------------------------------------------
create table public.properties (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text check (name is null or char_length(name) <= 200),
  address text not null check (char_length(address) between 1 and 300),
  city text,
  state text not null default 'CA',
  zip text,
  county text not null default 'San Diego',
  apn text check (apn is null or char_length(apn) <= 40),
  lat numeric(9, 6) check (lat is null or lat between -90 and 90),
  lng numeric(9, 6) check (lng is null or lng between -180 and 180),
  property_type text check (property_type is null or property_type in (
    'multifamily', 'duplex', 'triplex', 'fourplex', 'mixed_use', 'commercial', 'land', 'other'
  )),
  units integer check (units is null or units between 0 and 100000),
  buildings integer check (buildings is null or buildings between 0 and 10000),
  building_sqft integer check (building_sqft is null or building_sqft >= 0),
  lot_sqft integer check (lot_sqft is null or lot_sqft >= 0),
  year_built integer check (year_built is null or year_built between 1700 and 2100),
  zoning text,
  submarket text,
  owner_contact_id uuid,
  owner_company_id uuid,
  last_sale_date date,
  last_sale_price numeric(14, 2) check (last_sale_price is null or last_sale_price >= 0),
  assessed_value numeric(14, 2) check (assessed_value is null or assessed_value >= 0),
  field_sources jsonb not null default '{}'::jsonb check (jsonb_typeof(field_sources) = 'object'),
  notes text,
  tags text[] not null default '{}',
  search_text text not null default '',
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workspace_id, id),
  foreign key (workspace_id, owner_contact_id)
    references public.contacts (workspace_id, id) on delete set null (owner_contact_id),
  foreign key (workspace_id, owner_company_id)
    references public.companies (workspace_id, id) on delete set null (owner_company_id)
);
comment on column public.properties.field_sources is
  'Per-field provenance: {"units": {"source": "manual", "label": "Entered by Sam", "url": null, "fetched_at": "…", "user_id": "…"}}';
create index properties_ws_created_idx on public.properties (workspace_id, created_at desc) where deleted_at is null;
create index properties_owner_contact_idx on public.properties (workspace_id, owner_contact_id);
create index properties_owner_company_idx on public.properties (workspace_id, owner_company_id);
create index properties_apn_idx on public.properties (workspace_id, apn) where apn is not null;
create index properties_search_idx on public.properties using gin (search_text extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Pipelines & stages
-- ---------------------------------------------------------------------------
create table public.pipelines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  kind public.pipeline_kind not null,
  position integer not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);
create unique index pipelines_one_default on public.pipelines (workspace_id) where is_default;

create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  pipeline_id uuid not null,
  name text not null check (char_length(name) between 1 and 60),
  position integer not null default 0,
  color text not null default '#64748B' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  is_won boolean not null default false,
  is_lost boolean not null default false,
  probability integer not null default 0 check (probability between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (pipeline_id, id),
  foreign key (workspace_id, pipeline_id)
    references public.pipelines (workspace_id, id) on delete cascade,
  constraint stage_not_won_and_lost check (not (is_won and is_lost))
);
create index pipeline_stages_pipeline_idx on public.pipeline_stages (pipeline_id, position);

-- ---------------------------------------------------------------------------
-- Deals
-- ---------------------------------------------------------------------------
create table public.deals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  pipeline_id uuid not null,
  stage_id uuid not null,
  title text not null check (char_length(title) between 1 and 200),
  property_id uuid,
  primary_contact_id uuid,
  value numeric(14, 2) check (value is null or value >= 0),
  asking_price numeric(14, 2) check (asking_price is null or asking_price >= 0),
  units integer check (units is null or units >= 0),
  source text check (source is null or char_length(source) <= 100),
  assigned_to uuid references public.profiles (id) on delete set null,
  expected_close date,
  status public.deal_status not null default 'open',
  lost_reason text check (lost_reason is null or char_length(lost_reason) <= 500),
  closed_at timestamptz,
  stage_entered_at timestamptz not null default now(),
  position double precision not null default 0,
  notes text,
  search_text text not null default '',
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workspace_id, id),
  foreign key (workspace_id, pipeline_id)
    references public.pipelines (workspace_id, id),
  -- A deal's stage must belong to its pipeline, and a stage holding deals cannot be
  -- deleted (NO ACTION is checked at statement end, so workspace cascades still work).
  foreign key (pipeline_id, stage_id)
    references public.pipeline_stages (pipeline_id, id),
  foreign key (workspace_id, property_id)
    references public.properties (workspace_id, id) on delete set null (property_id),
  foreign key (workspace_id, primary_contact_id)
    references public.contacts (workspace_id, id) on delete set null (primary_contact_id)
);
create index deals_board_idx on public.deals (workspace_id, pipeline_id, stage_id, position) where deleted_at is null;
create index deals_stage_idx on public.deals (pipeline_id, stage_id);
create index deals_property_idx on public.deals (workspace_id, property_id);
create index deals_contact_idx on public.deals (workspace_id, primary_contact_id);
create index deals_assigned_idx on public.deals (assigned_to);
create index deals_search_idx on public.deals using gin (search_text extensions.gin_trgm_ops);

create table public.deal_contacts (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  deal_id uuid not null,
  contact_id uuid not null,
  role text check (role is null or char_length(role) <= 60),
  created_at timestamptz not null default now(),
  primary key (deal_id, contact_id),
  foreign key (workspace_id, deal_id) references public.deals (workspace_id, id) on delete cascade,
  foreign key (workspace_id, contact_id) references public.contacts (workspace_id, id) on delete cascade
);
create index deal_contacts_contact_idx on public.deal_contacts (workspace_id, contact_id);

create table public.deal_stage_history (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  deal_id uuid not null,
  from_stage_id uuid references public.pipeline_stages (id) on delete set null,
  to_stage_id uuid references public.pipeline_stages (id) on delete set null,
  from_stage_name text,
  to_stage_name text,
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now(),
  foreign key (workspace_id, deal_id) references public.deals (workspace_id, id) on delete cascade
);
create index deal_stage_history_deal_idx on public.deal_stage_history (deal_id, changed_at desc);
create index deal_stage_history_ws_idx on public.deal_stage_history (workspace_id, changed_at desc);

-- ---------------------------------------------------------------------------
-- Activities & tasks (polymorphic subject validated by trigger)
-- ---------------------------------------------------------------------------
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  type public.activity_type not null,
  subject_type public.subject_type not null,
  subject_id uuid not null,
  body text check (body is null or char_length(body) <= 20000),
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index activities_subject_idx on public.activities (workspace_id, subject_type, subject_id, occurred_at desc);
create index activities_ws_recent_idx on public.activities (workspace_id, occurred_at desc);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  notes text,
  due_at timestamptz,
  assigned_to uuid references public.profiles (id) on delete set null,
  status public.task_status not null default 'open',
  related_type public.subject_type,
  related_id uuid,
  completed_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_related_pair check ((related_type is null) = (related_id is null))
);
create index tasks_assignee_idx on public.tasks (workspace_id, assigned_to, status, due_at);
create index tasks_related_idx on public.tasks (workspace_id, related_type, related_id);

-- ---------------------------------------------------------------------------
-- Integrations (no secrets — tokens go to Supabase Vault in later phases)
-- ---------------------------------------------------------------------------
create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  provider text not null check (provider in (
    'gohighlevel', 'google', 'twilio', 'elevenlabs', 'resend', 'data_api', 'mapbox'
  )),
  status public.integration_status not null default 'not_connected',
  account_email extensions.citext,
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  connected_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider)
);
comment on table public.integrations is 'Connection state only. Never store tokens here — use Supabase Vault.';

-- ---------------------------------------------------------------------------
-- CSV imports
-- ---------------------------------------------------------------------------
create table public.imports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  entity text not null default 'contacts' check (entity in ('contacts')),
  filename text check (filename is null or char_length(filename) <= 255),
  status public.import_status not null default 'pending',
  dedupe_strategy text not null default 'skip' check (dedupe_strategy in ('skip', 'update')),
  mapping jsonb not null default '{}'::jsonb,
  total_rows integer not null default 0,
  created_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  error_count integer not null default 0,
  -- [{ row, message, data }]
  errors jsonb not null default '[]'::jsonb check (jsonb_typeof(errors) = 'array'),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index imports_ws_idx on public.imports (workspace_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Audit log (append-only)
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null default auth.uid(),
  action text not null check (char_length(action) <= 80),
  entity_type text not null check (char_length(entity_type) <= 40),
  entity_id uuid,
  diff jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_ws_idx on public.audit_log (workspace_id, created_at desc);
create index audit_log_entity_idx on public.audit_log (workspace_id, entity_type, entity_id);

-- updated_at triggers
create trigger companies_updated_at before update on public.companies for each row execute function app_private.set_updated_at();
create trigger contacts_updated_at before update on public.contacts for each row execute function app_private.set_updated_at();
create trigger properties_updated_at before update on public.properties for each row execute function app_private.set_updated_at();
create trigger pipelines_updated_at before update on public.pipelines for each row execute function app_private.set_updated_at();
create trigger pipeline_stages_updated_at before update on public.pipeline_stages for each row execute function app_private.set_updated_at();
create trigger deals_updated_at before update on public.deals for each row execute function app_private.set_updated_at();
create trigger activities_updated_at before update on public.activities for each row execute function app_private.set_updated_at();
create trigger tasks_updated_at before update on public.tasks for each row execute function app_private.set_updated_at();
create trigger integrations_updated_at before update on public.integrations for each row execute function app_private.set_updated_at();
create trigger imports_updated_at before update on public.imports for each row execute function app_private.set_updated_at();
