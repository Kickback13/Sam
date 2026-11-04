-- AZH Phase 8 (AZH Community) for Supabase project jcrjzmflepnvvvneahvs.
-- All-or-nothing (one transaction); the migration is included word for word.
-- Opens the Network engine to construction workspaces. Nothing is dropped; two check constraints widened.

begin;

do $$ begin if to_regprocedure('public.network_business_type(text)') is not null then raise exception 'AZH Community already applied'; end if; end $$;

-- =============================================================================
-- AZH Track (Phase 8): AZH Community — the Housing4All Network engine (Phase 6A),
-- opened to construction workspaces.
--
--   - network_context / network_brand: no longer limited to real-estate workspaces
--   - member types: + homeowner, gc, subcontractor (members and invites)
--   - accept_network_invite: those types become the matching CRM contact role; the
--     contact source / timeline text name the right community
--   - public.network_business_type(slug): which business a community belongs to, so
--     the member app can say "Projects" (AZH) or "Deals" (Housing4All)
--
-- Members still see only community data (RLS from Phase 6A is unchanged).
-- Additive: no table, column, policy or function is dropped or renamed; two check
-- constraints are widened (a superset of the old values).
-- =============================================================================

alter table public.network_members drop constraint network_members_member_type_check;
alter table public.network_members add constraint network_members_member_type_check
  check (member_type in ('investor', 'broker', 'lender', 'property_manager', 'partner', 'other',
                         'homeowner', 'gc', 'subcontractor'));
alter table public.network_invites drop constraint network_invites_member_type_check;
alter table public.network_invites add constraint network_invites_member_type_check
  check (member_type in ('investor', 'broker', 'lender', 'property_manager', 'partner', 'other',
                         'homeowner', 'gc', 'subcontractor'));

create or replace function public.network_context(p_slug text)
returns table (
  workspace_id uuid,
  workspace_name text,
  brand jsonb,
  is_staff boolean,
  can_moderate boolean,
  member_id uuid,
  display_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select w.id, w.name, w.brand,
         w.id in (select app_private.member_workspace_ids()),
         w.id in (select app_private.writer_workspace_ids()),
         m.id, m.display_name
  from public.workspaces w
  left join public.network_members m
    on m.workspace_id = w.id and m.user_id = (select auth.uid()) and m.status = 'active'
  where w.slug = p_slug
    and (m.id is not null or w.id in (select app_private.member_workspace_ids()));
$$;
revoke all on function public.network_context(text) from public;
revoke all on function public.network_context(text) from public, anon;
grant execute on function public.network_context(text) to authenticated;

create or replace function public.accept_network_invite(p_token text, p_display_name text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  inv public.network_invites;
  user_email text;
  email_key text;
  name text := btrim(coalesce(p_display_name, ''));
  ws_slug text;
  contact uuid;
  member uuid;
  first_name text;
  last_name text;
  role text;
  community text;
begin
  if uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  select * into inv from public.network_invites where token = p_token for update;
  if not found or inv.revoked_at is not null or inv.expires_at < now() then
    raise exception 'This invite isn''t valid any more. Ask for a new one.' using errcode = '22023';
  end if;
  if inv.accepted_at is not null and inv.accepted_by is distinct from uid then
    raise exception 'This invite has already been used.' using errcode = '22023';
  end if;
  select u.email into user_email from auth.users u where u.id = uid and u.email_confirmed_at is not null;
  if user_email is null then
    raise exception 'Confirm your email first' using errcode = '42501';
  end if;
  email_key := lower(btrim(user_email));
  if inv.email is not null and inv.email::text <> email_key then
    raise exception 'This invite is for a different email address.' using errcode = '42501';
  end if;
  if char_length(name) = 0 then
    name := coalesce(nullif(btrim(inv.name), ''), split_part(email_key, '@', 1));
  end if;
  name := left(name, 120);

  -- CRM contact: link the existing one with this email, or create it.
  select c.id into contact from public.contacts c
   where c.workspace_id = inv.workspace_id and c.deleted_at is null and email_key = any (c.email_keys)
   order by c.created_at limit 1;
  -- Member type → CRM role (contact roles share these names; 'partner'/'other' add none).
  role := case when inv.member_type in ('investor', 'broker', 'lender', 'property_manager',
                                        'homeowner', 'gc', 'subcontractor')
               then inv.member_type else null end;
  select w.slug, case when w.business_type = 'construction' then w.name || ' Community'
                      else 'Housing4All Network' end
    into ws_slug, community
    from public.workspaces w where w.id = inv.workspace_id;
  if contact is null then
    first_name := split_part(name, ' ', 1);
    last_name := nullif(btrim(substr(name, char_length(first_name) + 1)), '');
    insert into public.contacts (workspace_id, first_name, last_name, emails, roles, tags, source, created_by)
    values (inv.workspace_id, left(first_name, 100), left(last_name, 100),
            jsonb_build_array(jsonb_build_object('value', email_key, 'label', 'personal', 'is_primary', true)),
            case when role is null then '{}'::text[] else array[role] end,
            array['network'], left(community, 100), uid)
    returning id into contact;
  else
    update public.contacts
       set tags = case when 'network' = any (tags) then tags else array_append(tags, 'network') end,
           roles = case when role is null or role = any (roles) then roles else array_append(roles, role) end
     where id = contact;
  end if;

  insert into public.network_members (workspace_id, user_id, contact_id, display_name, member_type, status, joined_at)
  values (inv.workspace_id, uid, contact, name, inv.member_type, 'active', now())
  on conflict (workspace_id, user_id) do update
    set status = 'active', contact_id = coalesce(public.network_members.contact_id, excluded.contact_id),
        member_type = excluded.member_type
  returning id into member;

  update public.network_invites set accepted_at = coalesce(accepted_at, now()), accepted_by = uid where id = inv.id;

  insert into public.activities (workspace_id, type, subject_type, subject_id, body, metadata, created_by)
  values (inv.workspace_id, 'system', 'contact', contact, 'Joined the ' || community,
          jsonb_build_object('kind', 'network_join', 'member_id', member, 'invite_id', inv.id), uid);
  insert into public.audit_log (workspace_id, actor_id, action, entity_type, entity_id, diff)
  values (inv.workspace_id, uid, 'network.joined', 'network_member', member,
          jsonb_build_object('contact_id', contact, 'invite_id', inv.id));

  return ws_slug;
end;
$$;
revoke all on function public.accept_network_invite(text, text) from public;
grant execute on function public.accept_network_invite(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Install metadata (anon): browsers fetch the web-app manifest and icons
revoke all on function public.accept_network_invite(text, text) from public;
grant execute on function public.accept_network_invite(text, text) to authenticated;

create or replace function public.network_brand(p_slug text)
returns table (workspace_name text, brand jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select w.name, w.brand from public.workspaces w where w.slug = p_slug;
$$;
revoke all on function public.network_brand(text) from public;
grant execute on function public.network_brand(text) to anon, authenticated;

-- Which business a community belongs to (only the type: nothing private).
create or replace function public.network_business_type(p_slug text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select w.business_type::text from public.workspaces w where w.slug = p_slug;
$$;
revoke all on function public.network_business_type(text) from public;
grant execute on function public.network_business_type(text) to anon, authenticated;

insert into supabase_migrations.schema_migrations (version, name) values
  ('20261104010000', 'azh_community');

commit;

select 'AZH Community database update applied' as result;
