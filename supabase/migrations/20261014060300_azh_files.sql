-- =============================================================================
-- AZH Track: project / request files (photos, PDFs, documents, receipts).
-- Storage bucket "azh-files" (private, 10 MB, file-type allow-list) with
-- workspace RLS: object names start with the workspace id.
--   <workspace_id>/<random uuid>/<sanitized file name>
-- =============================================================================

create table public.azh_files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  deal_id uuid,
  request_id uuid,
  path text not null unique check (char_length(path) <= 400),
  name text not null check (char_length(name) between 1 and 200),
  mime_type text not null check (char_length(mime_type) <= 100),
  size_bytes integer not null check (size_bytes between 0 and 10485760),
  kind text not null default 'document' check (kind in ('photo', 'document', 'receipt')),
  uploaded_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, deal_id) references public.deals (workspace_id, id) on delete cascade,
  foreign key (workspace_id, request_id) references public.azh_requests (workspace_id, id) on delete cascade,
  constraint azh_files_has_parent check (deal_id is not null or request_id is not null),
  constraint azh_files_path_in_workspace check (path like workspace_id::text || '/%')
);
comment on table public.azh_files is 'Metadata for objects in the azh-files bucket, attached to a project (deal) or a request.';
create index azh_files_deal_idx on public.azh_files (workspace_id, deal_id, created_at desc);
create index azh_files_request_idx on public.azh_files (workspace_id, request_id, created_at desc);
create index azh_files_uploaded_by_idx on public.azh_files (uploaded_by);

alter table public.azh_files enable row level security;
revoke all on public.azh_files from anon;
grant select, insert, update, delete on public.azh_files to authenticated;

create policy "members read" on public.azh_files for select to authenticated
  using (workspace_id in (select app_private.member_workspace_ids()));
create policy "writers insert" on public.azh_files for insert to authenticated
  with check (workspace_id in (select app_private.writer_workspace_ids()) and uploaded_by = (select auth.uid()));
create policy "writers update" on public.azh_files for update to authenticated
  using (workspace_id in (select app_private.writer_workspace_ids()))
  with check (workspace_id in (select app_private.writer_workspace_ids()));
create policy "writers delete" on public.azh_files for delete to authenticated
  using (workspace_id in (select app_private.writer_workspace_ids()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'azh-files', 'azh-files', false, 10485760,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv'
  ]
)
on conflict (id) do nothing;

create policy "azh files: members read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'azh-files'
    and (storage.foldername(name))[1] in (select m::text from app_private.member_workspace_ids() m)
  );

create policy "azh files: writers upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'azh-files'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]{1,200}$'
    and (storage.foldername(name))[1] in (select m::text from app_private.writer_workspace_ids() m)
  );

create policy "azh files: writers delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'azh-files'
    and (storage.foldername(name))[1] in (select m::text from app_private.writer_workspace_ids() m)
  );
