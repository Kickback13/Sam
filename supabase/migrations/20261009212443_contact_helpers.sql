-- =============================================================================
-- Contact helpers: filter facets and atomic bulk tagging (SECURITY INVOKER → RLS applies).
-- =============================================================================
create or replace function public.contact_facets(p_workspace_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'tags', coalesce((
      select jsonb_agg(jsonb_build_object('value', t.tag, 'count', t.n) order by t.n desc, t.tag)
      from (
        select tag, count(*) as n
        from public.contacts c, unnest(c.tags) as tag
        where c.workspace_id = p_workspace_id and c.deleted_at is null
        group by tag
        order by n desc, tag
        limit 200
      ) t
    ), '[]'::jsonb),
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object('value', s.source, 'count', s.n) order by s.n desc, s.source)
      from (
        select source, count(*) as n
        from public.contacts
        where workspace_id = p_workspace_id and deleted_at is null and source is not null
        group by source
        order by n desc, source
        limit 100
      ) s
    ), '[]'::jsonb)
  );
$$;
grant execute on function public.contact_facets(uuid) to authenticated;

create or replace function public.contacts_bulk_tag(
  p_workspace_id uuid, p_contact_ids uuid[], p_add text[], p_remove text[]
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  n integer;
begin
  update public.contacts c
  set tags = coalesce((
    select array_agg(distinct t order by t)
    from unnest(c.tags || coalesce(p_add, '{}')) as t
    where t <> all (coalesce(p_remove, '{}'))
  ), '{}')
  where c.workspace_id = p_workspace_id
    and c.id = any (p_contact_ids)
    and c.deleted_at is null;
  get diagnostics n = row_count;
  return n;
end;
$$;
grant execute on function public.contacts_bulk_tag(uuid, uuid[], text[], text[]) to authenticated;
