-- =============================================================================
-- Network / Community photos (ADR-040): up to 4 photos on a post.
--
--   network_posts.photo_paths   object names in the private `network-photos` bucket
--   bucket network-photos       private, images only, 5 MB each
--   path rule                   <workspace id>/<uploader user id>/<random uuid>.<ext>
--
-- Who can upload: the team (writers) and active community members, only into their
-- own folder. Who can see: the team and the community's active members.
-- The database checks every path on a post: right workspace, the poster's own folder,
-- the file exists, at most 4. Additive only.
-- =============================================================================

alter table public.network_posts
  add column photo_paths text[] not null default '{}' check (cardinality(photo_paths) <= 4);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('network-photos', 'network-photos', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "network photos: community reads" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'network-photos'
    and (
      (storage.foldername(name))[1] in (select m::text from app_private.member_workspace_ids() m)
      or (storage.foldername(name))[1] in (select m::text from app_private.network_workspace_ids() m)
    )
  );

create policy "network photos: upload to own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'network-photos'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and (
      (storage.foldername(name))[1] in (select m::text from app_private.writer_workspace_ids() m)
      or (storage.foldername(name))[1] in (select m::text from app_private.network_workspace_ids() m)
    )
  );

create policy "network photos: owner or team deletes" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'network-photos'
    and (
      (storage.foldername(name))[2] = (select auth.uid())::text
      or (storage.foldername(name))[1] in (select m::text from app_private.writer_workspace_ids() m)
    )
  );

-- Storage lookup for the guard (the caller can't read other people's objects directly).
create or replace function app_private.network_photo_exists(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from storage.objects o where o.bucket_id = 'network-photos' and o.name = p_path);
$$;
revoke all on function app_private.network_photo_exists(text) from public, anon;
grant execute on function app_private.network_photo_exists(text) to authenticated;

-- Runs as the caller (not SECURITY DEFINER) so current_user tells app users from the owner.
create or replace function app_private.network_posts_photos_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  p text;
  prefix text;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.photo_paths is not distinct from old.photo_paths then
    return new;
  end if;
  prefix := new.workspace_id::text || '/' || coalesce(auth.uid()::text, '-') || '/';
  foreach p in array new.photo_paths loop
    -- Photos already on the post may stay; new ones must be the poster's own uploads.
    if tg_op = 'UPDATE' and p = any (old.photo_paths) then
      continue;
    end if;
    if left(p, char_length(prefix)) <> prefix
       or p !~ '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
       or not app_private.network_photo_exists(p) then
      raise exception 'A photo is missing or invalid. Please attach it again.' using errcode = '22023';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function app_private.network_posts_photos_guard() from public, anon;
create trigger network_posts_photos_guard before insert or update of photo_paths on public.network_posts
  for each row execute function app_private.network_posts_photos_guard();
