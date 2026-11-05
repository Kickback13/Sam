-- Housing4All Phase 4E (follow-up sequences) for Supabase project jcrjzmflepnvvvneahvs.
-- All-or-nothing (one transaction); the migration is included word for word. Additive only.

begin;

do $$ begin if to_regclass('public.outreach_sequences') is not null then raise exception 'Phase 4E already applied'; end if; end $$;

-- =============================================================================
-- Housing4All Track (Phase 4E, ADR-039): follow-up sequences.
--
--   outreach_sequences        a named series of steps (email or text), off until made active
--   outreach_sequence_steps   step N: channel, days to wait after the previous step, message
--   outreach_enrollments      a contact going through a sequence: which step is next and when
--   outreach_sequence_events  what happened at each step (sent / skipped / blocked), by whom
--
-- Steps come DUE for a person to send; nothing here sends anything. Text steps go
-- through the gated texting path (ADR-036); email steps open in the person's own
-- mail app and are then marked sent. Additive only.
-- =============================================================================

create table public.outreach_sequences (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text check (description is null or char_length(description) <= 500),
  active boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);
create index outreach_sequences_ws_idx on public.outreach_sequences (workspace_id, created_at desc);
create index outreach_sequences_created_by_idx on public.outreach_sequences (created_by);
create trigger outreach_sequences_updated_at before update on public.outreach_sequences
  for each row execute function app_private.set_updated_at();

create table public.outreach_sequence_steps (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  sequence_id uuid not null,
  position smallint not null check (position between 1 and 20),
  channel text not null check (channel in ('email', 'sms')),
  wait_days smallint not null default 0 check (wait_days between 0 and 90),
  subject text check (subject is null or char_length(subject) <= 200),
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sequence_id, position) deferrable initially deferred,
  foreign key (workspace_id, sequence_id) references public.outreach_sequences (workspace_id, id) on delete cascade,
  constraint outreach_sequence_steps_sms_length check (channel <> 'sms' or char_length(body) <= 1600)
);
create index outreach_sequence_steps_seq_idx on public.outreach_sequence_steps (workspace_id, sequence_id, position);
create trigger outreach_sequence_steps_updated_at before update on public.outreach_sequence_steps
  for each row execute function app_private.set_updated_at();

create table public.outreach_enrollments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  sequence_id uuid not null,
  contact_id uuid not null,
  status text not null default 'active' check (status in ('active', 'finished', 'stopped')),
  next_position smallint not null default 1 check (next_position between 1 and 21),
  next_due_at timestamptz not null default now(),
  stop_reason text check (stop_reason is null or char_length(stop_reason) <= 200),
  enrolled_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, sequence_id) references public.outreach_sequences (workspace_id, id) on delete cascade,
  foreign key (workspace_id, contact_id) references public.contacts (workspace_id, id) on delete cascade
);
create unique index outreach_enrollments_one_active on public.outreach_enrollments (sequence_id, contact_id) where status = 'active';
create index outreach_enrollments_due_idx on public.outreach_enrollments (workspace_id, status, next_due_at);
create index outreach_enrollments_contact_idx on public.outreach_enrollments (workspace_id, contact_id);
create index outreach_enrollments_enrolled_by_idx on public.outreach_enrollments (enrolled_by);
create trigger outreach_enrollments_updated_at before update on public.outreach_enrollments
  for each row execute function app_private.set_updated_at();

create table public.outreach_sequence_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  enrollment_id uuid not null,
  position smallint not null check (position between 1 and 20),
  channel text not null check (channel in ('email', 'sms')),
  outcome text not null check (outcome in ('sent', 'skipped', 'blocked')),
  reason text check (reason is null or char_length(reason) <= 500),
  actor_id uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (workspace_id, enrollment_id) references public.outreach_enrollments (workspace_id, id) on delete cascade
);
create index outreach_sequence_events_enr_idx on public.outreach_sequence_events (workspace_id, enrollment_id, created_at);
create index outreach_sequence_events_actor_idx on public.outreach_sequence_events (actor_id);

-- ---------------------------------------------------------------------------
-- RLS: members read; writers build sequences, enroll contacts and record steps.
-- ---------------------------------------------------------------------------
alter table public.outreach_sequences enable row level security;
alter table public.outreach_sequence_steps enable row level security;
alter table public.outreach_enrollments enable row level security;
alter table public.outreach_sequence_events enable row level security;
revoke all on public.outreach_sequences, public.outreach_sequence_steps, public.outreach_enrollments,
  public.outreach_sequence_events from anon, authenticated;
grant select, insert, update, delete on public.outreach_sequences, public.outreach_sequence_steps to authenticated;
grant select, insert on public.outreach_enrollments, public.outreach_sequence_events to authenticated;
grant update (status, next_position, next_due_at, stop_reason) on public.outreach_enrollments to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['outreach_sequences', 'outreach_sequence_steps', 'outreach_enrollments', 'outreach_sequence_events']
  loop
    execute format(
      'create policy "members read" on public.%I for select to authenticated
         using (workspace_id in (select app_private.member_workspace_ids()))', t);
  end loop;
  foreach t in array array['outreach_sequences', 'outreach_sequence_steps']
  loop
    execute format(
      'create policy "writers insert" on public.%I for insert to authenticated
         with check (workspace_id in (select app_private.writer_workspace_ids()))', t);
    execute format(
      'create policy "writers update" on public.%I for update to authenticated
         using (workspace_id in (select app_private.writer_workspace_ids()))
         with check (workspace_id in (select app_private.writer_workspace_ids()))', t);
    execute format(
      'create policy "writers delete" on public.%I for delete to authenticated
         using (workspace_id in (select app_private.writer_workspace_ids()))', t);
  end loop;
end;
$$;

create policy "writers enroll" on public.outreach_enrollments for insert to authenticated
  with check (workspace_id in (select app_private.writer_workspace_ids()) and enrolled_by = (select auth.uid()));
create policy "writers update" on public.outreach_enrollments for update to authenticated
  using (workspace_id in (select app_private.writer_workspace_ids()))
  with check (workspace_id in (select app_private.writer_workspace_ids()));
create policy "writers record" on public.outreach_sequence_events for insert to authenticated
  with check (workspace_id in (select app_private.writer_workspace_ids()) and actor_id = (select auth.uid()));

-- Do-not-contact stops every active enrollment for that contact, right away.
create or replace function app_private.outreach_enrollments_stop_on_dnc()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.dnc and not coalesce(old.dnc, false) then
    update public.outreach_enrollments
       set status = 'stopped', stop_reason = 'Marked do-not-contact'
     where workspace_id = new.workspace_id and contact_id = new.id and status = 'active';
  end if;
  return new;
end;
$$;
revoke all on function app_private.outreach_enrollments_stop_on_dnc() from public, anon, authenticated;
create trigger contacts_dnc_stops_sequences after update of dnc on public.contacts
  for each row execute function app_private.outreach_enrollments_stop_on_dnc();

-- A STOP (or any SMS suppression) stops active enrollments for that contact.
create or replace function app_private.outreach_enrollments_stop_on_sms_suppression()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.channel = 'sms' then
    update public.outreach_enrollments e
       set status = 'stopped', stop_reason = 'Texted STOP'
      from public.contacts c
     where e.workspace_id = new.workspace_id and e.status = 'active'
       and c.id = e.contact_id and c.workspace_id = new.workspace_id
       and c.phone_keys @> array[new.value];
  end if;
  return new;
end;
$$;
revoke all on function app_private.outreach_enrollments_stop_on_sms_suppression() from public, anon, authenticated;
create trigger outreach_suppressions_stop_sequences after insert on public.outreach_suppressions
  for each row execute function app_private.outreach_enrollments_stop_on_sms_suppression();

insert into supabase_migrations.schema_migrations (version, name) values
  ('20261109010000', 'h4a_sequences');

commit;

select 'Housing4All Phase 4E database update applied' as result;
