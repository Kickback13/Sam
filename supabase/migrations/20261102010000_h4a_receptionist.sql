-- =============================================================================
-- Housing4All Track (Phase 7A): AI receptionist — call routing, call log, CRM.
--
--   receptionist_settings  per workspace: on/off, ring time, hours, greetings
--   receptionist_routes    who handles what (Sam, Vianney, property management…):
--                          forward-to number, keywords, languages, follow-up owner
--   receptionist_tokens    the secret in the webhook URLs (only its SHA-256 is stored)
--   receptionist_calls     one row per call: outcome, transcript, summary, contact
--
--   public.receptionist_create_token(ws)         admin: new webhook token (shown once)
--   public.receptionist_config(token)            webhooks: settings + active routes
--   public.receptionist_record_call(token, call) webhooks: upsert a call → match or
--                                                create the CRM contact, log a `call`
--                                                activity, create the follow-up task
--
-- Phone providers (Twilio, ElevenLabs) post to /api/receptionist/... with the
-- token in the URL AND their own request signature (checked in the app). The
-- webhook functions run as anon and touch only the token's workspace.
-- Additive only.
-- =============================================================================

create table public.receptionist_settings (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  enabled boolean not null default false,
  -- Seconds to ring the first route before the AI answers (~5 s per ring; 15 ≈ 3 rings).
  ring_seconds smallint not null default 15 check (ring_seconds between 5 and 60),
  time_zone text not null default 'America/Los_Angeles' check (time_zone in (
    'America/Los_Angeles', 'America/Phoenix', 'America/Denver', 'America/Chicago',
    'America/New_York', 'America/Anchorage', 'Pacific/Honolulu'
  )),
  -- {"mon": [["09:00","18:00"]], "tue": [...], ...}; a missing day = closed.
  hours jsonb not null default '{}'::jsonb check (jsonb_typeof(hours) = 'object' and pg_column_size(hours) <= 4096),
  greeting_en text check (greeting_en is null or char_length(greeting_en) <= 1000),
  greeting_es text check (greeting_es is null or char_length(greeting_es) <= 1000),
  updated_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index receptionist_settings_updated_by_idx on public.receptionist_settings (updated_by);
create trigger receptionist_settings_updated_at before update on public.receptionist_settings
  for each row execute function app_private.set_updated_at();

create table public.receptionist_routes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text check (description is null or char_length(description) <= 500),
  -- E.164 number to ring for this route; null = the AI takes a message.
  forward_to text check (forward_to is null or forward_to ~ '^\+[1-9][0-9]{7,14}$'),
  keywords text[] not null default '{}' check (cardinality(keywords) <= 40),
  languages text[] not null default '{en,es}' check (languages <@ array['en', 'es']::text[] and cardinality(languages) >= 1),
  -- Who gets the follow-up task when a call on this route isn't picked up.
  assignee_user_id uuid references public.profiles (id) on delete set null,
  is_default boolean not null default false,
  active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);
create unique index receptionist_routes_one_default on public.receptionist_routes (workspace_id) where is_default;
create index receptionist_routes_ws_idx on public.receptionist_routes (workspace_id, position);
create index receptionist_routes_assignee_idx on public.receptionist_routes (assignee_user_id);
create trigger receptionist_routes_updated_at before update on public.receptionist_routes
  for each row execute function app_private.set_updated_at();

create table public.receptionist_tokens (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index receptionist_tokens_one_active on public.receptionist_tokens (workspace_id) where revoked_at is null;
create index receptionist_tokens_created_by_idx on public.receptionist_tokens (created_by);

create table public.receptionist_calls (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  provider text not null check (provider in ('twilio', 'elevenlabs')),
  provider_call_id text not null check (char_length(provider_call_id) between 1 and 200),
  from_number text check (from_number is null or char_length(from_number) <= 40),
  to_number text check (to_number is null or char_length(to_number) <= 40),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_secs integer check (duration_secs is null or duration_secs between 0 and 86400),
  language text check (language is null or language in ('en', 'es')),
  outcome text not null default 'in_progress' check (outcome in (
    'in_progress', 'answered', 'answered_by_ai', 'voicemail', 'missed'
  )),
  route_id uuid,
  route_name text check (route_name is null or char_length(route_name) <= 80),
  contact_id uuid,
  caller_name text check (caller_name is null or char_length(caller_name) <= 120),
  -- [{ "role": "agent"|"caller", "text": "...", "at_secs": 12 }]
  transcript jsonb not null default '[]'::jsonb
    check (jsonb_typeof(transcript) = 'array' and pg_column_size(transcript) <= 262144),
  summary text check (summary is null or char_length(summary) <= 5000),
  summary_source text check (summary_source is null or char_length(summary_source) <= 80),
  voicemail_url text check (voicemail_url is null or (char_length(voicemail_url) <= 2048 and voicemail_url ~* '^https://')),
  activity_id uuid,
  task_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider, provider_call_id),
  foreign key (workspace_id, route_id) references public.receptionist_routes (workspace_id, id) on delete set null (route_id),
  foreign key (workspace_id, contact_id) references public.contacts (workspace_id, id) on delete set null (contact_id)
);
comment on table public.receptionist_calls is
  'AI receptionist call log. Written only by the webhook function; staff read it.';
create index receptionist_calls_ws_idx on public.receptionist_calls (workspace_id, started_at desc);
create index receptionist_calls_contact_idx on public.receptionist_calls (workspace_id, contact_id);
create index receptionist_calls_route_idx on public.receptionist_calls (workspace_id, route_id);
create trigger receptionist_calls_updated_at before update on public.receptionist_calls
  for each row execute function app_private.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: members read; admins configure (settings/routes); calls and tokens are
-- written only through the SECURITY DEFINER functions below.
-- ---------------------------------------------------------------------------
alter table public.receptionist_settings enable row level security;
alter table public.receptionist_routes enable row level security;
alter table public.receptionist_tokens enable row level security;
alter table public.receptionist_calls enable row level security;

revoke all on public.receptionist_settings, public.receptionist_routes, public.receptionist_tokens,
  public.receptionist_calls from anon, authenticated;
grant select, insert, update on public.receptionist_settings to authenticated;
grant select, insert, update, delete on public.receptionist_routes to authenticated;
grant select on public.receptionist_tokens, public.receptionist_calls to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['receptionist_settings', 'receptionist_routes', 'receptionist_calls']
  loop
    execute format(
      'create policy "members read" on public.%I for select to authenticated
         using (workspace_id in (select app_private.member_workspace_ids()))', t);
  end loop;
end;
$$;
create policy "admins read" on public.receptionist_tokens for select to authenticated
  using (workspace_id in (select app_private.admin_workspace_ids()));

create policy "admins insert" on public.receptionist_settings for insert to authenticated
  with check (workspace_id in (select app_private.admin_workspace_ids()));
create policy "admins update" on public.receptionist_settings for update to authenticated
  using (workspace_id in (select app_private.admin_workspace_ids()))
  with check (workspace_id in (select app_private.admin_workspace_ids()));
create policy "admins insert" on public.receptionist_routes for insert to authenticated
  with check (workspace_id in (select app_private.admin_workspace_ids()));
create policy "admins update" on public.receptionist_routes for update to authenticated
  using (workspace_id in (select app_private.admin_workspace_ids()))
  with check (workspace_id in (select app_private.admin_workspace_ids()));
create policy "admins delete" on public.receptionist_routes for delete to authenticated
  using (workspace_id in (select app_private.admin_workspace_ids()));

-- ---------------------------------------------------------------------------
-- Webhook token
-- ---------------------------------------------------------------------------
create or replace function app_private.receptionist_token_workspace(p_token text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.workspace_id from public.receptionist_tokens t
  where t.revoked_at is null
    and t.token_hash = encode(extensions.digest(lower(btrim(coalesce(p_token, ''))), 'sha256'), 'hex');
$$;
revoke all on function app_private.receptionist_token_workspace(text) from public, anon, authenticated;

create or replace function public.receptionist_create_token(p_workspace_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  if p_workspace_id not in (select app_private.admin_workspace_ids()) then
    raise exception 'Only an owner or admin can manage the receptionist connection' using errcode = '42501';
  end if;
  update public.receptionist_tokens set revoked_at = now()
   where workspace_id = p_workspace_id and revoked_at is null;
  insert into public.receptionist_tokens (workspace_id, token_hash, created_by)
  values (p_workspace_id, encode(extensions.digest(token, 'sha256'), 'hex'), auth.uid());
  insert into public.audit_log (workspace_id, actor_id, action, entity_type, diff)
  values (p_workspace_id, auth.uid(), 'receptionist.token_created', 'receptionist', '{}'::jsonb);
  return token;
end;
$$;
revoke all on function public.receptionist_create_token(uuid) from public;
grant execute on function public.receptionist_create_token(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- What the voice webhook needs to answer a call.
-- ---------------------------------------------------------------------------
create or replace function public.receptionist_config(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ws uuid := app_private.receptionist_token_workspace(p_token);
  s public.receptionist_settings;
begin
  if ws is null then
    raise exception 'Unknown receptionist token' using errcode = '42501';
  end if;
  select * into s from public.receptionist_settings where workspace_id = ws;
  return jsonb_build_object(
    'workspace_name', (select w.name from public.workspaces w where w.id = ws),
    'enabled', coalesce(s.enabled, false),
    'ring_seconds', coalesce(s.ring_seconds, 15),
    'time_zone', coalesce(s.time_zone, 'America/Los_Angeles'),
    'hours', coalesce(s.hours, '{}'::jsonb),
    'greeting_en', s.greeting_en,
    'greeting_es', s.greeting_es,
    'routes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'name', r.name, 'forward_to', r.forward_to, 'keywords', to_jsonb(r.keywords),
               'languages', to_jsonb(r.languages), 'is_default', r.is_default)
             order by r.position, r.created_at)
      from public.receptionist_routes r where r.workspace_id = ws and r.active), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.receptionist_config(text) from public;
grant execute on function public.receptionist_config(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Record (insert or update) a call. Later events fill in what's known: Twilio
-- sends the outcome, ElevenLabs the transcript and summary. On the first event
-- with a caller number: match the contact by phone (or create one), log a
-- `call` activity, and — if nobody picked up — create the follow-up task.
-- ---------------------------------------------------------------------------
create or replace function public.receptionist_record_call(p_token text, p_call jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  ws uuid := app_private.receptionist_token_workspace(p_token);
  c public.receptionist_calls;
  v_provider text := p_call ->> 'provider';
  v_call_id text := left(p_call ->> 'provider_call_id', 200);
  v_from text := app_private.normalize_phone(p_call ->> 'from_number');
  v_outcome text := p_call ->> 'outcome';
  v_route uuid;
  v_route_name text;
  v_assignee uuid;
  v_contact uuid;
  v_name text;
  v_body text;
  v_existing boolean;
begin
  if ws is null then
    raise exception 'Unknown receptionist token' using errcode = '42501';
  end if;
  if v_provider not in ('twilio', 'elevenlabs') or coalesce(v_call_id, '') = '' then
    raise exception 'provider and provider_call_id are required' using errcode = '22023';
  end if;
  if v_outcome is not null and v_outcome not in ('in_progress', 'answered', 'answered_by_ai', 'voicemail', 'missed') then
    raise exception 'Unknown outcome %', v_outcome using errcode = '22023';
  end if;

  -- Route: by id (must belong to this workspace) or by name.
  if p_call ? 'route_id' and p_call ->> 'route_id' ~ '^[0-9a-f-]{36}$' then
    select r.id, r.name, r.assignee_user_id into v_route, v_route_name, v_assignee
      from public.receptionist_routes r where r.workspace_id = ws and r.id = (p_call ->> 'route_id')::uuid;
  end if;

  select * into c from public.receptionist_calls
   where workspace_id = ws and provider = v_provider and provider_call_id = v_call_id for update;
  v_existing := found;

  if not v_existing then
    insert into public.receptionist_calls (workspace_id, provider, provider_call_id, from_number, to_number, started_at)
    values (ws, v_provider, v_call_id, coalesce(v_from, left(p_call ->> 'from_number', 40)),
            left(p_call ->> 'to_number', 40),
            coalesce(nullif(p_call ->> 'started_at', '')::timestamptz, now()))
    returning * into c;
  end if;

  update public.receptionist_calls set
    from_number = coalesce(from_number, v_from, left(p_call ->> 'from_number', 40)),
    to_number = coalesce(to_number, left(p_call ->> 'to_number', 40)),
    ended_at = coalesce(nullif(p_call ->> 'ended_at', '')::timestamptz, ended_at),
    duration_secs = coalesce(nullif(p_call ->> 'duration_secs', '')::integer, duration_secs),
    language = coalesce(case when p_call ->> 'language' in ('en', 'es') then p_call ->> 'language' end, language),
    -- An outcome only moves forward (a late "missed" never overwrites "answered").
    outcome = case
      when v_outcome is null then outcome
      when outcome in ('answered', 'answered_by_ai') and v_outcome in ('missed', 'voicemail', 'in_progress') then outcome
      when outcome = 'voicemail' and v_outcome in ('missed', 'in_progress') then outcome
      else v_outcome end,
    route_id = coalesce(v_route, route_id),
    route_name = coalesce(v_route_name, route_name),
    caller_name = coalesce(nullif(left(btrim(p_call ->> 'caller_name'), 120), ''), caller_name),
    transcript = case when jsonb_typeof(p_call -> 'transcript') = 'array'
                       and jsonb_array_length(p_call -> 'transcript') > 0 then p_call -> 'transcript'
                      else transcript end,
    summary = coalesce(nullif(left(p_call ->> 'summary', 5000), ''), summary),
    summary_source = coalesce(nullif(left(p_call ->> 'summary_source', 80), ''), summary_source),
    voicemail_url = coalesce(case when p_call ->> 'voicemail_url' ~* '^https://' then left(p_call ->> 'voicemail_url', 2048) end, voicemail_url)
  where id = c.id
  returning * into c;

  -- Contact: match by phone, or create one so the call isn't lost.
  if c.contact_id is null and c.from_number is not null and c.from_number ~ '^\+?[0-9]{7,15}$' then
    select ct.id into v_contact from public.contacts ct
     where ct.workspace_id = ws and ct.deleted_at is null and c.from_number = any (ct.phone_keys)
     order by ct.created_at limit 1;
    if v_contact is null then
      v_name := coalesce(c.caller_name, 'Caller');
      insert into public.contacts (workspace_id, first_name, last_name, phones, tags, source, created_by)
      values (ws, left(split_part(v_name, ' ', 1), 100),
              nullif(left(btrim(substr(v_name, char_length(split_part(v_name, ' ', 1)) + 1)), 100), ''),
              jsonb_build_array(jsonb_build_object('value', c.from_number, 'label', 'phone', 'type', 'unknown', 'is_primary', true)),
              array['receptionist'], 'AI receptionist', null)
      returning id into v_contact;
    end if;
    update public.receptionist_calls set contact_id = v_contact where id = c.id returning * into c;
  end if;

  -- Timeline: one `call` activity per call, kept up to date as details arrive.
  if c.contact_id is not null then
    v_body := 'Phone call (' || case c.outcome
                when 'answered' then 'answered'
                when 'answered_by_ai' then 'answered by the AI receptionist'
                when 'voicemail' then 'voicemail'
                when 'missed' then 'missed'
                else 'in progress' end || ')'
              || coalesce(' · ' || c.route_name, '')
              || coalesce(E'\n' || c.summary, '');
    if c.activity_id is null then
      insert into public.activities (workspace_id, type, subject_type, subject_id, body, occurred_at, metadata, created_by)
      values (ws, 'call', 'contact', c.contact_id, left(v_body, 20000), c.started_at,
              jsonb_build_object('kind', 'receptionist', 'call_id', c.id, 'provider', c.provider), null)
      returning id into c.activity_id;
      update public.receptionist_calls set activity_id = c.activity_id where id = c.id;
    else
      update public.activities set body = left(v_body, 20000) where id = c.activity_id and workspace_id = ws;
    end if;
  end if;

  -- Follow-up task when nobody picked up (missed / voicemail / AI took a message).
  if c.task_id is null and c.contact_id is not null and c.outcome in ('missed', 'voicemail', 'answered_by_ai') then
    if v_assignee is null and c.route_id is not null then
      select r.assignee_user_id into v_assignee from public.receptionist_routes r where r.id = c.route_id;
    end if;
    if v_assignee is null then
      select r.assignee_user_id into v_assignee from public.receptionist_routes r
       where r.workspace_id = ws and r.is_default and r.active;
    end if;
    -- Only assign to someone who is still a member of this workspace.
    if v_assignee is not null and not exists (
      select 1 from public.workspace_members m where m.workspace_id = ws and m.user_id = v_assignee) then
      v_assignee := null;
    end if;
    insert into public.tasks (workspace_id, title, notes, due_at, assigned_to, related_type, related_id, created_by)
    values (ws,
            left('Call back ' || coalesce(c.caller_name, c.from_number, 'caller') || ' (' ||
                 case c.outcome when 'missed' then 'missed call' when 'voicemail' then 'voicemail'
                      else 'AI receptionist' end || ')', 300),
            c.summary, now() + interval '4 hours', v_assignee, 'contact', c.contact_id, null)
    returning id into c.task_id;
    update public.receptionist_calls set task_id = c.task_id where id = c.id;
  end if;

  return c.id;
end;
$$;
revoke all on function public.receptionist_record_call(text, jsonb) from public;
grant execute on function public.receptionist_record_call(text, jsonb) to anon, authenticated;
