-- =============================================================================
-- AZH Track: homeowner service requests + the public intake path (AZH-005).
--
--   Browser (no login) ── uploads photos ──▶ storage bucket "azh-intake"
--                                            (anon: INSERT only, random path)
--   Next server action ── INSERT ──────────▶ public.azh_intake
--                                            (anon: INSERT only, no SELECT)
--   BEFORE INSERT trigger (SECURITY DEFINER) validates, rate-limits, then:
--     1. matches or creates the contact (dedupe on email/phone, role homeowner)
--     2. creates the service request
--     3. creates a Lead deal + azh_projects row
--     4. creates a task for the routed office
--     5. logs activities
--   Nothing is sent to the homeowner (no automatic replies).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Service requests (staff-facing; members read, writers write)
-- ---------------------------------------------------------------------------
create table public.azh_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  contact_id uuid,
  deal_id uuid,
  status text not null default 'new'
    check (status in ('new', 'contacted', 'estimate_scheduled', 'converted', 'closed')),
  office text not null default 'san_diego' check (app_private.azh_is_office(office)),
  service_type text check (service_type is null or char_length(service_type) <= 60),
  description text check (description is null or char_length(description) <= 5000),
  job_address text check (job_address is null or char_length(job_address) <= 300),
  job_zip text check (job_zip is null or job_zip ~ '^[0-9]{5}$'),
  preferred_contact_time text
    check (preferred_contact_time is null or preferred_contact_time in ('morning', 'afternoon', 'evening', 'any')),
  language text not null default 'en' check (language in ('en', 'es')),
  photo_paths text[] not null default '{}' check (cardinality(photo_paths) <= 5),
  sms_consent boolean not null default false,
  sms_consent_at timestamptz,
  sms_consent_text text check (sms_consent_text is null or char_length(sms_consent_text) <= 2000),
  source text not null default 'web_form' check (char_length(source) <= 60),
  assigned_to uuid references public.profiles (id) on delete set null,
  submitted_at timestamptz not null default now(),
  contacted_at timestamptz,
  converted_at timestamptz,
  closed_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, contact_id) references public.contacts (workspace_id, id) on delete set null (contact_id),
  foreign key (workspace_id, deal_id) references public.deals (workspace_id, id) on delete set null (deal_id),
  constraint azh_requests_consent_evidence check (not sms_consent or (sms_consent_at is not null and sms_consent_text is not null))
);
comment on table public.azh_requests is 'Homeowner service requests (public form or entered by staff).';
comment on column public.azh_requests.photo_paths is 'Object names in the azh-intake storage bucket.';
create index azh_requests_ws_idx on public.azh_requests (workspace_id, submitted_at desc);
create index azh_requests_status_idx on public.azh_requests (workspace_id, status, office);
create index azh_requests_contact_idx on public.azh_requests (workspace_id, contact_id);
create index azh_requests_deal_idx on public.azh_requests (workspace_id, deal_id);
create index azh_requests_assigned_idx on public.azh_requests (assigned_to);
create index azh_requests_created_by_idx on public.azh_requests (created_by);

create trigger azh_requests_updated_at before update on public.azh_requests
  for each row execute function app_private.set_updated_at();

create or replace function app_private.azh_requests_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    if new.status = 'contacted' then new.contacted_at := coalesce(new.contacted_at, now()); end if;
    if new.status = 'converted' then new.converted_at := coalesce(new.converted_at, now()); end if;
    if new.status = 'closed' then new.closed_at := coalesce(new.closed_at, now()); end if;
  end if;
  return new;
end;
$$;

create trigger azh_requests_before_write
  before insert or update on public.azh_requests
  for each row execute function app_private.azh_requests_before_write();

-- ---------------------------------------------------------------------------
-- Public intake table: anon may INSERT only. No SELECT/UPDATE/DELETE for anyone
-- through the API (no policies besides the insert one).
-- ---------------------------------------------------------------------------
create table public.azh_intake (
  id uuid primary key default gen_random_uuid(),
  workspace_slug text not null check (char_length(workspace_slug) <= 60),
  workspace_id uuid references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  phone text not null check (char_length(phone) between 7 and 40),
  email text check (email is null or char_length(email) <= 254),
  job_address text not null check (char_length(job_address) between 3 and 300),
  job_zip text not null check (job_zip ~ '^[0-9]{5}$'),
  service_type text not null check (char_length(service_type) between 1 and 60),
  description text not null check (char_length(description) between 1 and 5000),
  preferred_contact_time text not null default 'any'
    check (preferred_contact_time in ('morning', 'afternoon', 'evening', 'any')),
  language text not null default 'en' check (language in ('en', 'es')),
  photo_paths text[] not null default '{}' check (cardinality(photo_paths) <= 5),
  sms_consent boolean not null default false,
  consent_text text check (consent_text is null or char_length(consent_text) <= 2000),
  page_url text check (page_url is null or char_length(page_url) <= 500),
  client_key text check (client_key is null or client_key ~ '^[0-9a-f]{16,64}$'),
  request_id uuid,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint azh_intake_consent_text check (not sms_consent or consent_text is not null)
);
comment on table public.azh_intake is 'Write-only inbox for the public request form. Rows are processed by a SECURITY DEFINER trigger.';
comment on column public.azh_intake.client_key is 'SHA-256 of the submitter IP (salted per day) for rate limiting; never the raw IP.';
create index azh_intake_ws_created_idx on public.azh_intake (workspace_id, created_at desc);
create index azh_intake_client_idx on public.azh_intake (client_key, created_at desc);

-- Is the public form open for this workspace? (used by intake + storage policies)
create or replace function app_private.azh_intake_workspace(p_slug text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select w.id
  from public.workspaces w
  join public.azh_settings s on s.workspace_id = w.id
  where w.slug = p_slug and w.business_type = 'construction' and s.intake_enabled;
$$;

create or replace function app_private.azh_intake_open(p_workspace_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspaces w
    join public.azh_settings s on s.workspace_id = w.id
    where w.id::text = p_workspace_id and w.business_type = 'construction' and s.intake_enabled
  );
$$;
revoke all on function app_private.azh_intake_workspace(text) from public;
revoke all on function app_private.azh_intake_open(text) from public;
grant usage on schema app_private to anon;
grant execute on function app_private.azh_intake_open(text) to anon, authenticated;

-- What the public form needs to render (no login): only for open construction
-- workspaces, and only display data (name, brand tokens, service list, id for the
-- photo upload path).
create or replace function public.azh_public_form(p_slug text)
returns table (workspace_id uuid, name text, brand jsonb, service_types text[])
language sql
stable
security definer
set search_path = ''
as $$
  select w.id, w.name, w.brand, s.service_types
  from public.workspaces w
  join public.azh_settings s on s.workspace_id = w.id
  where w.slug = p_slug and w.business_type = 'construction' and s.intake_enabled;
$$;
revoke all on function public.azh_public_form(text) from public;
grant execute on function public.azh_public_form(text) to anon, authenticated;

create or replace function app_private.azh_intake_process()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
       or exists (select 1 from public.azh_requests r where path = any (r.photo_paths)) then
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
$$;
revoke all on function app_private.azh_intake_process() from public, anon, authenticated;

create trigger azh_intake_process
  before insert on public.azh_intake
  for each row execute function app_private.azh_intake_process();

-- ---------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------
alter table public.azh_requests enable row level security;
alter table public.azh_intake enable row level security;

revoke all on public.azh_requests from anon;
grant select, insert, update, delete on public.azh_requests to authenticated;

revoke all on public.azh_intake from anon, authenticated;
grant insert (
  workspace_slug, name, phone, email, job_address, job_zip, service_type, description,
  preferred_contact_time, language, photo_paths, sms_consent, consent_text, page_url, client_key
) on public.azh_intake to anon, authenticated;

create policy "public submits requests" on public.azh_intake
  for insert to anon, authenticated
  with check (true);

create policy "members read" on public.azh_requests for select to authenticated
  using (workspace_id in (select app_private.member_workspace_ids()));
create policy "writers insert" on public.azh_requests for insert to authenticated
  with check (workspace_id in (select app_private.writer_workspace_ids()));
create policy "writers update" on public.azh_requests for update to authenticated
  using (workspace_id in (select app_private.writer_workspace_ids()))
  with check (workspace_id in (select app_private.writer_workspace_ids()));
create policy "writers delete" on public.azh_requests for delete to authenticated
  using (workspace_id in (select app_private.writer_workspace_ids()));

-- ---------------------------------------------------------------------------
-- Storage: intake photos. anon may only upload (no read/list/overwrite), into
-- <workspace_id>/<random uuid>/<0-4>.<ext> for a workspace with the form open.
-- Members of that workspace may read and delete.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'azh-intake', 'azh-intake', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do nothing;

create policy "azh intake: public uploads photos" on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'azh-intake'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-4]\.(jpg|jpeg|png|webp|heic|heif)$'
    and app_private.azh_intake_open((storage.foldername(name))[1])
  );

create policy "azh intake: members read photos" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'azh-intake'
    and (storage.foldername(name))[1] in (select m::text from app_private.member_workspace_ids() m)
  );

create policy "azh intake: writers delete photos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'azh-intake'
    and (storage.foldername(name))[1] in (select m::text from app_private.writer_workspace_ids() m)
  );
