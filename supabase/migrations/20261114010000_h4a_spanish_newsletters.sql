-- =============================================================================
-- Spanish newsletters (ADR-045). Additive only.
--
--   newsletters.subject_es / preheader_es / body_es   optional Spanish version of an issue;
--                                                     contacts whose language is 'es' get it
--   newsletter_sends.language                         which version each recipient was sent
--                                                     ('en' or 'es'; existing rows are 'en')
--
-- Every send-time gate is unchanged, and nothing sends until email is connected.
-- =============================================================================

alter table public.newsletters
  add column subject_es text check (subject_es is null or char_length(subject_es) between 1 and 200),
  add column preheader_es text check (preheader_es is null or char_length(preheader_es) <= 200),
  add column body_es text check (body_es is null or char_length(body_es) between 1 and 50000);
alter table public.newsletters
  add constraint newsletters_es_needs_subject check ((body_es is null) = (subject_es is null)),
  add constraint newsletters_es_preheader_needs_body check (preheader_es is null or body_es is not null);
comment on column public.newsletters.body_es is
  'Spanish version of the issue (optional). Sent to contacts whose language is es.';

grant update (subject_es, preheader_es, body_es) on public.newsletters to authenticated;

alter table public.newsletter_sends
  add column language text not null default 'en' check (language in ('en', 'es'));
