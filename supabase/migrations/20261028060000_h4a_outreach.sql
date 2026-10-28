-- =============================================================================
-- Housing4All Track (Phase 4A): outreach foundation — compliance + newsletters.
-- Used by BOTH business types (Housing4All and AZH each send their own
-- newsletter to their own contacts); built and owned by Track A.
--
--   outreach_settings      per-workspace sender details (CAN-SPAM) + texting hours (TCPA)
--   outreach_suppressions  emails that unsubscribed and numbers that texted STOP
--   newsletters            newsletter drafts and sent issues
--   newsletter_sends       one row per recipient: sent / failed / blocked (+ why)
--
--   public.outreach_unsubscribe_info(token)  what the public unsubscribe page shows (anon)
--   public.outreach_unsubscribe(token)       one-click unsubscribe (anon, RFC 8058)
--
-- Additive only: no existing table, column, policy or function changes.
-- Every table has workspace_id + RLS: members read; writers (owner/admin/agent)
-- write; viewers read only; anon gets nothing (only the two token functions).
--
-- The compliance gates themselves live in src/features/outreach/compliance.ts
-- (pure, unit-tested) and run on the server right before every send.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Settings. Texting hours may be narrowed but never widened past the federal
-- 8am–9pm window. Nothing is pre-filled: Sam enters his sender details.
-- ---------------------------------------------------------------------------
create table public.outreach_settings (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  sender_name text check (sender_name is null or char_length(sender_name) between 1 and 120),
  from_email extensions.citext
    check (from_email is null or (char_length(from_email) <= 254 and from_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  reply_to extensions.citext
    check (reply_to is null or (char_length(reply_to) <= 254 and reply_to ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  mailing_address text check (mailing_address is null or char_length(mailing_address) between 5 and 500),
  time_zone text not null default 'America/Los_Angeles' check (time_zone in (
    'America/Los_Angeles', 'America/Phoenix', 'America/Denver', 'America/Chicago',
    'America/New_York', 'America/Anchorage', 'Pacific/Honolulu'
  )),
  sms_send_from smallint not null default 8 check (sms_send_from between 8 and 20),
  sms_send_until smallint not null default 21 check (sms_send_until between 9 and 21),
  updated_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outreach_settings_window check (sms_send_from < sms_send_until)
);
comment on table public.outreach_settings is
  'Sender details (CAN-SPAM: name, From, physical mailing address) and texting hours (TCPA, 8am–9pm max).';
create index outreach_settings_updated_by_idx on public.outreach_settings (updated_by);
create trigger outreach_settings_updated_at before update on public.outreach_settings
  for each row execute function app_private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Suppression list. Values are normalized: emails lower-case, phones +1XXXXXXXXXX.
-- A suppressed value is never sent to, whatever the contact record says.
-- ---------------------------------------------------------------------------
create table public.outreach_suppressions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  channel text not null check (channel in ('email', 'sms')),
  value text not null check (char_length(value) <= 254),
  reason text not null check (reason in ('unsubscribe', 'stop', 'manual', 'bounce', 'complaint')),
  note text check (note is null or char_length(note) <= 500),
  contact_id uuid,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (workspace_id, channel, value),
  foreign key (workspace_id, contact_id)
    references public.contacts (workspace_id, id) on delete set null (contact_id),
  constraint outreach_suppressions_value_format check (
    (channel = 'email' and value = lower(value) and value ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
    or (channel = 'sms' and value ~ '^\+[0-9]{8,15}$')
  )
);
comment on table public.outreach_suppressions is
  'Do-not-send list: email unsubscribes and SMS STOPs (normalized values). Checked before every send.';
create index outreach_suppressions_contact_idx on public.outreach_suppressions (workspace_id, contact_id);
create index outreach_suppressions_created_by_idx on public.outreach_suppressions (created_by);

-- ---------------------------------------------------------------------------
-- Newsletters. audience = {"tags": [...], "roles": [...]} (empty = every contact).
-- Content can't change once sending starts, and status only moves forward:
-- draft → sending → sent.
-- ---------------------------------------------------------------------------
create table public.newsletters (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  subject text not null check (char_length(subject) between 1 and 200),
  preheader text check (preheader is null or char_length(preheader) <= 200),
  body text not null default '' check (char_length(body) <= 50000),
  audience jsonb not null default '{}'::jsonb
    check (jsonb_typeof(audience) = 'object' and pg_column_size(audience) <= 8192),
  status text not null default 'draft' check (status in ('draft', 'sending', 'sent')),
  recipient_count integer not null default 0 check (recipient_count >= 0),
  sent_count integer not null default 0 check (sent_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  blocked_count integer not null default 0 check (blocked_count >= 0),
  sent_at timestamptz,
  sent_by uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  constraint newsletters_sent_has_time check (status <> 'sent' or sent_at is not null)
);
comment on table public.newsletters is
  'Newsletter drafts and sent issues. Each workspace has its own list; nothing sends unless every compliance gate passes.';
create index newsletters_ws_idx on public.newsletters (workspace_id, created_at desc);
create index newsletters_created_by_idx on public.newsletters (created_by);
create index newsletters_updated_by_idx on public.newsletters (updated_by);
create index newsletters_sent_by_idx on public.newsletters (sent_by);
create trigger newsletters_updated_at before update on public.newsletters
  for each row execute function app_private.set_updated_at();

create or replace function app_private.newsletters_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'draft' and (
       new.subject is distinct from old.subject
    or new.preheader is distinct from old.preheader
    or new.body is distinct from old.body
    or new.audience is distinct from old.audience
  ) then
    raise exception 'A newsletter can''t be edited once it has been sent' using errcode = 'P0001';
  end if;
  if not (
       new.status = old.status
    or (old.status = 'draft' and new.status = 'sending')
    or (old.status = 'sending' and new.status = 'sent')
  ) then
    raise exception 'Newsletter status can''t go from % to %', old.status, new.status using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger newsletters_guard before update on public.newsletters
  for each row execute function app_private.newsletters_guard();

-- ---------------------------------------------------------------------------
-- Send log: one row per recipient, written when a newsletter is sent. Blocked
-- recipients are logged too, with the gates that stopped them. Rows are never
-- deleted; only the delivery fields can be updated (column grants below).
-- ---------------------------------------------------------------------------
create table public.newsletter_sends (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  newsletter_id uuid not null,
  contact_id uuid,
  email extensions.citext not null check (char_length(email) <= 254),
  status text not null check (status in ('queued', 'sent', 'failed', 'blocked')),
  blocked_reasons text[] not null default '{}' check (cardinality(blocked_reasons) <= 20),
  provider_message_id text check (provider_message_id is null or char_length(provider_message_id) <= 200),
  error text check (error is null or char_length(error) <= 500),
  unsubscribe_token uuid not null default gen_random_uuid() unique,
  unsubscribed_at timestamptz,
  sent_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (newsletter_id, email),
  foreign key (workspace_id, newsletter_id)
    references public.newsletters (workspace_id, id) on delete cascade,
  foreign key (workspace_id, contact_id)
    references public.contacts (workspace_id, id) on delete set null (contact_id),
  constraint newsletter_sends_blocked_has_reason check ((status = 'blocked') = (cardinality(blocked_reasons) > 0))
);
comment on table public.newsletter_sends is
  'Per-recipient send log (sent, failed, or blocked with the failing gates). Never deleted.';
create index newsletter_sends_newsletter_idx on public.newsletter_sends (workspace_id, newsletter_id, status);
create index newsletter_sends_contact_idx on public.newsletter_sends (workspace_id, contact_id);
create index newsletter_sends_created_by_idx on public.newsletter_sends (created_by);

create or replace function app_private.newsletter_sends_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not (new.status = old.status or (old.status = 'queued' and new.status in ('sent', 'failed'))) then
    raise exception 'Send status can''t go from % to %', old.status, new.status using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger newsletter_sends_guard before update on public.newsletter_sends
  for each row execute function app_private.newsletter_sends_guard();

-- Every email that actually went out is logged on the contact's timeline.
create or replace function app_private.newsletter_sends_log_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  subj text;
begin
  if new.status = 'sent' and old.status <> 'sent' and new.contact_id is not null then
    select n.subject into subj from public.newsletters n where n.id = new.newsletter_id;
    insert into public.activities (workspace_id, type, subject_type, subject_id, body, metadata, created_by)
    values (
      new.workspace_id, 'email', 'contact', new.contact_id,
      'Newsletter sent: ' || coalesce(subj, '(no subject)'),
      jsonb_build_object('kind', 'newsletter', 'newsletter_id', new.newsletter_id,
                         'send_id', new.id, 'to', new.email::text),
      auth.uid()
    );
  end if;
  return new;
end;
$$;
revoke all on function app_private.newsletter_sends_log_activity() from public;
create trigger newsletter_sends_log_activity after update of status on public.newsletter_sends
  for each row execute function app_private.newsletter_sends_log_activity();

-- ---------------------------------------------------------------------------
-- RLS.
-- ---------------------------------------------------------------------------
alter table public.outreach_settings enable row level security;
alter table public.outreach_suppressions enable row level security;
alter table public.newsletters enable row level security;
alter table public.newsletter_sends enable row level security;

revoke all on public.outreach_settings, public.outreach_suppressions, public.newsletters,
  public.newsletter_sends from anon, authenticated;

grant select on public.outreach_settings, public.outreach_suppressions, public.newsletters,
  public.newsletter_sends to authenticated;
grant insert, update on public.outreach_settings to authenticated;
grant insert, delete on public.outreach_suppressions to authenticated;
grant insert, delete on public.newsletters to authenticated;
grant update (subject, preheader, body, audience, status, recipient_count, sent_count, failed_count,
              blocked_count, sent_at, sent_by, updated_by)
  on public.newsletters to authenticated;
grant insert on public.newsletter_sends to authenticated;
grant update (status, provider_message_id, error, sent_at) on public.newsletter_sends to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['outreach_settings', 'outreach_suppressions', 'newsletters', 'newsletter_sends']
  loop
    execute format(
      'create policy "members read" on public.%I for select to authenticated
         using (workspace_id in (select app_private.member_workspace_ids()))', t);
  end loop;
end;
$$;

-- Settings: admins only (sender identity is a compliance setting).
create policy "admins insert" on public.outreach_settings for insert to authenticated
  with check (workspace_id in (select app_private.admin_workspace_ids()));
create policy "admins update" on public.outreach_settings for update to authenticated
  using (workspace_id in (select app_private.admin_workspace_ids()))
  with check (workspace_id in (select app_private.admin_workspace_ids()));

-- Suppressions: any writer can add one; only admins can remove one.
create policy "writers insert" on public.outreach_suppressions for insert to authenticated
  with check (workspace_id in (select app_private.writer_workspace_ids()));
create policy "admins delete" on public.outreach_suppressions for delete to authenticated
  using (workspace_id in (select app_private.admin_workspace_ids()));

-- Newsletters: writers create and edit; only drafts can be deleted.
create policy "writers insert" on public.newsletters for insert to authenticated
  with check (workspace_id in (select app_private.writer_workspace_ids()) and status = 'draft');
create policy "writers update" on public.newsletters for update to authenticated
  using (workspace_id in (select app_private.writer_workspace_ids()))
  with check (workspace_id in (select app_private.writer_workspace_ids()));
create policy "writers delete drafts" on public.newsletters for delete to authenticated
  using (workspace_id in (select app_private.writer_workspace_ids()) and status = 'draft');

-- Send log: writers add rows (queued or blocked) and record delivery; no deletes.
create policy "writers insert" on public.newsletter_sends for insert to authenticated
  with check (
    workspace_id in (select app_private.writer_workspace_ids())
    and status in ('queued', 'blocked')
    and unsubscribed_at is null
  );
create policy "writers update" on public.newsletter_sends for update to authenticated
  using (workspace_id in (select app_private.writer_workspace_ids()))
  with check (workspace_id in (select app_private.writer_workspace_ids()));

-- ---------------------------------------------------------------------------
-- Public unsubscribe (no login). The token is the random per-recipient
-- unsubscribe_token; it reveals only the workspace name and a masked email.
-- ---------------------------------------------------------------------------
create or replace function app_private.mask_email(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_email is null or position('@' in p_email) = 0 then null
    else left(split_part(p_email, '@', 1), 1)
         || repeat('•', greatest(length(split_part(p_email, '@', 1)) - 1, 1))
         || '@' || split_part(p_email, '@', 2)
  end;
$$;

create or replace function public.outreach_unsubscribe_info(p_token uuid)
returns table (workspace_name text, email_hint text, unsubscribed boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select w.name,
         app_private.mask_email(s.email::text),
         s.unsubscribed_at is not null or exists (
           select 1 from public.outreach_suppressions x
           where x.workspace_id = s.workspace_id and x.channel = 'email' and x.value = lower(s.email::text)
         )
  from public.newsletter_sends s
  join public.workspaces w on w.id = s.workspace_id
  where s.unsubscribe_token = p_token;
$$;
revoke all on function public.outreach_unsubscribe_info(uuid) from public;
grant execute on function public.outreach_unsubscribe_info(uuid) to anon, authenticated;

create or replace function public.outreach_unsubscribe(p_token uuid)
returns table (workspace_name text, email_hint text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.newsletter_sends;
  ws_name text;
  added uuid;
begin
  select * into s from public.newsletter_sends where unsubscribe_token = p_token;
  if not found then
    return;
  end if;
  select w.name into ws_name from public.workspaces w where w.id = s.workspace_id;

  insert into public.outreach_suppressions (workspace_id, channel, value, reason, note, contact_id, created_by)
  values (s.workspace_id, 'email', lower(s.email::text), 'unsubscribe',
          'One-click unsubscribe from a newsletter', s.contact_id, null)
  on conflict (workspace_id, channel, value) do nothing
  returning id into added;

  if s.unsubscribed_at is null then
    update public.newsletter_sends set unsubscribed_at = now() where id = s.id;
  end if;

  if s.contact_id is not null then
    update public.contacts
       set email_opt_out = true,
           email_opt_out_at = coalesce(email_opt_out_at, now())
     where workspace_id = s.workspace_id and id = s.contact_id and not email_opt_out;
  end if;

  -- Log once (the first time this address unsubscribes).
  if added is not null then
    if s.contact_id is not null then
      insert into public.activities (workspace_id, type, subject_type, subject_id, body, metadata, created_by)
      values (s.workspace_id, 'system', 'contact', s.contact_id,
              'Unsubscribed from email (newsletter link)',
              jsonb_build_object('kind', 'unsubscribe', 'newsletter_id', s.newsletter_id, 'send_id', s.id),
              null);
    end if;
    insert into public.audit_log (workspace_id, actor_id, action, entity_type, entity_id, diff)
    values (s.workspace_id, null, 'outreach.unsubscribe', 'newsletter_send', s.id,
            jsonb_build_object('newsletter_id', s.newsletter_id, 'contact_id', s.contact_id));
  end if;

  return query select ws_name, app_private.mask_email(s.email::text);
end;
$$;
revoke all on function public.outreach_unsubscribe(uuid) from public;
grant execute on function public.outreach_unsubscribe(uuid) to anon, authenticated;
revoke all on function app_private.mask_email(text) from public;
