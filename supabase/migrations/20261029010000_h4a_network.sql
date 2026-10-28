-- =============================================================================
-- Housing4All Track (Phase 6A): the Housing4All Network — an invite-only
-- community app for investors and partners (/n/<workspace-slug>).
--
--   network_members   people in the community (their own login), linked to a CRM contact
--   network_invites   invite links staff hand out
--   network_posts     feed: updates and deal posts (by staff or members)
--   network_comments  comments on posts
--   network_events    events (meetups, webinars, open houses)
--   network_rsvps     who's going
--
--   public.network_context(slug)            what the member app needs to render (members + staff)
--   public.get_network_invite(token)        invite page (anon)
--   public.accept_network_invite(token, name)  join: creates the member + links/creates the CRM contact
--
-- Network members are NOT workspace members: they never appear in
-- workspace_members, so every CRM table's existing RLS gives them nothing.
-- They read only network_* rows, through app_private.network_workspace_ids().
-- Staff (workspace members) read everything; writers manage it.
--
-- Additive only: no existing table, column, policy or function changes.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Members
-- ---------------------------------------------------------------------------
create table public.network_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  contact_id uuid,
  display_name text not null check (char_length(display_name) between 1 and 120),
  headline text check (headline is null or char_length(headline) <= 160),
  bio text check (bio is null or char_length(bio) <= 2000),
  city text check (city is null or char_length(city) <= 100),
  member_type text not null default 'investor'
    check (member_type in ('investor', 'broker', 'lender', 'property_manager', 'partner', 'other')),
  -- Segments (staff-managed): used to target broadcasts.
  tags text[] not null default '{}' check (cardinality(tags) <= 30),
  show_in_directory boolean not null default true,
  -- Contact details a member CHOOSES to show other members (the CRM keeps the real ones).
  public_email extensions.citext
    check (public_email is null or (char_length(public_email) <= 254 and public_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  public_phone text check (public_phone is null or char_length(public_phone) <= 40),
  status text not null default 'active' check (status in ('active', 'removed')),
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, user_id),
  foreign key (workspace_id, contact_id)
    references public.contacts (workspace_id, id) on delete set null (contact_id)
);
comment on table public.network_members is
  'Housing4All Network members (own login, community access only). contact_id links the CRM contact.';
create index network_members_user_idx on public.network_members (user_id, status);
create index network_members_contact_idx on public.network_members (workspace_id, contact_id);
create trigger network_members_updated_at before update on public.network_members
  for each row execute function app_private.set_updated_at();

-- Workspaces where the current user is an active network member.
create or replace function app_private.network_workspace_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select workspace_id from public.network_members
  where user_id = (select auth.uid()) and status = 'active';
$$;
revoke all on function app_private.network_workspace_ids() from public;
grant execute on function app_private.network_workspace_ids() to authenticated;

-- Members may edit their own profile, but only staff change type, segments, status or links.
create or replace function app_private.network_members_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Trusted code (the join function, migrations) runs as the table owner, not as an app user.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.workspace_id in (select app_private.writer_workspace_ids()) then
    return new;
  end if;
  if new.user_id is distinct from old.user_id
     or new.workspace_id is distinct from old.workspace_id
     or new.contact_id is distinct from old.contact_id
     or new.member_type is distinct from old.member_type
     or new.tags is distinct from old.tags
     or new.status is distinct from old.status
     or new.joined_at is distinct from old.joined_at then
    raise exception 'Only the team can change that' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger network_members_guard before update on public.network_members
  for each row execute function app_private.network_members_guard();

-- ---------------------------------------------------------------------------
-- Invites (staff hand out the link; email sending comes with Resend)
-- ---------------------------------------------------------------------------
create table public.network_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email extensions.citext check (email is null or (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  name text check (name is null or char_length(name) <= 120),
  member_type text not null default 'investor'
    check (member_type in ('investor', 'broker', 'lender', 'property_manager', 'partner', 'other')),
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  expires_at timestamptz not null default (now() + interval '30 days'),
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  invited_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index network_invites_ws_idx on public.network_invites (workspace_id, created_at desc);
create index network_invites_accepted_by_idx on public.network_invites (accepted_by);
create index network_invites_invited_by_idx on public.network_invites (invited_by);

-- ---------------------------------------------------------------------------
-- Feed: updates and deal posts. Deal numbers are the poster's own (shown as
-- "Posted by …"), never presented as verified data.
-- ---------------------------------------------------------------------------
create table public.network_posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  author_user_id uuid references public.profiles (id) on delete set null default auth.uid(),
  author_member_id uuid,
  kind text not null default 'update' check (kind in ('update', 'deal')),
  title text not null check (char_length(title) between 1 and 200),
  body text not null default '' check (char_length(body) <= 10000),
  property_type text check (property_type is null or char_length(property_type) <= 40),
  units integer check (units is null or units between 1 and 100000),
  price numeric(14, 2) check (price is null or price > 0),
  city text check (city is null or char_length(city) <= 100),
  zip text check (zip is null or char_length(zip) <= 20),
  link text check (link is null or (char_length(link) <= 2048 and link ~* '^https?://')),
  pinned boolean not null default false,
  hidden_at timestamptz,
  hidden_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, author_member_id)
    references public.network_members (workspace_id, id) on delete set null (author_member_id)
);
create index network_posts_feed_idx on public.network_posts (workspace_id, pinned desc, created_at desc);
create index network_posts_author_idx on public.network_posts (author_user_id);
create index network_posts_member_idx on public.network_posts (workspace_id, author_member_id);
create index network_posts_hidden_by_idx on public.network_posts (hidden_by);
create trigger network_posts_updated_at before update on public.network_posts
  for each row execute function app_private.set_updated_at();

-- Authorship is set by the database: a member posts as themselves; staff post as the business.
-- Only staff can pin or hide.
create or replace function app_private.network_posts_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  staff boolean := new.workspace_id in (select app_private.writer_workspace_ids());
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.author_user_id := auth.uid();
    if staff then
      new.author_member_id := null;
    else
      select m.id into new.author_member_id from public.network_members m
       where m.workspace_id = new.workspace_id and m.user_id = auth.uid() and m.status = 'active';
      new.pinned := false;
      new.hidden_at := null;
      new.hidden_by := null;
    end if;
  elsif not staff then
    if new.pinned is distinct from old.pinned or new.hidden_at is distinct from old.hidden_at
       or new.hidden_by is distinct from old.hidden_by or new.author_user_id is distinct from old.author_user_id
       or new.author_member_id is distinct from old.author_member_id then
      raise exception 'Only the team can pin, hide or reassign posts' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger network_posts_guard before insert or update on public.network_posts
  for each row execute function app_private.network_posts_guard();

create table public.network_comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  post_id uuid not null,
  author_user_id uuid references public.profiles (id) on delete set null default auth.uid(),
  -- Set by the database: the member who wrote it, or null for the team.
  author_member_id uuid,
  body text not null check (char_length(body) between 1 and 2000),
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, post_id) references public.network_posts (workspace_id, id) on delete cascade,
  foreign key (workspace_id, author_member_id)
    references public.network_members (workspace_id, id) on delete set null (author_member_id)
);
create index network_comments_member_idx on public.network_comments (workspace_id, author_member_id);
create index network_comments_post_idx on public.network_comments (workspace_id, post_id, created_at);
create index network_comments_author_idx on public.network_comments (author_user_id);

create or replace function app_private.network_comments_author()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  new.author_user_id := auth.uid();
  if new.workspace_id in (select app_private.writer_workspace_ids()) then
    new.author_member_id := null;
  else
    select m.id into new.author_member_id from public.network_members m
     where m.workspace_id = new.workspace_id and m.user_id = auth.uid() and m.status = 'active';
    new.hidden_at := null;
  end if;
  return new;
end;
$$;
create trigger network_comments_author before insert on public.network_comments
  for each row execute function app_private.network_comments_author();

-- ---------------------------------------------------------------------------
-- Events + RSVPs
-- ---------------------------------------------------------------------------
create table public.network_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '' check (char_length(description) <= 5000),
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text check (location is null or char_length(location) <= 300),
  url text check (url is null or (char_length(url) <= 2048 and url ~* '^https?://')),
  canceled_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  constraint network_events_order check (ends_at is null or ends_at >= starts_at)
);
create index network_events_ws_idx on public.network_events (workspace_id, starts_at);
create index network_events_created_by_idx on public.network_events (created_by);
create trigger network_events_updated_at before update on public.network_events
  for each row execute function app_private.set_updated_at();

create table public.network_rsvps (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  event_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  status text not null default 'going' check (status in ('going', 'not_going')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id),
  foreign key (workspace_id, event_id) references public.network_events (workspace_id, id) on delete cascade
);
create index network_rsvps_ws_idx on public.network_rsvps (workspace_id, event_id);
create index network_rsvps_user_idx on public.network_rsvps (user_id);
create trigger network_rsvps_updated_at before update on public.network_rsvps
  for each row execute function app_private.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.network_members enable row level security;
alter table public.network_invites enable row level security;
alter table public.network_posts enable row level security;
alter table public.network_comments enable row level security;
alter table public.network_events enable row level security;
alter table public.network_rsvps enable row level security;

revoke all on public.network_members, public.network_invites, public.network_posts,
  public.network_comments, public.network_events, public.network_rsvps from anon, authenticated;
grant select, update on public.network_members to authenticated;
grant select, insert, update on public.network_invites to authenticated;
grant select, insert, update, delete on public.network_posts, public.network_comments,
  public.network_events, public.network_rsvps to authenticated;

-- Members: staff read all; members read active members who list themselves (and themselves).
create policy "staff read" on public.network_members for select to authenticated
  using (workspace_id in (select app_private.member_workspace_ids()));
create policy "members read directory" on public.network_members for select to authenticated
  using (
    workspace_id in (select app_private.network_workspace_ids())
    and status = 'active'
    and (show_in_directory or user_id = (select auth.uid()))
  );
create policy "staff update" on public.network_members for update to authenticated
  using (workspace_id in (select app_private.writer_workspace_ids()))
  with check (workspace_id in (select app_private.writer_workspace_ids()));
create policy "members update own profile" on public.network_members for update to authenticated
  using (user_id = (select auth.uid()) and workspace_id in (select app_private.network_workspace_ids()))
  with check (user_id = (select auth.uid()));

-- Invites: staff only.
create policy "staff read" on public.network_invites for select to authenticated
  using (workspace_id in (select app_private.member_workspace_ids()));
create policy "writers insert" on public.network_invites for insert to authenticated
  with check (workspace_id in (select app_private.writer_workspace_ids()));
create policy "writers update" on public.network_invites for update to authenticated
  using (workspace_id in (select app_private.writer_workspace_ids()))
  with check (workspace_id in (select app_private.writer_workspace_ids()));

-- Posts: staff see everything; members see posts that aren't hidden (plus their own).
create policy "staff read" on public.network_posts for select to authenticated
  using (workspace_id in (select app_private.member_workspace_ids()));
create policy "members read" on public.network_posts for select to authenticated
  using (
    workspace_id in (select app_private.network_workspace_ids())
    and (hidden_at is null or author_user_id = (select auth.uid()))
  );
create policy "staff or members post" on public.network_posts for insert to authenticated
  with check (
    workspace_id in (select app_private.writer_workspace_ids())
    or workspace_id in (select app_private.network_workspace_ids())
  );
create policy "staff update" on public.network_posts for update to authenticated
  using (workspace_id in (select app_private.writer_workspace_ids()))
  with check (workspace_id in (select app_private.writer_workspace_ids()));
create policy "authors update own" on public.network_posts for update to authenticated
  using (author_user_id = (select auth.uid()) and workspace_id in (select app_private.network_workspace_ids()))
  with check (author_user_id = (select auth.uid()));
create policy "staff delete" on public.network_posts for delete to authenticated
  using (workspace_id in (select app_private.writer_workspace_ids()));
create policy "authors delete own" on public.network_posts for delete to authenticated
  using (author_user_id = (select auth.uid()) and workspace_id in (select app_private.network_workspace_ids()));

-- Comments: same shape as posts.
create policy "staff read" on public.network_comments for select to authenticated
  using (workspace_id in (select app_private.member_workspace_ids()));
create policy "members read" on public.network_comments for select to authenticated
  using (
    workspace_id in (select app_private.network_workspace_ids())
    and (hidden_at is null or author_user_id = (select auth.uid()))
    and exists (select 1 from public.network_posts p where p.id = post_id and p.hidden_at is null)
  );
create policy "staff or members comment" on public.network_comments for insert to authenticated
  with check (
    workspace_id in (select app_private.writer_workspace_ids())
    or (
      workspace_id in (select app_private.network_workspace_ids())
      and exists (select 1 from public.network_posts p where p.id = post_id and p.hidden_at is null)
    )
  );
create policy "staff update" on public.network_comments for update to authenticated
  using (workspace_id in (select app_private.writer_workspace_ids()))
  with check (workspace_id in (select app_private.writer_workspace_ids()));
create policy "staff delete" on public.network_comments for delete to authenticated
  using (workspace_id in (select app_private.writer_workspace_ids()));
create policy "authors delete own" on public.network_comments for delete to authenticated
  using (author_user_id = (select auth.uid()) and workspace_id in (select app_private.network_workspace_ids()));

-- Events: staff manage; members read.
create policy "staff read" on public.network_events for select to authenticated
  using (workspace_id in (select app_private.member_workspace_ids()));
create policy "members read" on public.network_events for select to authenticated
  using (workspace_id in (select app_private.network_workspace_ids()));
create policy "writers insert" on public.network_events for insert to authenticated
  with check (workspace_id in (select app_private.writer_workspace_ids()));
create policy "writers update" on public.network_events for update to authenticated
  using (workspace_id in (select app_private.writer_workspace_ids()))
  with check (workspace_id in (select app_private.writer_workspace_ids()));
create policy "writers delete" on public.network_events for delete to authenticated
  using (workspace_id in (select app_private.writer_workspace_ids()));

-- RSVPs: everyone in the community sees who's going; each person manages their own.
create policy "staff read" on public.network_rsvps for select to authenticated
  using (workspace_id in (select app_private.member_workspace_ids()));
create policy "members read" on public.network_rsvps for select to authenticated
  using (workspace_id in (select app_private.network_workspace_ids()));
create policy "members rsvp" on public.network_rsvps for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (workspace_id in (select app_private.network_workspace_ids())
         or workspace_id in (select app_private.member_workspace_ids()))
  );
create policy "own rsvp update" on public.network_rsvps for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "own rsvp delete" on public.network_rsvps for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Member app context: only for active members and the workspace's own staff.
-- Members can't read `workspaces`, so this returns the display bits they need.
-- ---------------------------------------------------------------------------
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
  where w.slug = p_slug and w.business_type = 'real_estate'
    and (m.id is not null or w.id in (select app_private.member_workspace_ids()));
$$;
revoke all on function public.network_context(text) from public;
grant execute on function public.network_context(text) to authenticated;

-- Workspaces where the current user is a network member (the home page sends them there).
create or replace function public.my_networks()
returns table (slug text, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select w.slug, w.name from public.network_members m
  join public.workspaces w on w.id = m.workspace_id
  where m.user_id = (select auth.uid()) and m.status = 'active'
  order by m.joined_at;
$$;
revoke all on function public.my_networks() from public;
grant execute on function public.my_networks() to authenticated;

-- ---------------------------------------------------------------------------
-- Invite page (anon) and join.
-- ---------------------------------------------------------------------------
create or replace function public.get_network_invite(p_token text)
returns table (workspace_name text, workspace_slug text, invited_name text, email_hint text,
               is_email_bound boolean, status text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  inv public.network_invites;
  local_part text;
begin
  select * into inv from public.network_invites where token = p_token;
  if not found then
    return;
  end if;
  if inv.email is not null then
    local_part := split_part(inv.email::text, '@', 1);
  end if;
  return query
  select w.name, w.slug, inv.name,
         case when inv.email is null then null
              else left(local_part, 1) || repeat('•', greatest(length(local_part) - 1, 1)) || '@' || split_part(inv.email::text, '@', 2) end,
         inv.email is not null,
         case when inv.revoked_at is not null then 'revoked'
              when inv.accepted_at is not null then 'accepted'
              when inv.expires_at < now() then 'expired'
              else 'valid' end
  from public.workspaces w where w.id = inv.workspace_id;
end;
$$;
revoke all on function public.get_network_invite(text) from public;
grant execute on function public.get_network_invite(text) to anon, authenticated;

-- Join: create (or reactivate) the member and link the CRM contact by email,
-- creating the contact if there's none. Returns the workspace slug.
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
  role := case inv.member_type when 'investor' then 'investor' when 'broker' then 'broker'
            when 'lender' then 'lender' when 'property_manager' then 'property_manager' else null end;
  if contact is null then
    first_name := split_part(name, ' ', 1);
    last_name := nullif(btrim(substr(name, char_length(first_name) + 1)), '');
    insert into public.contacts (workspace_id, first_name, last_name, emails, roles, tags, source, created_by)
    values (inv.workspace_id, left(first_name, 100), left(last_name, 100),
            jsonb_build_array(jsonb_build_object('value', email_key, 'label', 'personal', 'is_primary', true)),
            case when role is null then '{}'::text[] else array[role] end,
            array['network'], 'Housing4All Network', uid)
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
  values (inv.workspace_id, 'system', 'contact', contact, 'Joined the Housing4All Network',
          jsonb_build_object('kind', 'network_join', 'member_id', member, 'invite_id', inv.id), uid);
  insert into public.audit_log (workspace_id, actor_id, action, entity_type, entity_id, diff)
  values (inv.workspace_id, uid, 'network.joined', 'network_member', member,
          jsonb_build_object('contact_id', contact, 'invite_id', inv.id));

  select w.slug into ws_slug from public.workspaces w where w.id = inv.workspace_id;
  return ws_slug;
end;
$$;
revoke all on function public.accept_network_invite(text, text) from public;
grant execute on function public.accept_network_invite(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Install metadata (anon): browsers fetch the web-app manifest and icons
-- without cookies. Only the network's name and brand colours — nothing else.
-- ---------------------------------------------------------------------------
create or replace function public.network_brand(p_slug text)
returns table (workspace_name text, brand jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select w.name, w.brand from public.workspaces w
  where w.slug = p_slug and w.business_type = 'real_estate';
$$;
revoke all on function public.network_brand(text) from public;
grant execute on function public.network_brand(text) to anon, authenticated;
