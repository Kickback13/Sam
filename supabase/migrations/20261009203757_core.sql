-- =============================================================================
-- Core: extensions, enums, tenancy (workspaces, profiles, members, invites)
-- and the RLS helper functions every policy uses.
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;
create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- Helper schema: NOT exposed through the Data API (only public is).
create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.business_type as enum ('real_estate', 'construction');
create type public.member_role as enum ('owner', 'admin', 'agent', 'viewer');
create type public.pipeline_kind as enum ('acquisition', 'disposition', 'construction_project');
create type public.deal_status as enum ('open', 'won', 'lost');
create type public.activity_type as enum ('note', 'call', 'email', 'sms', 'meeting', 'stage_change', 'system');
create type public.subject_type as enum ('contact', 'company', 'property', 'deal');
create type public.task_status as enum ('open', 'done', 'canceled');
create type public.integration_status as enum ('not_connected', 'connected', 'error');
create type public.import_status as enum ('pending', 'processing', 'completed', 'failed');
create type public.sms_consent as enum ('none', 'express', 'written');

-- ---------------------------------------------------------------------------
-- Shared trigger: updated_at
-- ---------------------------------------------------------------------------
create or replace function app_private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Workspaces
-- ---------------------------------------------------------------------------
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  business_type public.business_type not null,
  brand jsonb not null default '{}'::jsonb check (jsonb_typeof(brand) = 'object'),
  profile jsonb not null default '{}'::jsonb check (jsonb_typeof(profile) = 'object'),
  is_demo boolean not null default false,
  owner_email extensions.citext,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.workspaces is 'Tenant boundary. One per business (Housing4All, AZH Builders) plus the Demo workspace.';
comment on column public.workspaces.brand is 'Brand tokens applied as CSS variables (validated in app by brandSchema).';
comment on column public.workspaces.is_demo is 'Only demo workspaces may contain sample data.';

create trigger workspaces_updated_at before update on public.workspaces
  for each row execute function app_private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email extensions.citext,
  full_name text check (full_name is null or char_length(full_name) <= 120),
  phone text check (phone is null or char_length(phone) <= 40),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 2048),
  last_workspace_id uuid references public.workspaces (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function app_private.set_updated_at();

create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app_private.handle_new_user();

create or replace function app_private.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function app_private.handle_user_email_change();

-- ---------------------------------------------------------------------------
-- Workspace members
-- ---------------------------------------------------------------------------
create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null default 'agent',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id, workspace_id);

create trigger workspace_members_updated_at before update on public.workspace_members
  for each row execute function app_private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Invites (email-bound, or single-use link when email is null)
-- ---------------------------------------------------------------------------
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email extensions.citext check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role public.member_role not null default 'agent',
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  invited_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index invites_workspace_idx on public.invites (workspace_id, created_at desc);
create index invites_email_idx on public.invites (email) where accepted_at is null and revoked_at is null;

-- ---------------------------------------------------------------------------
-- RLS helper functions (SECURITY DEFINER, fixed search_path, not exposed)
-- Return sets so policies can use `workspace_id in (select ...)`, which
-- Postgres evaluates once per statement instead of once per row.
-- ---------------------------------------------------------------------------
create or replace function app_private.member_workspace_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.workspace_id from public.workspace_members m where m.user_id = (select auth.uid());
$$;

create or replace function app_private.writer_workspace_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.workspace_id from public.workspace_members m
  where m.user_id = (select auth.uid()) and m.role in ('owner', 'admin', 'agent');
$$;

create or replace function app_private.admin_workspace_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.workspace_id from public.workspace_members m
  where m.user_id = (select auth.uid()) and m.role in ('owner', 'admin');
$$;

create or replace function app_private.owner_workspace_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.workspace_id from public.workspace_members m
  where m.user_id = (select auth.uid()) and m.role = 'owner';
$$;

create or replace function app_private.coworker_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct other.user_id
  from public.workspace_members mine
  join public.workspace_members other on other.workspace_id = mine.workspace_id
  where mine.user_id = (select auth.uid());
$$;

revoke all on function app_private.member_workspace_ids() from public, anon;
revoke all on function app_private.writer_workspace_ids() from public, anon;
revoke all on function app_private.admin_workspace_ids() from public, anon;
revoke all on function app_private.owner_workspace_ids() from public, anon;
revoke all on function app_private.coworker_ids() from public, anon;
grant execute on function app_private.member_workspace_ids() to authenticated;
grant execute on function app_private.writer_workspace_ids() to authenticated;
grant execute on function app_private.admin_workspace_ids() to authenticated;
grant execute on function app_private.owner_workspace_ids() to authenticated;
grant execute on function app_private.coworker_ids() to authenticated;
