-- =============================================================================
-- AZH follow-up A1: lock down public photo uploads (AZH-013).
--
-- Before: anon could INSERT any object named <workspace>/<uuid>/<n>.<ext> into
-- the azh-intake bucket. Now:
--   1. The browser asks our server route (/r/<slug>/upload) for upload slots.
--   2. The route calls azh_issue_upload_tickets() (SECURITY DEFINER), which
--      validates slug, file types and sizes and applies the same per-IP,
--      per-phone and per-workspace limits as form submits, then records one
--      ticket per photo (15-minute expiry).
--   3. The route returns signed upload URLs for exactly those paths.
--   4. Storage only accepts an object whose name matches a live ticket — the
--      broad anon INSERT policy is removed. Upsert is off, so a ticket path can
--      be written once.
--   5. The intake trigger only accepts photos whose ticket was issued in the
--      same workspace for the same phone number.
-- =============================================================================

create table public.azh_upload_tickets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  path text not null unique check (char_length(path) <= 200),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif')),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  client_key text check (client_key is null or client_key ~ '^[0-9a-f]{16,64}$'),
  phone_key text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  constraint azh_upload_tickets_path_in_workspace check (path like workspace_id::text || '/%')
);
comment on table public.azh_upload_tickets is 'One row per photo upload slot issued to the public request form (AZH-013).';
create index azh_upload_tickets_ws_idx on public.azh_upload_tickets (workspace_id, created_at desc);
create index azh_upload_tickets_client_idx on public.azh_upload_tickets (client_key, created_at desc);
create index azh_upload_tickets_phone_idx on public.azh_upload_tickets (phone_key, created_at desc);

alter table public.azh_upload_tickets enable row level security;
revoke all on public.azh_upload_tickets from anon, authenticated;
grant select on public.azh_upload_tickets to authenticated;
create policy "admins read" on public.azh_upload_tickets for select to authenticated
  using (workspace_id in (select app_private.admin_workspace_ids()));

-- Issue upload slots for the public form. Returns one object path per file.
-- p_files: [{ "type": "image/jpeg", "size": 12345 }, …] (1–5 items).
create or replace function public.azh_issue_upload_tickets(
  p_slug text,
  p_files jsonb,
  p_phone text,
  p_client_key text default null
)
returns table (path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws uuid;
  v_phone text;
  batch uuid := gen_random_uuid();
  f record;
  ext text;
  n integer;
begin
  ws := app_private.azh_intake_workspace(p_slug);
  if ws is null then
    raise exception 'This request form is not available' using errcode = 'PT404';
  end if;

  v_phone := app_private.normalize_phone(p_phone);
  if v_phone is null or v_phone !~ '^\+1[2-9][0-9]{9}$' then
    raise exception 'Enter a valid US phone number before adding photos' using errcode = '22023';
  end if;
  if p_client_key is not null and p_client_key !~ '^[0-9a-f]{16,64}$' then
    raise exception 'Invalid request' using errcode = '22023';
  end if;
  if jsonb_typeof(p_files) <> 'array' or jsonb_array_length(p_files) not between 1 and 5 then
    raise exception 'Attach between 1 and 5 photos' using errcode = '22023';
  end if;

  -- Same limits as form submits (AZH-005), counting photos at 5 per submit.
  if p_client_key is not null and (
       (select count(*) from public.azh_intake where client_key = p_client_key and created_at > now() - interval '1 hour') >= 5
       or (select count(*) from public.azh_upload_tickets where client_key = p_client_key and created_at > now() - interval '1 hour') + jsonb_array_length(p_files) > 25
     ) then
    raise exception 'Too many requests. Please try again later or call us.' using errcode = 'PT429';
  end if;
  if (select count(*) from public.azh_intake where workspace_id = ws and created_at > now() - interval '1 hour'
        and app_private.normalize_phone(phone) = v_phone) >= 3
     or (select count(*) from public.azh_upload_tickets where workspace_id = ws and phone_key = v_phone
           and created_at > now() - interval '1 hour') + jsonb_array_length(p_files) > 15 then
    raise exception 'Too many requests from this phone number. We will call you soon.' using errcode = 'PT429';
  end if;
  if (select count(*) from public.azh_intake where workspace_id = ws and created_at > now() - interval '10 minutes') >= 60
     or (select count(*) from public.azh_upload_tickets where workspace_id = ws and created_at > now() - interval '10 minutes') + jsonb_array_length(p_files) > 300 then
    raise exception 'Too many requests. Please try again later or call us.' using errcode = 'PT429';
  end if;

  n := 0;
  for f in select value as v from jsonb_array_elements(p_files) loop
    ext := case f.v ->> 'type'
      when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp'
      when 'image/heic' then 'heic' when 'image/heif' then 'heif' end;
    if ext is null then
      raise exception 'Only JPG, PNG, WebP or HEIC photos' using errcode = '22023';
    end if;
    if (f.v ->> 'size') !~ '^[0-9]{1,9}$' or (f.v ->> 'size')::integer not between 1 and 10485760 then
      raise exception 'Each photo must be 10 MB or smaller' using errcode = '22023';
    end if;
    insert into public.azh_upload_tickets (workspace_id, path, mime_type, size_bytes, client_key, phone_key)
    values (ws, ws::text || '/' || batch::text || '/' || n || '.' || ext, f.v ->> 'type', (f.v ->> 'size')::integer, p_client_key, v_phone);
    path := ws::text || '/' || batch::text || '/' || n || '.' || ext;
    n := n + 1;
    return next;
  end loop;
end;
$$;
revoke all on function public.azh_issue_upload_tickets(text, jsonb, text, text) from public;
grant execute on function public.azh_issue_upload_tickets(text, jsonb, text, text) to anon, authenticated;

-- Storage: only live ticket paths may be written (replaces the broad anon insert).
create or replace function app_private.azh_upload_ticket_valid(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.azh_upload_tickets t
    where t.path = p_name and t.expires_at > now()
  );
$$;
revoke all on function app_private.azh_upload_ticket_valid(text) from public;
grant execute on function app_private.azh_upload_ticket_valid(text) to anon, authenticated;

drop policy if exists "azh intake: public uploads photos" on storage.objects;

create policy "azh intake: ticketed uploads only" on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'azh-intake'
    and app_private.azh_upload_ticket_valid(name)
  );

-- A photo path was ticketed for this workspace and phone number.
create or replace function app_private.azh_photo_ticketed(p_path text, p_workspace_id uuid, p_phone_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.azh_upload_tickets t
    where t.path = p_path and t.workspace_id = p_workspace_id and t.phone_key = p_phone_key
  );
$$;
revoke all on function app_private.azh_photo_ticketed(text, uuid, text) from public, anon, authenticated;

-- Intake trigger: photos must come from a ticket for this workspace + phone.
CREATE OR REPLACE FUNCTION app_private.azh_intake_process()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  ws uuid;
  office text;
  phone_key text;
  email_key text;
  first_name text;
  last_name text;
  contact uuid;
  pipe uuid;
  stage uuid;
  top_position double precision;
  deal uuid;
  req uuid;
  assignee uuid;
  settings public.azh_settings;
  path text;
  consent_source text;
  clean_email text;
begin
  -- Never trust caller-supplied processing fields.
  new.id := gen_random_uuid();
  new.created_at := now();
  new.request_id := null;
  new.processed_at := null;

  ws := app_private.azh_intake_workspace(new.workspace_slug);
  if ws is null then
    raise exception 'This request form is not available' using errcode = 'PT404';
  end if;
  new.workspace_id := ws;
  select * into settings from public.azh_settings where workspace_id = ws;

  -- Rate limits (AZH-005): per client, per phone, and per workspace.
  if new.client_key is not null and (
    select count(*) from public.azh_intake
    where client_key = new.client_key and created_at > now() - interval '1 hour'
  ) >= 5 then
    raise exception 'Too many requests. Please try again later or call us.' using errcode = 'PT429';
  end if;
  if (
    select count(*) from public.azh_intake
    where workspace_id = ws and created_at > now() - interval '10 minutes'
  ) >= 60 then
    raise exception 'Too many requests. Please try again later or call us.' using errcode = 'PT429';
  end if;

  -- Validation (the server action validates too; this is the authority).
  new.name := btrim(new.name);
  new.job_address := btrim(new.job_address);
  new.description := btrim(new.description);
  phone_key := app_private.normalize_phone(new.phone);
  if phone_key is null or phone_key !~ '^\+1[2-9][0-9]{9}$' then
    raise exception 'Enter a valid US phone number' using errcode = '22023';
  end if;
  clean_email := nullif(btrim(coalesce(new.email, '')), '');
  if clean_email is not null then
    email_key := app_private.normalize_email(clean_email);
    if email_key is null then
      raise exception 'Enter a valid email address' using errcode = '22023';
    end if;
  end if;
  new.email := clean_email;
  if char_length(new.name) = 0 or char_length(new.description) = 0 then
    raise exception 'Name and description are required' using errcode = '22023';
  end if;
  if not (new.service_type = any (settings.service_types)) then
    raise exception 'Choose a service from the list' using errcode = '22023';
  end if;
  if (
    select count(*) from public.azh_intake
    where workspace_id = ws and created_at > now() - interval '1 hour'
      and app_private.normalize_phone(phone) = phone_key
  ) >= 3 then
    raise exception 'We already received several requests from this phone number. We will call you soon.' using errcode = 'PT429';
  end if;
  foreach path in array new.photo_paths loop
    if path !~ ('^' || ws::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-4]\.(jpg|jpeg|png|webp|heic|heif)$')
       or not exists (select 1 from storage.objects o where o.bucket_id = 'azh-intake' and o.name = path)
       or exists (select 1 from public.azh_requests r where path = any (r.photo_paths))
       or not app_private.azh_photo_ticketed(path, ws, phone_key) then
      raise exception 'A photo upload is missing or invalid. Please re-attach your photos.' using errcode = '22023';
    end if;
  end loop;

  office := app_private.azh_route_office(ws, new.job_zip);
  first_name := split_part(new.name, ' ', 1);
  last_name := nullif(btrim(substring(new.name from char_length(first_name) + 1)), '');
  consent_source := 'AZH web request form (/r/' || new.workspace_slug || ')';

  -- 1. Match or create the contact.
  select c.id into contact
  from public.contacts c
  where c.workspace_id = ws and c.deleted_at is null
    and (c.phone_keys @> array[phone_key] or (email_key is not null and c.email_keys @> array[email_key]))
  order by (c.phone_keys @> array[phone_key]) desc, c.created_at
  limit 1;

  if contact is null then
    insert into public.contacts (
      workspace_id, first_name, last_name, roles, emails, phones, address, zip, source, tags, language,
      sms_consent, sms_consent_at, sms_consent_source, created_by
    )
    values (
      ws, left(first_name, 100), left(last_name, 100), array['homeowner'],
      case when clean_email is null then '[]'::jsonb
           else jsonb_build_array(jsonb_build_object('value', clean_email, 'label', 'personal', 'is_primary', true)) end,
      jsonb_build_array(jsonb_build_object('value', new.phone, 'label', 'mobile', 'type', 'unknown', 'is_primary', true)),
      new.job_address, new.job_zip, 'AZH request form', array['azh-request'], new.language,
      case when new.sms_consent then 'express'::public.sms_consent else 'none'::public.sms_consent end,
      case when new.sms_consent then now() end,
      case when new.sms_consent then consent_source end,
      null
    )
    returning id into contact;
  else
    update public.contacts c
    set roles = case when 'homeowner' = any (c.roles) then c.roles else c.roles || array['homeowner'] end,
        tags = case when 'azh-request' = any (c.tags) then c.tags else c.tags || array['azh-request'] end,
        phones = case when c.phone_keys @> array[phone_key] then c.phones
                      else c.phones || jsonb_build_array(jsonb_build_object('value', new.phone, 'label', 'mobile', 'type', 'unknown', 'is_primary', false)) end,
        emails = case when email_key is null or c.email_keys @> array[email_key] then c.emails
                      else c.emails || jsonb_build_array(jsonb_build_object('value', clean_email, 'label', 'personal', 'is_primary', false)) end,
        address = coalesce(c.address, new.job_address),
        zip = coalesce(c.zip, new.job_zip),
        -- Consent only ever upgrades from none; an existing level is kept as is.
        sms_consent = case when new.sms_consent and c.sms_consent = 'none' then 'express'::public.sms_consent else c.sms_consent end,
        sms_consent_at = case when new.sms_consent and c.sms_consent = 'none' then now() else c.sms_consent_at end,
        sms_consent_source = case when new.sms_consent and c.sms_consent = 'none' then consent_source else c.sms_consent_source end
    where c.id = contact;
  end if;

  -- 3. Lead deal + project row (at the top of the first open stage).
  select p.id into pipe
  from public.pipelines p
  where p.workspace_id = ws and p.kind = 'construction_project'
  order by p.is_default desc, p.position, p.created_at
  limit 1;
  if pipe is null then
    raise exception 'This request form is not available' using errcode = 'PT404';
  end if;
  select s.id into stage
  from public.pipeline_stages s
  where s.pipeline_id = pipe and not s.is_won and not s.is_lost
  order by s.position
  limit 1;
  select coalesce(min(d.position), 1) - 1 into top_position
  from public.deals d where d.stage_id = stage and d.deleted_at is null;

  insert into public.deals (workspace_id, pipeline_id, stage_id, title, primary_contact_id, source, position, notes, created_by)
  values (
    ws, pipe, stage,
    left(new.service_type || ' — ' || new.name || ', ' || new.job_address, 200),
    contact, 'Web request form', top_position, new.description, null
  )
  returning id into deal;

  insert into public.azh_projects (deal_id, workspace_id, job_address, job_zip, service_types, office, source, created_by)
  values (deal, ws, new.job_address, new.job_zip, array[new.service_type], office, 'Web request form', null);

  -- 2. The service request.
  insert into public.azh_requests (
    workspace_id, contact_id, deal_id, status, office, service_type, description, job_address, job_zip,
    preferred_contact_time, language, photo_paths, sms_consent, sms_consent_at, sms_consent_text, source,
    assigned_to, created_by
  )
  values (
    ws, contact, deal, 'new', office, new.service_type, new.description, new.job_address, new.job_zip,
    new.preferred_contact_time, new.language, new.photo_paths, new.sms_consent,
    case when new.sms_consent then now() end, case when new.sms_consent then new.consent_text end,
    'web_form', null, null
  )
  returning id into req;

  -- 4. Task for the routed office.
  assignee := case office when 'fallbrook' then settings.fallbrook_assignee else settings.san_diego_assignee end;
  insert into public.tasks (workspace_id, title, notes, due_at, assigned_to, related_type, related_id, created_by)
  values (
    ws,
    left('Call new homeowner request: ' || new.name || ' (' || case office when 'fallbrook' then 'Fallbrook' else 'San Diego' end || ' office)', 300),
    new.service_type || ' at ' || new.job_address || ' ' || new.job_zip
      || E'\nPreferred contact time: ' || new.preferred_contact_time
      || E'\nSMS consent: ' || case when new.sms_consent then 'yes' else 'no — call or email only' end,
    now() + interval '1 day', assignee, 'deal', deal, null
  );

  -- 5. Activities on the deal and the contact.
  insert into public.activities (workspace_id, type, subject_type, subject_id, body, metadata, created_by)
  values
    (ws, 'system', 'deal', deal,
     'Homeowner request received from the web form — routed to the ' || case office when 'fallbrook' then 'Fallbrook' else 'San Diego' end || ' office',
     jsonb_build_object('event', 'azh_request_received', 'request_id', req, 'office', office, 'photos', cardinality(new.photo_paths)),
     null),
    (ws, 'system', 'contact', contact,
     'Submitted a ' || new.service_type || ' request on the web form',
     jsonb_build_object('event', 'azh_request_received', 'request_id', req, 'deal_id', deal, 'sms_consent', new.sms_consent),
     null);

  new.request_id := req;
  new.processed_at := now();
  return new;
end;
$function$;
