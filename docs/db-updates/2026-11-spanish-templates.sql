-- Spanish message templates (ADR-043) for Supabase project jcrjzmflepnvvvneahvs.
-- All-or-nothing (one transaction); the migration is included word for word. Additive only.
-- Contains no DELETE statements in its own code (the replaced sms_receive function body has one,
-- unchanged from 20261107010000, for START removing a number from the do-not-text list).

begin;

do $$ begin if exists (select 1 from supabase_migrations.schema_migrations where version = '20261112010000') or exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'outreach_sequence_steps' and column_name = 'body_es') then raise exception 'Spanish templates already applied'; end if; end $$;

-- =============================================================================
-- Spanish message templates (ADR-043). Additive only.
--
--   outreach_sequence_steps.subject_es / body_es   optional Spanish version of a step;
--                                                  shown for contacts whose language is 'es'
--   sms_settings.help_reply_es                     Spanish answer to AYUDA (owners/admins set it)
--   public.sms_receive(...)                        same signature; Spanish opt-out words
--                                                  (ALTO, PARA, PARAR, DETENER, CANCELAR, BAJA)
--                                                  stop texts, INICIAR / REANUDAR start them
--                                                  again, AYUDA gets the Spanish help reply
--                                                  (English one if none is set)
--
-- Nothing here sends a message.
-- =============================================================================

alter table public.outreach_sequence_steps
  add column subject_es text check (subject_es is null or char_length(subject_es) between 1 and 200),
  add column body_es text check (body_es is null or char_length(body_es) between 1 and 5000);
alter table public.outreach_sequence_steps
  add constraint outreach_sequence_steps_sms_es_length check (channel <> 'sms' or body_es is null or char_length(body_es) <= 1600),
  add constraint outreach_sequence_steps_es_needs_body check (subject_es is null or body_es is not null);
comment on column public.outreach_sequence_steps.body_es is
  'Spanish version of the step (optional). Used for contacts whose language is es.';

alter table public.sms_settings
  add column help_reply_es text check (help_reply_es is null or char_length(help_reply_es) between 1 and 320);
grant update (help_reply_es) on public.sms_settings to authenticated;

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
    select m.keyword,
           case when upper(regexp_replace(regexp_replace(m.body, '[.!?\s]+$', ''), '\s+', ' ', 'g')) = 'AYUDA'
                then coalesce(s.help_reply_es, s.help_reply) else s.help_reply end,
           m.contact_id
    from public.sms_messages m
    where m.workspace_id = ws and m.provider_sid = p_sid;
    return;
  end if;

  -- Same keywords as classifyInboundSms (src/features/outreach/compliance.ts), English and Spanish.
  v_word := upper(regexp_replace(regexp_replace(v_body, '[.!?\s]+$', ''), '\s+', ' ', 'g'));
  v_keyword := case
    when v_word in ('STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'REVOKE', 'OPTOUT', 'OPT OUT',
                    'ALTO', 'PARA', 'PARAR', 'DETENER', 'CANCELAR', 'BAJA') then 'stop'
    when v_word in ('START', 'UNSTOP', 'INICIAR', 'REANUDAR') then 'start'
    when v_word in ('HELP', 'INFO', 'AYUDA') then 'help'
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

  return query select v_keyword,
    case when v_word = 'AYUDA' then coalesce(s.help_reply_es, s.help_reply) else s.help_reply end,
    v_contact;
end;
$$;

revoke all on function public.sms_receive(text, text, text, text, text) from public;
grant execute on function public.sms_receive(text, text, text, text, text) to anon, authenticated;

insert into supabase_migrations.schema_migrations (version, name) values
  ('20261112010000', 'h4a_spanish_templates');

commit;

select 'Spanish templates database update applied' as result;
