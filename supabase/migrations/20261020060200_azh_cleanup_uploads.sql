-- =============================================================================
-- AZH follow-up A3: admin-only cleanup of public-form photos that were uploaded
-- but never attached to a submitted request (AZH-014). No scheduled job — an
-- admin presses "Clean up unused uploads" in Settings → AZH.
-- The listing runs as the caller (RLS applies); the app then deletes the files
-- through the Storage API so both the object rows and the files go.
-- =============================================================================

create or replace function public.azh_unused_intake_photos(p_workspace_id uuid)
returns table (name text)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_workspace_id not in (select app_private.admin_workspace_ids()) then
    raise exception 'Only owners and admins can clean up uploads' using errcode = '42501';
  end if;
  return query
  select o.name
  from storage.objects o
  where o.bucket_id = 'azh-intake'
    and o.name like p_workspace_id::text || '/%'
    and o.created_at < now() - interval '24 hours'
    and not exists (
      select 1 from public.azh_requests r
      where r.workspace_id = p_workspace_id and o.name = any (r.photo_paths)
    )
  order by o.created_at
  limit 1000;
end;
$$;
revoke all on function public.azh_unused_intake_photos(uuid) from public, anon;
grant execute on function public.azh_unused_intake_photos(uuid) to authenticated;

-- Admins may prune old upload tickets (kept ≥ 24 h for rate limiting).
create policy "admins delete" on public.azh_upload_tickets for delete to authenticated
  using (workspace_id in (select app_private.admin_workspace_ids()) and created_at < now() - interval '24 hours');
grant delete on public.azh_upload_tickets to authenticated;
