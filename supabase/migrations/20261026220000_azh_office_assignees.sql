-- =============================================================================
-- AZH: several people per office get every new homeowner request (AZH-015).
--
-- azh_settings gets san_diego_assignees / fallbrook_assignees (uuid[]),
-- backfilled from the old single columns, which are KEPT and kept in sync
-- (first person in the list) so older code keeps working.
-- Every id must be a member of the workspace; only admins can change settings
-- (existing RLS). The request-form intake now creates one follow-up task per
-- assignee (no duplicates), or one unassigned task when the list is empty, and
-- sets the request's assigned_to to the first assignee. Everything else the
-- intake does is unchanged.
-- =============================================================================

alter table public.azh_settings
  add column san_diego_assignees uuid[] not null default '{}',
  add column fallbrook_assignees uuid[] not null default '{}';

comment on column public.azh_settings.san_diego_assignees is 'Members who get a follow-up task for every new San Diego request (in order; the first is also the request owner).';
comment on column public.azh_settings.fallbrook_assignees is 'Members who get a follow-up task for every new Fallbrook request (in order; the first is also the request owner).';

-- Backfill from the old single columns.
update public.azh_settings
set san_diego_assignees = case when san_diego_assignee is null then '{}'::uuid[] else array[san_diego_assignee] end,
    fallbrook_assignees = case when fallbrook_assignee is null then '{}'::uuid[] else array[fallbrook_assignee] end;

-- Keep lists clean, members-only, and the old single columns in sync.
create or replace function app_private.azh_settings_assignees_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Older code that only writes the single column: treat it as a one-person list.
  if tg_op = 'UPDATE' then
    if new.san_diego_assignee is distinct from old.san_diego_assignee
       and new.san_diego_assignees is not distinct from old.san_diego_assignees then
      new.san_diego_assignees := case when new.san_diego_assignee is null then '{}'::uuid[] else array[new.san_diego_assignee] end;
    end if;
    if new.fallbrook_assignee is distinct from old.fallbrook_assignee
       and new.fallbrook_assignees is not distinct from old.fallbrook_assignees then
      new.fallbrook_assignees := case when new.fallbrook_assignee is null then '{}'::uuid[] else array[new.fallbrook_assignee] end;
    end if;
  end if;

  -- No duplicates (first occurrence wins), no nulls.
  new.san_diego_assignees := coalesce((
    select array_agg(u.id order by u.ord)
    from (select distinct on (x.id) x.id, x.ord from unnest(new.san_diego_assignees) with ordinality x(id, ord)
          where x.id is not null order by x.id, x.ord) u
  ), '{}');
  new.fallbrook_assignees := coalesce((
    select array_agg(u.id order by u.ord)
    from (select distinct on (x.id) x.id, x.ord from unnest(new.fallbrook_assignees) with ordinality x(id, ord)
          where x.id is not null order by x.id, x.ord) u
  ), '{}');

  if cardinality(new.san_diego_assignees) > 20 or cardinality(new.fallbrook_assignees) > 20 then
    raise exception 'At most 20 people per office' using errcode = '23514';
  end if;

  if exists (
    select 1 from unnest(new.san_diego_assignees || new.fallbrook_assignees) id
    where not exists (
      select 1 from public.workspace_members m where m.workspace_id = new.workspace_id and m.user_id = id
    )
  ) then
    raise exception 'Every assignee must be a member of this workspace' using errcode = '23514';
  end if;

  new.san_diego_assignee := new.san_diego_assignees[1];
  new.fallbrook_assignee := new.fallbrook_assignees[1];
  return new;
end;
$$;
revoke all on function app_private.azh_settings_assignees_before_write() from public, anon, authenticated;

create trigger azh_settings_assignees_before_write
  before insert or update on public.azh_settings
  for each row execute function app_private.azh_settings_assignees_before_write();

-- Current members on an office's list, in order (people removed from the
-- workspace since they were picked are skipped).
create or replace function app_private.azh_office_assignees(p_workspace_id uuid, p_office text)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(x.id order by x.ord), '{}')
  from public.azh_settings s
  cross join lateral unnest(case p_office when 'fallbrook' then s.fallbrook_assignees else s.san_diego_assignees end)
    with ordinality as x(id, ord)
  where s.workspace_id = p_workspace_id
    and exists (select 1 from public.workspace_members m where m.workspace_id = s.workspace_id and m.user_id = x.id);
$$;
revoke all on function app_private.azh_office_assignees(uuid, text) from public, anon, authenticated;

-- Intake: one task per assignee (see header). Body otherwise identical to 20261020060100.
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
  assignees uuid[];
  a uuid;
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

  -- Who gets this request (current members only, in the order set in Settings → AZH).
  assignees := app_private.azh_office_assignees(ws, office);

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
    'web_form', assignees[1], null
  )
  returning id into req;

  -- 4. One follow-up task per office assignee; one unassigned task when nobody is set.
  foreach a in array (case when cardinality(assignees) = 0 then array[null::uuid] else assignees end) loop
    insert into public.tasks (workspace_id, title, notes, due_at, assigned_to, related_type, related_id, created_by)
    values (
      ws,
      left('Call new homeowner request: ' || new.name || ' (' || case office when 'fallbrook' then 'Fallbrook' else 'San Diego' end || ' office)', 300),
      new.service_type || ' at ' || new.job_address || ' ' || new.job_zip
        || E'\nPreferred contact time: ' || new.preferred_contact_time
        || E'\nSMS consent: ' || case when new.sms_consent then 'yes' else 'no — call or email only' end,
      now() + interval '1 day', a, 'deal', deal, null
    );
  end loop;

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
