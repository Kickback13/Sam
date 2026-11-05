-- =============================================================================
-- Housing4All Track (Phase 4D): one-to-one text messages behind the TCPA gates.
-- Switched OFF by default; nothing can be sent until an owner/admin turns texting
-- on, a sending number is set and Twilio credentials exist (env). No automation:
-- a person writes and sends every message.
--
--   sms_settings         per workspace: on/off, sending number or Messaging Service,
--                        HELP reply, SHA-256 of the webhook token
--   sms_messages         every text in and out (and every attempt the gates
--                        blocked, with the reasons)
--
--   sms_messages guard   BEFORE INSERT: an outbound row may be 'queued' (= about to
--                        be handed to Twilio) only if texting is on and EVERY gate
--                        passes: not DNC, consent on file, not STOPped, a textable
--                        number of this contact, inside the workspace's texting
--                        hours (8am–9pm max), under the daily caps
--   public.sms_create_token(ws)        admin: new webhook token (shown once)
--   public.sms_receive(token, …)       Twilio inbound webhook: log the text, match
--                                      or create the contact, STOP/START → the
--                                      suppression list, task the owner to reply
--   public.sms_status(sid, …)          Twilio status callback: delivery status (keyed by
--                                      the message id; the route checks Twilio's signature)
-- Additive only.
-- =============================================================================

create table public.sms_settings (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  enabled boolean not null default false,
  from_number text check (from_number is null or from_number ~ '^\+1[2-9][0-9]{9}$'),
  messaging_service_sid text check (messaging_service_sid is null or messaging_service_sid ~ '^MG[0-9a-f]{32}$'),
  help_reply text check (help_reply is null or char_length(help_reply) between 1 and 320),
  webhook_token_hash text check (webhook_token_hash is null or webhook_token_hash ~ '^[0-9a-f]{64}$'),
  updated_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.sms_settings is
  'Texting on/off and the sending number. Twilio credentials live in env, never here.';
create unique index sms_settings_token_idx on public.sms_settings (webhook_token_hash) where webhook_token_hash is not null;
create index sms_settings_updated_by_idx on public.sms_settings (updated_by);
create trigger sms_settings_updated_at before update on public.sms_settings
  for each row execute function app_private.set_updated_at();

create table public.sms_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  contact_id uuid,
  direction text not null check (direction in ('out', 'in')),
  status text not null check (status in (
    'blocked', 'queued', 'sent', 'delivered', 'undelivered', 'failed', 'received'
  )),
  to_number text not null check (to_number ~ '^\+[0-9]{8,15}$'),
  from_number text check (from_number is null or from_number ~ '^\+[0-9]{8,15}$'),
  body text not null check (char_length(body) between 1 and 1600),
  keyword text check (keyword is null or keyword in ('stop', 'start', 'help')),
  -- For blocked attempts: [{ "code": "...", "message": "..." }] from the gates.
  blocks jsonb not null default '[]'::jsonb check (jsonb_typeof(blocks) = 'array' and pg_column_size(blocks) <= 8192),
  provider_sid text check (provider_sid is null or provider_sid ~ '^(SM|MM)[0-9a-f]{32}$'),
  error text check (error is null or char_length(error) <= 500),
  sent_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, contact_id) references public.contacts (workspace_id, id) on delete set null (contact_id),
  constraint sms_messages_direction_status check (
    (direction = 'out' and status <> 'received') or (direction = 'in' and status = 'received')
  )
);
comment on table public.sms_messages is
  'Text messages in and out, plus outbound attempts the TCPA gates blocked (with reasons).';
create unique index sms_messages_sid_idx on public.sms_messages (workspace_id, provider_sid) where provider_sid is not null;
create index sms_messages_contact_idx on public.sms_messages (workspace_id, contact_id, created_at desc);
create index sms_messages_ws_idx on public.sms_messages (workspace_id, created_at desc);
create index sms_messages_sent_by_idx on public.sms_messages (sent_by);
create trigger sms_messages_updated_at before update on public.sms_messages
  for each row execute function app_private.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: members read; admins configure; writers log their own outbound texts
-- (the guard below decides whether one may be queued). Inbound texts and
-- delivery statuses arrive only through the webhook functions.
-- ---------------------------------------------------------------------------
alter table public.sms_settings enable row level security;
alter table public.sms_messages enable row level security;
revoke all on public.sms_settings, public.sms_messages from anon, authenticated;
grant select, insert on public.sms_settings to authenticated;
grant update (enabled, from_number, messaging_service_sid, help_reply, updated_by) on public.sms_settings to authenticated;
grant select, insert on public.sms_messages to authenticated;
grant update (status, provider_sid, error) on public.sms_messages to authenticated;

create policy "members read" on public.sms_settings for select to authenticated
  using (workspace_id in (select app_private.member_workspace_ids()));
create policy "admins insert" on public.sms_settings for insert to authenticated
  with check (workspace_id in (select app_private.admin_workspace_ids()) and webhook_token_hash is null);
create policy "admins update" on public.sms_settings for update to authenticated
  using (workspace_id in (select app_private.admin_workspace_ids()))
  with check (workspace_id in (select app_private.admin_workspace_ids()));

create policy "members read" on public.sms_messages for select to authenticated
  using (workspace_id in (select app_private.member_workspace_ids()));
create policy "writers send" on public.sms_messages for insert to authenticated
  with check (
    workspace_id in (select app_private.writer_workspace_ids())
    and direction = 'out' and status in ('blocked', 'queued')
    and provider_sid is null and sent_by = (select auth.uid())
  );
-- The sender records Twilio's answer on their own queued message (sid, sent/failed).
create policy "senders record the result" on public.sms_messages for update to authenticated
  using (workspace_id in (select app_private.writer_workspace_ids()) and direction = 'out'
         and status = 'queued' and sent_by = (select auth.uid()))
  with check (status in ('queued', 'sent', 'failed'));

-- Texting window (TCPA: 8am–9pm at most) in the workspace's time zone at `p_at`.
create or replace function app_private.sms_in_window(p_workspace_id uuid, p_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select extract(hour from p_at at time zone coalesce(o.time_zone, 'America/Los_Angeles'))::int
           between coalesce(o.sms_send_from, 8) and coalesce(o.sms_send_until, 21) - 1
  from (select 1) one
  left join public.outreach_settings o on o.workspace_id = p_workspace_id;
$$;
revoke all on function app_private.sms_in_window(uuid, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The gates, enforced by the database (the app checks first and explains;
-- this is the authority).
-- ---------------------------------------------------------------------------
create or replace function app_private.sms_messages_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.sms_settings;
  c public.contacts;
  phone_type text;
begin
  if new.direction <> 'out' or new.status <> 'queued' then
    return new;
  end if;

  select * into s from public.sms_settings where workspace_id = new.workspace_id;
  if s.workspace_id is null or not s.enabled then
    raise exception 'Texting is switched off for this workspace' using errcode = 'PT403';
  end if;
  if s.from_number is null and s.messaging_service_sid is null then
    raise exception 'Set a sending number before texting' using errcode = 'PT403';
  end if;
  new.from_number := coalesce(new.from_number, s.from_number);

  select * into c from public.contacts
  where workspace_id = new.workspace_id and id = new.contact_id and deleted_at is null;
  if c.id is null then
    raise exception 'Texts go to a contact' using errcode = 'PT403';
  end if;
  if c.dnc then
    raise exception 'Blocked: marked do-not-contact' using errcode = 'PT403';
  end if;
  if c.sms_consent = 'none' or c.sms_consent_at is null then
    raise exception 'Blocked: no SMS consent on file' using errcode = 'PT403';
  end if;
  if not (new.to_number = any (c.phone_keys)) then
    raise exception 'Blocked: that number isn''t on this contact' using errcode = 'PT403';
  end if;
  select coalesce(p ->> 'type', 'unknown') into phone_type
  from jsonb_array_elements(c.phones) p
  where app_private.normalize_phone(p ->> 'value') = new.to_number
  order by (p ->> 'type' = 'mobile') desc
  limit 1;
  if phone_type = 'landline' then
    raise exception 'Blocked: that number is a landline' using errcode = 'PT403';
  end if;
  if exists (
    select 1 from public.outreach_suppressions x
    where x.workspace_id = new.workspace_id and x.channel = 'sms' and x.value = any (c.phone_keys)
  ) then
    raise exception 'Blocked: this contact texted STOP' using errcode = 'PT403';
  end if;

  if not app_private.sms_in_window(new.workspace_id, now()) then
    raise exception 'Blocked: outside texting hours' using errcode = 'PT403';
  end if;

  -- Daily caps (a person types every text; these stop a runaway loop).
  if (
    select count(*) from public.sms_messages m
    where m.workspace_id = new.workspace_id and m.contact_id = new.contact_id and m.direction = 'out'
      and m.status <> 'blocked' and m.created_at > now() - interval '1 day'
  ) >= 10 then
    raise exception 'Blocked: 10 texts to this contact in a day is the limit' using errcode = 'PT429';
  end if;
  if (
    select count(*) from public.sms_messages m
    where m.workspace_id = new.workspace_id and m.direction = 'out'
      and m.status <> 'blocked' and m.created_at > now() - interval '1 day'
  ) >= 300 then
    raise exception 'Blocked: the workspace''s daily texting limit (300) is reached' using errcode = 'PT429';
  end if;
  return new;
end;
$$;
revoke all on function app_private.sms_messages_guard() from public, anon, authenticated;
create trigger sms_messages_guard before insert on public.sms_messages
  for each row execute function app_private.sms_messages_guard();

-- ---------------------------------------------------------------------------
-- Webhook token (Twilio posts to /api/sms/…/<token>; the app also checks
-- Twilio's request signature).
-- ---------------------------------------------------------------------------
create or replace function app_private.sms_token_workspace(p_token text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.workspace_id from public.sms_settings s
  where s.webhook_token_hash is not null
    and s.webhook_token_hash = encode(extensions.digest(lower(btrim(coalesce(p_token, ''))), 'sha256'), 'hex');
$$;
revoke all on function app_private.sms_token_workspace(text) from public, anon, authenticated;

create or replace function public.sms_create_token(p_workspace_id uuid)
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
    raise exception 'Only an owner or admin can manage texting' using errcode = '42501';
  end if;
  insert into public.sms_settings (workspace_id, webhook_token_hash, updated_by)
  values (p_workspace_id, encode(extensions.digest(token, 'sha256'), 'hex'), auth.uid())
  on conflict (workspace_id) do update set webhook_token_hash = excluded.webhook_token_hash, updated_by = auth.uid();
  insert into public.audit_log (workspace_id, actor_id, action, entity_type, diff)
  values (p_workspace_id, auth.uid(), 'sms.token_created', 'sms', '{}'::jsonb);
  return token;
end;
$$;

-- Inbound text. Returns the keyword (stop/start/help/null) and the HELP reply.
create or replace function public.sms_receive(
  p_token text,
  p_from text,
  p_to text,
  p_body text,
  p_sid text
)
returns table (keyword text, help_reply text, contact_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  ws uuid := app_private.sms_token_workspace(p_token);
  s public.sms_settings;
  v_from text := app_private.normalize_phone(p_from);
  v_to text := app_private.normalize_phone(p_to);
  v_body text := left(btrim(coalesce(p_body, '')), 1600);
  v_word text;
  v_keyword text;
  v_contact uuid;
  v_assignee uuid;
  v_name text;
begin
  if ws is null then
    raise exception 'Unknown webhook' using errcode = '42501';
  end if;
  if v_from is null or v_from !~ '^\+[0-9]{8,15}$' then
    raise exception 'Invalid sender' using errcode = '22023';
  end if;
  if p_sid is null or p_sid !~ '^(SM|MM)[0-9a-f]{32}$' then
    raise exception 'Invalid message id' using errcode = '22023';
  end if;
  if v_body = '' then
    v_body := '(no text)';
  end if;
  select * into s from public.sms_settings where workspace_id = ws;

  -- Twilio retries webhooks: one row per message id.
  if exists (select 1 from public.sms_messages m where m.workspace_id = ws and m.provider_sid = p_sid) then
    return query
    select m.keyword, s.help_reply, m.contact_id from public.sms_messages m
    where m.workspace_id = ws and m.provider_sid = p_sid;
    return;
  end if;

  -- Same keywords as classifyInboundSms (src/features/outreach/compliance.ts).
  v_word := upper(regexp_replace(regexp_replace(v_body, '[.!?\s]+$', ''), '\s+', ' ', 'g'));
  v_keyword := case
    when v_word in ('STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'REVOKE', 'OPTOUT', 'OPT OUT') then 'stop'
    when v_word in ('START', 'UNSTOP') then 'start'
    when v_word in ('HELP', 'INFO') then 'help'
  end;

  select c.id, c.assigned_to, c.full_name into v_contact, v_assignee, v_name
  from public.contacts c
  where c.workspace_id = ws and c.deleted_at is null and c.phone_keys @> array[v_from]
  order by c.created_at
  limit 1;
  if v_contact is null then
    insert into public.contacts (workspace_id, phones, tags, source, created_by)
    values (ws, jsonb_build_array(jsonb_build_object('value', v_from, 'label', 'mobile', 'type', 'mobile', 'is_primary', true)),
            array['texted-in'], 'Text message', null)
    returning id into v_contact;
  end if;

  insert into public.sms_messages (workspace_id, contact_id, direction, status, to_number, from_number, body,
                                   keyword, provider_sid, sent_by)
  values (ws, v_contact, 'in', 'received', coalesce(v_to, v_from), v_from, v_body, v_keyword, p_sid, null);

  if v_keyword = 'stop' then
    insert into public.outreach_suppressions (workspace_id, channel, value, reason, note, contact_id, created_by)
    values (ws, 'sms', v_from, 'stop', 'Texted ' || v_word, v_contact, null)
    on conflict (workspace_id, channel, value) do nothing;
  elsif v_keyword = 'start' then
    delete from public.outreach_suppressions x
    where x.workspace_id = ws and x.channel = 'sms' and x.value = v_from and x.reason = 'stop';
  end if;

  insert into public.activities (workspace_id, type, subject_type, subject_id, body, metadata, created_by)
  values (ws, 'sms', 'contact', v_contact,
          case v_keyword
            when 'stop' then 'Texted ' || v_word || ' — opted out of texts'
            when 'start' then 'Texted ' || v_word || ' — texts allowed again (consent on file still applies)'
            else 'Text received: ' || v_body
          end,
          jsonb_build_object('direction', 'in', 'provider_sid', p_sid, 'keyword', v_keyword),
          null);

  if v_keyword is null then
    insert into public.tasks (workspace_id, title, notes, due_at, assigned_to, related_type, related_id, created_by)
    values (ws, left('Reply to text from ' || coalesce(v_name, v_from), 300), left(v_body, 2000),
            now() + interval '2 hours', v_assignee, 'contact', v_contact, null);
  end if;

  return query select v_keyword, s.help_reply, v_contact;
end;
$$;

-- Delivery status from Twilio's status callback (only moves an outbound message
-- forward). Keyed by Twilio's message id, which only Twilio and members see; the
-- route rejects requests without a valid Twilio signature.
create or replace function public.sms_status(p_sid text, p_status text, p_error text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_status text := case lower(coalesce(p_status, ''))
    when 'sent' then 'sent'
    when 'delivered' then 'delivered'
    when 'undelivered' then 'undelivered'
    when 'failed' then 'failed'
  end;
begin
  if v_status is null or p_sid is null or p_sid !~ '^(SM|MM)[0-9a-f]{32}$' then
    return; -- queued/sending/accepted (or junk): nothing to record
  end if;
  update public.sms_messages m
     set status = v_status,
         error = case when v_status in ('undelivered', 'failed') then left(coalesce(p_error, 'Not delivered'), 500) else m.error end
   where m.provider_sid = p_sid and m.direction = 'out'
     and m.status in ('queued', 'sent')
     and not (m.status = 'sent' and v_status = 'sent');
end;
$$;

revoke all on function public.sms_create_token(uuid) from public, anon;
revoke all on function public.sms_receive(text, text, text, text, text) from public;
revoke all on function public.sms_status(text, text, text) from public;
grant execute on function public.sms_create_token(uuid) to authenticated;
grant execute on function public.sms_receive(text, text, text, text, text) to anon, authenticated;
grant execute on function public.sms_status(text, text, text) to anon, authenticated;
