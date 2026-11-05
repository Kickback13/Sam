-- Spanish booking page (ADR-044) for Supabase project jcrjzmflepnvvvneahvs.
-- All-or-nothing (one transaction); the migration is included word for word. Additive only.
-- Removes no rows.

begin;

do $$ begin if exists (select 1 from supabase_migrations.schema_migrations where version = '20261113010000') or to_regprocedure('public.booking_public_book(text, timestamptz, text, text, text, text, text, text)') is not null then raise exception 'Spanish booking already applied'; end if; end $$;

-- =============================================================================
-- Spanish booking page (ADR-044). Additive only.
--
--   public.booking_public_book(..., p_language)   new 8-argument overload of the public
--                                                 booking function. It books through the
--                                                 existing 7-argument function (same checks,
--                                                 limits and locking), then, when the visitor
--                                                 used the page in Spanish, marks the contact
--                                                 Spanish ONLY if this booking just created it.
--                                                 Contacts that already existed keep the
--                                                 language the team set.
--
-- The 7-argument function is unchanged. Nothing here sends a message.
-- =============================================================================

create or replace function public.booking_public_book(
  p_slug text,
  p_starts_at timestamptz,
  p_name text,
  p_email text,
  p_phone text,
  p_note text,
  p_client_key text,
  p_language text
)
returns table (booking_id uuid, starts_at timestamptz, ends_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if p_language is null or p_language not in ('en', 'es') then
    raise exception 'Invalid request' using errcode = '22023';
  end if;

  select x.booking_id, x.starts_at, x.ends_at into r
  from public.booking_public_book(p_slug, p_starts_at, p_name, p_email, p_phone, p_note, p_client_key) x
  limit 1;

  if p_language = 'es' then
    -- now() is the transaction start, so only a contact created by this booking matches.
    update public.contacts c
       set language = 'es'
      from public.bookings b
     where b.id = r.booking_id
       and c.id = b.contact_id
       and c.created_at = now()
       and c.created_by is null
       and c.source = 'Booking page';
  end if;

  return query select r.booking_id, r.starts_at, r.ends_at;
end;
$$;

revoke all on function public.booking_public_book(text, timestamptz, text, text, text, text, text, text) from public;
grant execute on function public.booking_public_book(text, timestamptz, text, text, text, text, text, text) to anon, authenticated;

insert into supabase_migrations.schema_migrations (version, name) values
  ('20261113010000', 'h4a_spanish_booking');

commit;

select 'Spanish booking database update applied' as result;
