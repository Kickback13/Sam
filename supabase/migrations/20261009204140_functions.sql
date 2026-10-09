-- =============================================================================
-- Triggers and RPCs: normalization + dedupe keys, search text, deal stage
-- history, polymorphic subject validation, membership guards, invites,
-- global search and dashboard aggregates.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Normalization (mirrors src/lib/normalize.ts — keep in sync, unit-tested)
-- ---------------------------------------------------------------------------
create or replace function app_private.normalize_email(raw text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text;
begin
  if raw is null then
    return null;
  end if;
  v := lower(btrim(raw));
  v := regexp_replace(v, '^mailto:', '');
  if v !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return null;
  end if;
  return v;
end;
$$;

create or replace function app_private.normalize_phone(raw text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  cleaned text;
  digits text;
begin
  if raw is null then
    return null;
  end if;
  -- drop extensions: "ext 12", "x12", "#12"
  cleaned := regexp_replace(btrim(raw), '\s*(ext\.?|extension|x|#)\s*\d+\s*$', '', 'i');
  digits := regexp_replace(cleaned, '\D', '', 'g');
  if digits = '' then
    return null;
  end if;
  if length(digits) = 10 then
    return '+1' || digits;
  end if;
  if length(digits) = 11 and left(digits, 1) = '1' then
    return '+' || digits;
  end if;
  if left(cleaned, 1) = '+' and length(digits) between 8 and 15 then
    return '+' || digits;
  end if;
  if length(digits) between 7 and 15 then
    return digits;
  end if;
  return null;
end;
$$;

grant execute on function app_private.normalize_email(text) to authenticated;
grant execute on function app_private.normalize_phone(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Contacts: dedupe keys + search text
-- ---------------------------------------------------------------------------
create or replace function app_private.contacts_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.email_keys := coalesce((
    select array_agg(distinct k order by k)
    from (
      select app_private.normalize_email(e ->> 'value') as k
      from jsonb_array_elements(new.emails) e
    ) s
    where k is not null
  ), '{}');

  new.phone_keys := coalesce((
    select array_agg(distinct k order by k)
    from (
      select app_private.normalize_phone(p ->> 'value') as k
      from jsonb_array_elements(new.phones) p
    ) s
    where k is not null
  ), '{}');

  new.tags := coalesce((select array_agg(distinct t order by t) from unnest(new.tags) t where btrim(t) <> ''), '{}');

  new.search_text := lower(concat_ws(' ',
    new.first_name, new.last_name, new.title,
    (select string_agg(e ->> 'value', ' ') from jsonb_array_elements(new.emails) e),
    (select string_agg(p ->> 'value', ' ') from jsonb_array_elements(new.phones) p),
    array_to_string(new.phone_keys, ' '),
    new.address, new.city, new.zip, new.source,
    array_to_string(new.tags, ' '), array_to_string(new.roles, ' ')
  ));
  return new;
end;
$$;

create trigger contacts_before_write
  before insert or update on public.contacts
  for each row execute function app_private.contacts_before_write();

create or replace function app_private.companies_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.tags := coalesce((select array_agg(distinct t order by t) from unnest(new.tags) t where btrim(t) <> ''), '{}');
  new.search_text := lower(concat_ws(' ',
    new.name, new.type, new.website, new.phone, new.email::text, new.address, new.city, new.zip,
    array_to_string(new.tags, ' ')
  ));
  return new;
end;
$$;

create trigger companies_before_write
  before insert or update on public.companies
  for each row execute function app_private.companies_before_write();

create or replace function app_private.properties_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.tags := coalesce((select array_agg(distinct t order by t) from unnest(new.tags) t where btrim(t) <> ''), '{}');
  new.search_text := lower(concat_ws(' ',
    new.name, new.address, new.city, new.zip, new.apn, new.submarket, new.zoning,
    new.property_type, array_to_string(new.tags, ' ')
  ));
  return new;
end;
$$;

create trigger properties_before_write
  before insert or update on public.properties
  for each row execute function app_private.properties_before_write();

-- ---------------------------------------------------------------------------
-- Deals: status follows the stage; every stage change is logged.
-- ---------------------------------------------------------------------------
create or replace function app_private.deals_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  st record;
  old_status public.deal_status;
begin
  if tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id or new.pipeline_id is distinct from old.pipeline_id then
    select s.is_won, s.is_lost into st
    from public.pipeline_stages s
    where s.id = new.stage_id and s.pipeline_id = new.pipeline_id and s.workspace_id = new.workspace_id;
    if not found then
      raise exception 'Stage % does not belong to pipeline %', new.stage_id, new.pipeline_id using errcode = '23503';
    end if;

    old_status := case when tg_op = 'UPDATE' then old.status else null end;
    if tg_op = 'UPDATE' then
      new.stage_entered_at := now();
    end if;

    if st.is_won then
      new.status := 'won';
      new.lost_reason := null;
    elsif st.is_lost then
      new.status := 'lost';
    else
      new.status := 'open';
      new.lost_reason := null;
      new.closed_at := null;
    end if;

    if new.status <> 'open' and (old_status is null or old_status is distinct from new.status) then
      new.closed_at := now();
    end if;
  end if;

  new.search_text := lower(concat_ws(' ', new.title, new.source));
  return new;
end;
$$;

create trigger deals_before_write
  before insert or update on public.deals
  for each row execute function app_private.deals_before_write();

create or replace function app_private.deals_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  from_name text;
  to_name text;
  body text;
begin
  select name into to_name from public.pipeline_stages where id = new.stage_id;

  if tg_op = 'INSERT' then
    insert into public.deal_stage_history (workspace_id, deal_id, from_stage_id, to_stage_id, from_stage_name, to_stage_name, changed_by)
    values (new.workspace_id, new.id, null, new.stage_id, null, to_name, auth.uid());

    insert into public.activities (workspace_id, type, subject_type, subject_id, body, metadata, created_by)
    values (
      new.workspace_id, 'system', 'deal', new.id,
      'Deal created in ' || to_name,
      jsonb_build_object('event', 'deal_created', 'to_stage_id', new.stage_id, 'to_stage_name', to_name),
      auth.uid()
    );
  elsif new.stage_id is distinct from old.stage_id then
    select name into from_name from public.pipeline_stages where id = old.stage_id;

    insert into public.deal_stage_history (workspace_id, deal_id, from_stage_id, to_stage_id, from_stage_name, to_stage_name, changed_by)
    values (new.workspace_id, new.id, old.stage_id, new.stage_id, from_name, to_name, auth.uid());

    body := 'Moved from ' || coalesce(from_name, '—') || ' to ' || to_name;
    if new.status = 'lost' and new.lost_reason is not null then
      body := body || ' — reason: ' || new.lost_reason;
    end if;

    insert into public.activities (workspace_id, type, subject_type, subject_id, body, metadata, created_by)
    values (
      new.workspace_id, 'stage_change', 'deal', new.id, body,
      jsonb_build_object(
        'from_stage_id', old.stage_id, 'from_stage_name', from_name,
        'to_stage_id', new.stage_id, 'to_stage_name', to_name,
        'status', new.status, 'lost_reason', new.lost_reason
      ),
      auth.uid()
    );
  end if;
  return null;
end;
$$;

create trigger deals_after_write
  after insert or update of stage_id on public.deals
  for each row execute function app_private.deals_after_write();

-- ---------------------------------------------------------------------------
-- Polymorphic subject validation for activities and tasks
-- ---------------------------------------------------------------------------
create or replace function app_private.subject_exists(
  p_workspace_id uuid, p_type public.subject_type, p_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_type
    when 'contact' then exists (select 1 from public.contacts where id = p_id and workspace_id = p_workspace_id)
    when 'company' then exists (select 1 from public.companies where id = p_id and workspace_id = p_workspace_id)
    when 'property' then exists (select 1 from public.properties where id = p_id and workspace_id = p_workspace_id)
    when 'deal' then exists (select 1 from public.deals where id = p_id and workspace_id = p_workspace_id)
  end;
$$;

create or replace function app_private.activities_validate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not app_private.subject_exists(new.workspace_id, new.subject_type, new.subject_id) then
    raise exception '% % not found in this workspace', new.subject_type, new.subject_id using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger activities_validate
  before insert or update of subject_type, subject_id, workspace_id on public.activities
  for each row execute function app_private.activities_validate();

create or replace function app_private.tasks_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.related_type is not null
     and (tg_op = 'INSERT' or new.related_id is distinct from old.related_id or new.related_type is distinct from old.related_type)
     and not app_private.subject_exists(new.workspace_id, new.related_type, new.related_id) then
    raise exception '% % not found in this workspace', new.related_type, new.related_id using errcode = '23503';
  end if;

  if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger tasks_before_write
  before insert or update on public.tasks
  for each row execute function app_private.tasks_before_write();

-- ---------------------------------------------------------------------------
-- Membership guards: owners are protected; a workspace keeps >= 1 owner once it has one.
-- ---------------------------------------------------------------------------
create or replace function app_private.protect_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role public.member_role;
  owner_count integer;
begin
  -- Trusted internal paths (invite acceptance) and direct SQL (no JWT) skip the guard.
  if auth.uid() is null or coalesce(current_setting('app.member_guard_bypass', true), '') = 'on' then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' and (new.workspace_id <> old.workspace_id or new.user_id <> old.user_id) then
    raise exception 'Memberships cannot be moved' using errcode = '42501';
  end if;

  select role into caller_role
  from public.workspace_members
  where workspace_id = old.workspace_id and user_id = auth.uid();

  if (old.role = 'owner' or (tg_op = 'UPDATE' and new.role = 'owner'))
     and caller_role is distinct from 'owner'
     and not (tg_op = 'DELETE' and old.user_id = auth.uid()) then
    raise exception 'Only an owner can change owner memberships' using errcode = '42501';
  end if;

  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner') then
    select count(*) into owner_count
    from public.workspace_members
    where workspace_id = old.workspace_id and role = 'owner';
    if owner_count <= 1 then
      raise exception 'A workspace must keep at least one owner' using errcode = '23514';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger workspace_members_protect
  before update or delete on public.workspace_members
  for each row execute function app_private.protect_members();

-- Who may invite which role: admins invite admin/agent/viewer; owners invite owners.
-- Bootstrap: while a workspace has no owner yet, an admin may invite the owner (Sam).
create or replace function app_private.can_invite_role(p_workspace_id uuid, p_role public.member_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_role = 'owner' then
      p_workspace_id in (select app_private.owner_workspace_ids())
      or (
        p_workspace_id in (select app_private.admin_workspace_ids())
        and not exists (select 1 from public.workspace_members where workspace_id = p_workspace_id and role = 'owner')
      )
    else p_workspace_id in (select app_private.admin_workspace_ids())
  end;
$$;
revoke all on function app_private.can_invite_role(uuid, public.member_role) from public, anon;
grant execute on function app_private.can_invite_role(uuid, public.member_role) to authenticated;

-- Insert or upgrade a membership (never downgrades). Internal only.
create or replace function app_private.grant_membership(p_workspace_id uuid, p_user_id uuid, p_role public.member_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('app.member_guard_bypass', 'on', true);
  insert into public.workspace_members (workspace_id, user_id, role)
  values (p_workspace_id, p_user_id, p_role)
  on conflict (workspace_id, user_id) do update
    set role = excluded.role
    where excluded.role < public.workspace_members.role; -- enum order: owner < admin < agent < viewer
  perform set_config('app.member_guard_bypass', 'off', true);
end;
$$;
revoke all on function app_private.grant_membership(uuid, uuid, public.member_role) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Invite RPCs (exposed)
-- ---------------------------------------------------------------------------
create or replace function public.get_invite(p_token text)
returns table (
  workspace_name text,
  workspace_slug text,
  role public.member_role,
  email_hint text,
  is_email_bound boolean,
  status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  inv public.invites;
  ws public.workspaces;
  local_part text;
begin
  select * into inv from public.invites where token = p_token;
  if not found then
    return query select null::text, null::text, null::public.member_role, null::text, false, 'not_found'::text;
    return;
  end if;
  select * into ws from public.workspaces where id = inv.workspace_id;

  if inv.email is not null then
    local_part := split_part(inv.email::text, '@', 1);
    email_hint := left(local_part, 1) || repeat('•', greatest(length(local_part) - 1, 1)) || '@' || split_part(inv.email::text, '@', 2);
  end if;

  return query select
    ws.name,
    ws.slug,
    inv.role,
    email_hint,
    inv.email is not null,
    case
      when inv.revoked_at is not null then 'revoked'
      when inv.accepted_at is not null then 'accepted'
      when inv.expires_at < now() then 'expired'
      else 'valid'
    end;
end;
$$;
revoke all on function public.get_invite(text) from public;
grant execute on function public.get_invite(text) to anon, authenticated;

create or replace function public.accept_invite(p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.invites;
  uid uuid := auth.uid();
  user_email text;
  ws_slug text;
begin
  if uid is null then
    raise exception 'You need to sign in first' using errcode = '42501';
  end if;

  select * into inv from public.invites where token = p_token for update;
  if not found then
    raise exception 'Invite not found' using errcode = 'P0002';
  end if;

  select slug into ws_slug from public.workspaces where id = inv.workspace_id;

  if inv.accepted_at is not null then
    if inv.accepted_by = uid then
      return ws_slug;
    end if;
    raise exception 'This invite has already been used' using errcode = '22023';
  end if;
  if inv.revoked_at is not null then
    raise exception 'This invite was revoked' using errcode = '22023';
  end if;
  if inv.expires_at < now() then
    raise exception 'This invite has expired' using errcode = '22023';
  end if;

  select u.email into user_email from auth.users u where u.id = uid and u.email_confirmed_at is not null;
  if inv.email is not null and (user_email is null or lower(user_email) <> lower(inv.email::text)) then
    raise exception 'This invite was sent to a different email address' using errcode = '42501';
  end if;

  perform app_private.grant_membership(inv.workspace_id, uid, inv.role);
  update public.invites set accepted_at = now(), accepted_by = uid where id = inv.id;
  return ws_slug;
end;
$$;
revoke all on function public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated;

create or replace function public.accept_pending_invites()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  user_email text;
  inv record;
  n integer := 0;
begin
  if uid is null then
    return 0;
  end if;
  select u.email into user_email from auth.users u where u.id = uid and u.email_confirmed_at is not null;
  if user_email is null then
    return 0;
  end if;

  for inv in
    select * from public.invites
    where email = user_email::extensions.citext
      and accepted_at is null and revoked_at is null and expires_at > now()
    for update
  loop
    perform app_private.grant_membership(inv.workspace_id, uid, inv.role);
    update public.invites set accepted_at = now(), accepted_by = uid where id = inv.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.accept_pending_invites() from public, anon;
grant execute on function public.accept_pending_invites() to authenticated;

-- ---------------------------------------------------------------------------
-- Global search (SECURITY INVOKER → RLS applies)
-- ---------------------------------------------------------------------------
create or replace function public.global_search(p_workspace_id uuid, p_query text, p_limit integer default 6)
returns table (entity_type text, id uuid, title text, subtitle text, score real)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  q text := lower(btrim(coalesce(p_query, '')));
  pattern text;
  lim integer := least(greatest(coalesce(p_limit, 6), 1), 25);
begin
  if char_length(q) < 2 then
    return;
  end if;
  pattern := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
  (
    select 'contact'::text, c.id,
      coalesce(c.full_name, c.emails -> 0 ->> 'value', c.phones -> 0 ->> 'value', 'Unnamed contact'),
      nullif(concat_ws(' · ', c.title, c.emails -> 0 ->> 'value', c.phones -> 0 ->> 'value'), ''),
      extensions.word_similarity(q, c.search_text)
    from public.contacts c
    where c.workspace_id = p_workspace_id and c.deleted_at is null and c.search_text like pattern
    order by 5 desc, 3
    limit lim
  )
  union all
  (
    select 'company'::text, co.id, co.name,
      nullif(concat_ws(' · ', co.type, co.city), ''),
      extensions.word_similarity(q, co.search_text)
    from public.companies co
    where co.workspace_id = p_workspace_id and co.deleted_at is null and co.search_text like pattern
    order by 5 desc, 3
    limit lim
  )
  union all
  (
    select 'property'::text, p.id, coalesce(p.name, p.address),
      nullif(concat_ws(' · ', case when p.name is not null then p.address end, p.city,
        case when p.units is not null then p.units || ' units' end), ''),
      extensions.word_similarity(q, p.search_text)
    from public.properties p
    where p.workspace_id = p_workspace_id and p.deleted_at is null and p.search_text like pattern
    order by 5 desc, 3
    limit lim
  )
  union all
  (
    select 'deal'::text, d.id, d.title,
      nullif(concat_ws(' · ', s.name, d.status::text), ''),
      extensions.word_similarity(q, d.search_text)
    from public.deals d
    join public.pipeline_stages s on s.id = d.stage_id
    where d.workspace_id = p_workspace_id and d.deleted_at is null and d.search_text like pattern
    order by 5 desc, 3
    limit lim
  );
end;
$$;
grant execute on function public.global_search(uuid, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Dashboard aggregates (SECURITY INVOKER → RLS applies)
-- ---------------------------------------------------------------------------
create or replace function public.workspace_counts(p_workspace_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'contacts', (select count(*) from public.contacts where workspace_id = p_workspace_id and deleted_at is null),
    'companies', (select count(*) from public.companies where workspace_id = p_workspace_id and deleted_at is null),
    'properties', (select count(*) from public.properties where workspace_id = p_workspace_id and deleted_at is null),
    'open_deals', (select count(*) from public.deals where workspace_id = p_workspace_id and deleted_at is null and status = 'open'),
    'my_open_tasks', (select count(*) from public.tasks where workspace_id = p_workspace_id and status = 'open' and assigned_to = (select auth.uid())),
    'my_overdue_tasks', (select count(*) from public.tasks where workspace_id = p_workspace_id and status = 'open' and assigned_to = (select auth.uid()) and due_at < now())
  );
$$;
grant execute on function public.workspace_counts(uuid) to authenticated;

create or replace function public.pipeline_stage_totals(p_pipeline_id uuid)
returns table (
  stage_id uuid, name text, stage_position integer, color text, is_won boolean, is_lost boolean,
  deal_count bigint, total_value numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.id, s.name, s.position, s.color, s.is_won, s.is_lost,
    count(d.id), coalesce(sum(d.value), 0)
  from public.pipeline_stages s
  left join public.deals d on d.stage_id = s.id and d.deleted_at is null
  where s.pipeline_id = p_pipeline_id
  group by s.id
  order by s.position;
$$;
grant execute on function public.pipeline_stage_totals(uuid) to authenticated;

create or replace function public.find_contact_duplicates(
  p_workspace_id uuid, p_email_keys text[], p_phone_keys text[]
)
returns table (id uuid, full_name text, email_keys text[], phone_keys text[])
language sql
stable
security invoker
set search_path = ''
as $$
  select c.id, c.full_name, c.email_keys, c.phone_keys
  from public.contacts c
  where c.workspace_id = p_workspace_id
    and c.deleted_at is null
    and (c.email_keys && coalesce(p_email_keys, '{}') or c.phone_keys && coalesce(p_phone_keys, '{}'));
$$;
grant execute on function public.find_contact_duplicates(uuid, text[], text[]) to authenticated;

create or replace function public.reorder_stages(p_pipeline_id uuid, p_stage_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  stage_count integer;
begin
  select count(*) into stage_count from public.pipeline_stages where pipeline_id = p_pipeline_id;
  if stage_count <> coalesce(array_length(p_stage_ids, 1), 0)
     or exists (
       select 1 from unnest(p_stage_ids) sid
       where not exists (select 1 from public.pipeline_stages s where s.id = sid and s.pipeline_id = p_pipeline_id)
     ) then
    raise exception 'Stage list does not match the pipeline' using errcode = '22023';
  end if;

  update public.pipeline_stages s
  set position = o.ord
  from unnest(p_stage_ids) with ordinality as o(sid, ord)
  where s.id = o.sid and s.pipeline_id = p_pipeline_id;
end;
$$;
grant execute on function public.reorder_stages(uuid, uuid[]) to authenticated;
