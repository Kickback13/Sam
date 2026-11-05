-- Reports (ADR-038) for Supabase project jcrjzmflepnvvvneahvs. One function, no tables. Additive only.

begin;

do $$ begin if to_regprocedure('public.report_summary(uuid, integer)') is not null then raise exception 'Reports already applied'; end if; end $$;

-- =============================================================================
-- Reports (Phase 9, ADR-038): one read-only summary per workspace and period.
--
--   public.report_summary(ws, days)  → jsonb
--
-- SECURITY INVOKER: it runs with the caller's own rights, so row-level security
-- decides what is counted (a member sees their workspace; anyone else gets zeros).
-- No new tables, nothing stored. Weeks start Monday in Pacific time.
-- Additive only.
-- =============================================================================

create or replace function public.report_summary(p_workspace_id uuid, p_days integer default 90)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  tz constant text := 'America/Los_Angeles';
  days integer := least(greatest(coalesce(p_days, 90), 7), 365);
  since timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 90), 7), 365));
  week0 date := (date_trunc('week', (now() - make_interval(days => least(greatest(coalesce(p_days, 90), 7), 365))) at time zone 'America/Los_Angeles'))::date;
  out jsonb;
begin
  if p_workspace_id not in (select app_private.member_workspace_ids()) then
    raise exception 'Not a member of this workspace' using errcode = '42501';
  end if;

  with weeks as (
    select g::date as wk from generate_series(week0, (date_trunc('week', now() at time zone tz))::date, interval '7 days') g
  ),
  wk_contacts as (
    select (date_trunc('week', c.created_at at time zone tz))::date wk, count(*) n
    from public.contacts c
    where c.workspace_id = p_workspace_id and c.deleted_at is null and c.created_at >= since
    group by 1
  ),
  wk_deals as (
    select (date_trunc('week', d.created_at at time zone tz))::date wk, count(*) n
    from public.deals d
    where d.workspace_id = p_workspace_id and d.deleted_at is null and d.created_at >= since
    group by 1
  ),
  wk_acts as (
    select (date_trunc('week', a.occurred_at at time zone tz))::date wk,
           count(*) filter (where a.type = 'call') calls,
           count(*) filter (where a.type = 'sms') texts,
           count(*) filter (where a.type = 'meeting') meetings,
           count(*) filter (where a.type = 'note') notes,
           count(*) filter (where a.type = 'email') emails
    from public.activities a
    where a.workspace_id = p_workspace_id and a.occurred_at >= since and a.occurred_at <= now()
    group by 1
  ),
  wk_listings as (
    select (date_trunc('week', l.received_at at time zone tz))::date wk, count(*) n
    from public.h4a_listings l
    where l.workspace_id = p_workspace_id and l.received_at >= since
    group by 1
  ),
  wk_requests as (
    select (date_trunc('week', r.submitted_at at time zone tz))::date wk, count(*) n
    from public.azh_requests r
    where r.workspace_id = p_workspace_id and r.submitted_at >= since
    group by 1
  ),
  wk_bookings as (
    select (date_trunc('week', b.created_at at time zone tz))::date wk, count(*) n
    from public.bookings b
    where b.workspace_id = p_workspace_id and b.kind = 'meeting' and b.created_at >= since
    group by 1
  ),
  stages as (
    select s.id, s.name, s.color, s.position, s.is_won, s.is_lost, p.name pipeline, p.position ppos,
           count(d.id) filter (where d.status = 'open') open_count,
           coalesce(sum(coalesce(d.value, d.asking_price)) filter (where d.status = 'open'), 0) open_value
    from public.pipeline_stages s
    join public.pipelines p on p.id = s.pipeline_id
    left join public.deals d on d.stage_id = s.id and d.deleted_at is null
    where s.workspace_id = p_workspace_id
    group by s.id, p.name, p.position
  ),
  closed as (
    select count(*) filter (where d.status = 'won') won,
           coalesce(sum(coalesce(d.value, d.asking_price)) filter (where d.status = 'won'), 0) won_value,
           count(*) filter (where d.status = 'lost') lost
    from public.deals d
    where d.workspace_id = p_workspace_id and d.deleted_at is null
      and d.status in ('won', 'lost') and d.closed_at >= since
  ),
  lost_reasons as (
    select coalesce(nullif(btrim(d.lost_reason), ''), 'No reason given') reason, count(*) n
    from public.deals d
    where d.workspace_id = p_workspace_id and d.deleted_at is null and d.status = 'lost' and d.closed_at >= since
    group by 1 order by 2 desc, 1 limit 5
  )
  select jsonb_build_object(
    'days', days,
    'since', since,
    'generated_at', now(),
    'weeks', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'week', w.wk,
        'contacts', coalesce(c.n, 0),
        'deals', coalesce(d.n, 0),
        'calls', coalesce(a.calls, 0),
        'texts', coalesce(a.texts, 0),
        'meetings', coalesce(a.meetings, 0),
        'notes', coalesce(a.notes, 0),
        'emails', coalesce(a.emails, 0),
        'listings', coalesce(l.n, 0),
        'requests', coalesce(r.n, 0),
        'bookings', coalesce(b.n, 0)
      ) order by w.wk), '[]'::jsonb)
      from weeks w
      left join wk_contacts c on c.wk = w.wk
      left join wk_deals d on d.wk = w.wk
      left join wk_acts a on a.wk = w.wk
      left join wk_listings l on l.wk = w.wk
      left join wk_requests r on r.wk = w.wk
      left join wk_bookings b on b.wk = w.wk
    ),
    'stages', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'color', s.color, 'pipeline', s.pipeline,
        'is_won', s.is_won, 'is_lost', s.is_lost,
        'open_count', s.open_count, 'open_value', s.open_value
      ) order by s.ppos, s.pipeline, s.position), '[]'::jsonb)
      from stages s
    ),
    'closed', (select to_jsonb(c) from closed c),
    'lost_reasons', (select coalesce(jsonb_agg(to_jsonb(lr)), '[]'::jsonb) from lost_reasons lr),
    'tasks', (
      select jsonb_build_object(
        'done', count(*) filter (where t.status = 'done' and t.completed_at >= since),
        'open', count(*) filter (where t.status = 'open'),
        'overdue', count(*) filter (where t.status = 'open' and t.due_at < now())
      )
      from public.tasks t where t.workspace_id = p_workspace_id
    ),
    'listings', (
      select jsonb_build_object(
        'received', count(*),
        'promoted', count(*) filter (where l.status = 'promoted'),
        'dismissed', count(*) filter (where l.status = 'dismissed'),
        'verified', count(*) filter (where l.verification_status = 'verified')
      )
      from public.h4a_listings l where l.workspace_id = p_workspace_id and l.received_at >= since
    ),
    'alerts', (
      select count(*) from public.h4a_alerts x where x.workspace_id = p_workspace_id and x.created_at >= since
    ),
    'bookings', (
      select jsonb_build_object(
        'booked', count(*),
        'completed', count(*) filter (where b.status = 'completed'),
        'no_show', count(*) filter (where b.status = 'no_show'),
        'canceled', count(*) filter (where b.status = 'canceled'),
        'online', count(*) filter (where b.source = 'booking_page')
      )
      from public.bookings b
      where b.workspace_id = p_workspace_id and b.kind = 'meeting' and b.created_at >= since
    ),
    'requests', (
      select coalesce(jsonb_agg(jsonb_build_object('office', q.office, 'status', q.status, 'n', q.n)
                                order by q.office, q.status), '[]'::jsonb)
      from (
        select r.office, r.status, count(*) n
        from public.azh_requests r
        where r.workspace_id = p_workspace_id and r.submitted_at >= since
        group by 1, 2
      ) q
    ),
    'estimates', (
      select jsonb_build_object(
        'sent', count(*) filter (where e.sent_on >= (since at time zone tz)::date),
        'sent_value', coalesce(sum(e.total) filter (where e.sent_on >= (since at time zone tz)::date), 0),
        'accepted', count(*) filter (where e.accepted_on >= (since at time zone tz)::date),
        'accepted_value', coalesce(sum(e.total) filter (where e.accepted_on >= (since at time zone tz)::date), 0),
        'declined', count(*) filter (where e.declined_on >= (since at time zone tz)::date)
      )
      from public.azh_estimates e where e.workspace_id = p_workspace_id
    ),
    'texts', (
      select jsonb_build_object(
        'sent', count(*) filter (where m.direction = 'out' and m.status in ('sent', 'delivered')),
        'received', count(*) filter (where m.direction = 'in'),
        'blocked', count(*) filter (where m.status = 'blocked')
      )
      from public.sms_messages m where m.workspace_id = p_workspace_id and m.created_at >= since
    )
  ) into out;

  return out;
end;
$$;

revoke all on function public.report_summary(uuid, integer) from public, anon;
grant execute on function public.report_summary(uuid, integer) to authenticated;

insert into supabase_migrations.schema_migrations (version, name) values
  ('20261108010000', 'h4a_reports');

commit;

select 'Reports database update applied' as result;
