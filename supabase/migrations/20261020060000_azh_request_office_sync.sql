-- =============================================================================
-- AZH follow-up A2: when a request's office changes, its linked project's
-- office follows, and the change is logged on the project timeline.
-- A trigger (not app code) so every path — inbox, future GHL sync — is covered.
-- SECURITY DEFINER only to write the `system` activity (users can't insert
-- system activities directly); the request update itself already passed RLS.
-- =============================================================================

create or replace function app_private.azh_requests_office_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  label text;
  old_label text;
  prev text;
begin
  if new.deal_id is null or new.office is not distinct from old.office then
    return null;
  end if;

  select p.office into prev from public.azh_projects p where p.deal_id = new.deal_id;
  if not found or prev is not distinct from new.office then
    return null;
  end if;

  update public.azh_projects set office = new.office where deal_id = new.deal_id;

  label := case new.office when 'fallbrook' then 'Fallbrook' else 'San Diego' end;
  old_label := case prev when 'fallbrook' then 'Fallbrook' when 'san_diego' then 'San Diego' else 'no office' end;
  insert into public.activities (workspace_id, type, subject_type, subject_id, body, metadata, created_by)
  values (
    new.workspace_id, 'system', 'deal', new.deal_id,
    'Office changed from ' || old_label || ' to ' || label || ' (from the request)',
    jsonb_build_object('event', 'azh_office_changed', 'request_id', new.id, 'from', prev, 'to', new.office),
    auth.uid()
  );
  return null;
end;
$$;
revoke all on function app_private.azh_requests_office_sync() from public, anon, authenticated;

create trigger azh_requests_office_sync
  after update of office on public.azh_requests
  for each row execute function app_private.azh_requests_office_sync();
