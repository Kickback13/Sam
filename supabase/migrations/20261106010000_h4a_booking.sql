-- =============================================================================
-- Housing4All Track (Phase 4C): booking page — leads pick a time with Sam.
--
--   booking_settings   per workspace: on/off (off by default), host, meeting length,
--                      weekly hours, notice, how far ahead, location, intro text,
--                      the SHA-256 of the private calendar-feed token
--   bookings           one row per meeting or blocked time; stored in the app,
--                      no outside calendar account
--
--   public.booking_public_page(slug)             anon: page text + meeting length (when on)
--   public.booking_public_slots(slug)            anon: open start times (computed here)
--   public.booking_public_book(slug, …)          anon: book an open slot → match or create
--                                                the contact, log a meeting, task the host
--   public.booking_rotate_feed(ws)               admin: new calendar-feed token (shown once)
--   public.booking_feed(token)                   anon: the feed's bookings (token-scoped)
--
-- Nothing here sends an email or a text (CLAUDE.md rule 4). The lead downloads an
-- .ics file from the confirmation page; Sam subscribes to the private feed.
-- Additive only.
-- =============================================================================

create table public.booking_settings (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  enabled boolean not null default false,
  host_user_id uuid references public.profiles (id) on delete set null,
  title text not null default 'Book a call' check (char_length(title) between 1 and 120),
  intro text check (intro is null or char_length(intro) <= 1000),
  location text not null default 'Phone call' check (char_length(location) between 1 and 200),
  meeting_minutes smallint not null default 30 check (meeting_minutes in (15, 20, 30, 45, 60, 90)),
  buffer_minutes smallint not null default 0 check (buffer_minutes between 0 and 60),
  min_notice_hours smallint not null default 24 check (min_notice_hours between 0 and 336),
  max_days_ahead smallint not null default 30 check (max_days_ahead between 1 and 90),
  time_zone text not null default 'America/Los_Angeles' check (time_zone in (
    'America/Los_Angeles', 'America/Phoenix', 'America/Denver', 'America/Chicago',
    'America/New_York', 'America/Anchorage', 'Pacific/Honolulu'
  )),
  -- {"mon": [["09:00","17:00"]], …}; a missing day = closed. Same shape as the receptionist.
  hours jsonb not null default '{"mon":[["09:00","17:00"]],"tue":[["09:00","17:00"]],"wed":[["09:00","17:00"]],"thu":[["09:00","17:00"]],"fri":[["09:00","17:00"]]}'::jsonb
    check (jsonb_typeof(hours) = 'object' and pg_column_size(hours) <= 4096),
  feed_token_hash text check (feed_token_hash is null or feed_token_hash ~ '^[0-9a-f]{64}$'),
  updated_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index booking_settings_feed_idx on public.booking_settings (feed_token_hash) where feed_token_hash is not null;
create index booking_settings_host_idx on public.booking_settings (host_user_id);
create index booking_settings_updated_by_idx on public.booking_settings (updated_by);
create trigger booking_settings_updated_at before update on public.booking_settings
  for each row execute function app_private.set_updated_at();

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  kind text not null default 'meeting' check (kind in ('meeting', 'block')),
  status text not null default 'booked' check (status in ('booked', 'completed', 'no_show', 'canceled')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  title text check (title is null or char_length(title) <= 200),
  contact_id uuid,
  name text check (name is null or char_length(name) <= 120),
  email text check (email is null or char_length(email) <= 200),
  phone text check (phone is null or char_length(phone) <= 40),
  note text check (note is null or char_length(note) <= 2000),
  source text not null default 'staff' check (source in ('booking_page', 'staff')),
  host_user_id uuid references public.profiles (id) on delete set null,
  client_key text check (client_key is null or client_key ~ '^[0-9a-f]{64}$'),
  canceled_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, contact_id) references public.contacts (workspace_id, id) on delete set null (contact_id),
  constraint bookings_time_order check (ends_at > starts_at and ends_at <= starts_at + interval '24 hours'),
  constraint bookings_meeting_has_name check (kind = 'block' or name is not null)
);
comment on table public.bookings is
  'Meetings booked through the public booking page (or by staff) and blocked time. No outside calendar.';
comment on column public.bookings.client_key is 'SHA-256 of the booker IP (salted per day) for rate limiting; never the raw IP.';
create index bookings_ws_time_idx on public.bookings (workspace_id, starts_at);
create index bookings_contact_idx on public.bookings (workspace_id, contact_id);
create index bookings_host_idx on public.bookings (host_user_id);
create index bookings_created_by_idx on public.bookings (created_by);
create index bookings_client_idx on public.bookings (client_key, created_at desc) where client_key is not null;
create trigger bookings_updated_at before update on public.bookings
  for each row execute function app_private.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: members read; admins configure the page; writers add blocks/meetings and
-- change a booking's status. The public books only through the function below.
-- ---------------------------------------------------------------------------
alter table public.booking_settings enable row level security;
alter table public.bookings enable row level security;
revoke all on public.booking_settings, public.bookings from anon, authenticated;
grant select, insert on public.booking_settings to authenticated;
grant update (enabled, host_user_id, title, intro, location, meeting_minutes, buffer_minutes,
  min_notice_hours, max_days_ahead, time_zone, hours, updated_by) on public.booking_settings to authenticated;
grant select, insert on public.bookings to authenticated;
grant update (status, title, note, canceled_at) on public.bookings to authenticated;

create policy "members read" on public.booking_settings for select to authenticated
  using (workspace_id in (select app_private.member_workspace_ids()));
create policy "admins insert" on public.booking_settings for insert to authenticated
  with check (workspace_id in (select app_private.admin_workspace_ids()) and feed_token_hash is null);
create policy "admins update" on public.booking_settings for update to authenticated
  using (workspace_id in (select app_private.admin_workspace_ids()))
  with check (workspace_id in (select app_private.admin_workspace_ids()));

create policy "members read" on public.bookings for select to authenticated
  using (workspace_id in (select app_private.member_workspace_ids()));
create policy "writers insert" on public.bookings for insert to authenticated
  with check (workspace_id in (select app_private.writer_workspace_ids())
              and source = 'staff' and client_key is null and created_by = (select auth.uid()));
create policy "writers update" on public.bookings for update to authenticated
  using (workspace_id in (select app_private.writer_workspace_ids()))
  with check (workspace_id in (select app_private.writer_workspace_ids()));

-- ---------------------------------------------------------------------------
-- Open slots. The single authority for what the public may book.
-- ---------------------------------------------------------------------------
create or replace function app_private.booking_open_slots(p_workspace_id uuid)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with s as (
    select * from public.booking_settings where workspace_id = p_workspace_id and enabled
  ),
  days as (
    select (d)::date as day, s.*
    from s, generate_series(
      (now() at time zone s.time_zone)::date,
      (now() at time zone s.time_zone)::date + s.max_days_ahead,
      interval '1 day') as d
  ),
  windows as (
    select days.*, (r ->> 0)::time as w_start, (r ->> 1)::time as w_end
    from days,
      jsonb_array_elements(coalesce(days.hours -> (array['sun','mon','tue','wed','thu','fri','sat'])[extract(dow from days.day)::int + 1], '[]'::jsonb)) as r
    where jsonb_typeof(r) = 'array'
      and (r ->> 0) ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      and (r ->> 1) ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      and (r ->> 0) < (r ->> 1)
  ),
  slots as (
    select ((w.day + w.w_start + make_interval(mins => n * w.meeting_minutes)) at time zone w.time_zone) as st,
           w.meeting_minutes, w.buffer_minutes, w.min_notice_hours
    from windows w,
      generate_series(0, greatest(-1, floor((extract(epoch from (w.w_end - w.w_start)) / 60 - w.meeting_minutes) / w.meeting_minutes)::int)) as n
  )
  select sl.st, sl.st + make_interval(mins => sl.meeting_minutes)
  from slots sl
  where sl.st >= now() + make_interval(hours => sl.min_notice_hours)
    and not exists (
      select 1 from public.bookings b
      where b.workspace_id = p_workspace_id
        and b.status <> 'canceled'
        and b.starts_at < sl.st + make_interval(mins => sl.meeting_minutes + sl.buffer_minutes)
        and b.ends_at > sl.st - make_interval(mins => sl.buffer_minutes)
    )
  order by 1
  limit 2000;
$$;
revoke all on function app_private.booking_open_slots(uuid) from public, anon, authenticated;

create or replace function app_private.booking_workspace(p_slug text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select w.id from public.workspaces w
  join public.booking_settings s on s.workspace_id = w.id and s.enabled
  where w.slug = lower(btrim(coalesce(p_slug, ''))) and w.business_type = 'real_estate';
$$;
revoke all on function app_private.booking_workspace(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public functions (anon). Each is scoped to one workspace by its public slug and
-- returns nothing unless that workspace switched its booking page on.
-- ---------------------------------------------------------------------------
create or replace function public.booking_public_page(p_slug text)
returns table (
  workspace_name text, title text, intro text, location text, meeting_minutes smallint,
  time_zone text, host_name text, brand jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select w.name, s.title, s.intro, s.location, s.meeting_minutes, s.time_zone,
         nullif(split_part(coalesce(p.full_name, ''), ' ', 1), ''),
         w.brand
  from public.workspaces w
  join public.booking_settings s on s.workspace_id = w.id
  left join public.profiles p on p.id = s.host_user_id
  where w.id = app_private.booking_workspace(p_slug);
$$;

create or replace function public.booking_public_slots(p_slug text)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select o.starts_at, o.ends_at from app_private.booking_open_slots(app_private.booking_workspace(p_slug)) o;
$$;

create or replace function public.booking_public_book(
  p_slug text,
  p_starts_at timestamptz,
  p_name text,
  p_email text,
  p_phone text,
  p_note text,
  p_client_key text
)
returns table (booking_id uuid, starts_at timestamptz, ends_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  ws uuid := app_private.booking_workspace(p_slug);
  s public.booking_settings;
  v_end timestamptz;
  v_name text := btrim(coalesce(p_name, ''));
  v_email text := nullif(btrim(coalesce(p_email, '')), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  email_key text;
  phone_key text;
  v_contact uuid;
  v_booking uuid;
  first_name text;
  last_name text;
  local_when text;
begin
  if ws is null then
    raise exception 'This booking page isn''t open right now' using errcode = 'PT404';
  end if;
  select * into s from public.booking_settings where workspace_id = ws;

  -- One booking at a time per workspace, so two people can't take the same slot.
  perform pg_advisory_xact_lock(hashtextextended('booking:' || ws::text, 0));

  -- Rate limits: per client and per workspace.
  if p_client_key is not null and p_client_key !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid request' using errcode = '22023';
  end if;
  if p_client_key is not null and (
    select count(*) from public.bookings b
    where b.client_key = p_client_key and b.created_at > now() - interval '1 hour'
  ) >= 3 then
    raise exception 'Too many bookings from here. Please try again later or call us.' using errcode = 'PT429';
  end if;
  if (
    select count(*) from public.bookings b
    where b.workspace_id = ws and b.source = 'booking_page' and b.created_at > now() - interval '1 day'
  ) >= 50 then
    raise exception 'Too many bookings today. Please call us instead.' using errcode = 'PT429';
  end if;

  -- Validation (the server action validates too; this is the authority).
  if char_length(v_name) not between 2 and 120 then
    raise exception 'Enter your name' using errcode = '22023';
  end if;
  if v_email is null and v_phone is null then
    raise exception 'Enter an email or a phone number so we can reach you' using errcode = '22023';
  end if;
  if v_email is not null then
    email_key := app_private.normalize_email(v_email);
    if email_key is null or char_length(v_email) > 200 then
      raise exception 'Enter a valid email address' using errcode = '22023';
    end if;
  end if;
  if v_phone is not null then
    phone_key := app_private.normalize_phone(v_phone);
    if phone_key is null or phone_key !~ '^\+1[2-9][0-9]{9}$' then
      raise exception 'Enter a valid US phone number' using errcode = '22023';
    end if;
  end if;
  if v_note is not null and char_length(v_note) > 2000 then
    raise exception 'Keep the note under 2,000 characters' using errcode = '22023';
  end if;
  if (
    select count(*) from public.bookings b
    join public.contacts c on c.id = b.contact_id
    where b.workspace_id = ws and b.status = 'booked' and b.starts_at > now()
      and ((email_key is not null and c.email_keys @> array[email_key])
           or (phone_key is not null and c.phone_keys @> array[phone_key]))
  ) >= 2 then
    raise exception 'You already have upcoming calls booked. We look forward to talking.' using errcode = 'PT429';
  end if;

  select o.ends_at into v_end
  from app_private.booking_open_slots(ws) o
  where o.starts_at = p_starts_at;
  if v_end is null then
    raise exception 'That time was just taken. Please pick another.' using errcode = 'PT409';
  end if;

  -- Match or create the contact (same keys as the rest of the CRM).
  select c.id into v_contact
  from public.contacts c
  where c.workspace_id = ws and c.deleted_at is null
    and ((email_key is not null and c.email_keys @> array[email_key])
         or (phone_key is not null and c.phone_keys @> array[phone_key]))
  order by (email_key is not null and c.email_keys @> array[email_key]) desc, c.created_at
  limit 1;

  first_name := split_part(v_name, ' ', 1);
  last_name := nullif(btrim(substring(v_name from char_length(first_name) + 1)), '');
  if v_contact is null then
    insert into public.contacts (workspace_id, first_name, last_name, emails, phones, source, tags, created_by)
    values (
      ws, left(first_name, 100), left(last_name, 100),
      case when v_email is null then '[]'::jsonb
           else jsonb_build_array(jsonb_build_object('value', v_email, 'label', 'personal', 'is_primary', true)) end,
      case when v_phone is null then '[]'::jsonb
           else jsonb_build_array(jsonb_build_object('value', v_phone, 'label', 'mobile', 'type', 'unknown', 'is_primary', true)) end,
      'Booking page', array['booked-call'], null
    )
    returning id into v_contact;
  else
    update public.contacts c
    set tags = case when 'booked-call' = any (c.tags) then c.tags else c.tags || array['booked-call'] end,
        phones = case when phone_key is null or c.phone_keys @> array[phone_key] then c.phones
                      else c.phones || jsonb_build_array(jsonb_build_object('value', v_phone, 'label', 'mobile', 'type', 'unknown', 'is_primary', false)) end,
        emails = case when email_key is null or c.email_keys @> array[email_key] then c.emails
                      else c.emails || jsonb_build_array(jsonb_build_object('value', v_email, 'label', 'personal', 'is_primary', false)) end
    where c.id = v_contact;
  end if;

  insert into public.bookings (workspace_id, kind, status, starts_at, ends_at, title, contact_id, name, email, phone,
                               note, source, host_user_id, client_key, created_by)
  values (ws, 'meeting', 'booked', p_starts_at, v_end, s.title, v_contact, v_name, v_email, v_phone,
          v_note, 'booking_page', s.host_user_id, p_client_key, null)
  returning id into v_booking;

  local_when := to_char(p_starts_at at time zone s.time_zone, 'Dy Mon FMDD, FMHH12:MI AM');
  insert into public.activities (workspace_id, type, subject_type, subject_id, body, occurred_at, metadata, created_by)
  values (ws, 'meeting', 'contact', v_contact,
          'Booked a call through the booking page for ' || local_when
            || coalesce(E'\n' || v_note, ''),
          now(),
          jsonb_build_object('event', 'booking_created', 'booking_id', v_booking, 'starts_at', p_starts_at,
                             'duration_minutes', s.meeting_minutes),
          null);
  insert into public.tasks (workspace_id, title, notes, due_at, assigned_to, related_type, related_id, created_by)
  values (ws, left('Booked call: ' || v_name || ' — ' || local_when, 300),
          concat_ws(E'\n', 'Location: ' || s.location, 'Email: ' || v_email, 'Phone: ' || v_phone, v_note),
          p_starts_at, s.host_user_id, 'contact', v_contact, null);
  insert into public.audit_log (workspace_id, actor_id, action, entity_type, entity_id, diff)
  values (ws, null, 'booking.created', 'booking', v_booking,
          jsonb_build_object('source', 'booking_page', 'starts_at', p_starts_at, 'contact_id', v_contact));

  return query select v_booking, p_starts_at, v_end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Private calendar feed (Sam subscribes in Google/Apple Calendar; read-only).
-- ---------------------------------------------------------------------------
create or replace function public.booking_rotate_feed(p_workspace_id uuid)
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
    raise exception 'Only an owner or admin can manage the calendar feed' using errcode = '42501';
  end if;
  insert into public.booking_settings (workspace_id, feed_token_hash, updated_by)
  values (p_workspace_id, encode(extensions.digest(token, 'sha256'), 'hex'), auth.uid())
  on conflict (workspace_id) do update set feed_token_hash = excluded.feed_token_hash, updated_by = auth.uid();
  insert into public.audit_log (workspace_id, actor_id, action, entity_type, diff)
  values (p_workspace_id, auth.uid(), 'booking.feed_rotated', 'booking', '{}'::jsonb);
  return token;
end;
$$;

create or replace function public.booking_feed(p_token text)
returns table (
  id uuid, kind text, status text, starts_at timestamptz, ends_at timestamptz, title text,
  name text, email text, phone text, note text, location text, workspace_name text, updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.kind, b.status, b.starts_at, b.ends_at, b.title, b.name, b.email, b.phone, b.note,
         s.location, w.name, b.updated_at
  from public.booking_settings s
  join public.workspaces w on w.id = s.workspace_id
  join public.bookings b on b.workspace_id = s.workspace_id
  where s.feed_token_hash is not null
    and s.feed_token_hash = encode(extensions.digest(lower(btrim(coalesce(p_token, ''))), 'sha256'), 'hex')
    and b.starts_at > now() - interval '60 days'
    and b.starts_at < now() + interval '180 days'
  order by b.starts_at
  limit 2000;
$$;

revoke all on function public.booking_public_page(text) from public;
revoke all on function public.booking_public_slots(text) from public;
revoke all on function public.booking_public_book(text, timestamptz, text, text, text, text, text) from public;
revoke all on function public.booking_rotate_feed(uuid) from public, anon;
revoke all on function public.booking_feed(text) from public;
grant execute on function public.booking_public_page(text) to anon, authenticated;
grant execute on function public.booking_public_slots(text) to anon, authenticated;
grant execute on function public.booking_public_book(text, timestamptz, text, text, text, text, text) to anon, authenticated;
grant execute on function public.booking_rotate_feed(uuid) to authenticated;
grant execute on function public.booking_feed(text) to anon, authenticated;
