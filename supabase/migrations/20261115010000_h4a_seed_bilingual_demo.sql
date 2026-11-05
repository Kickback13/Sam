-- =============================================================================
-- Seed: bilingual outreach demo (Demo workspace ONLY: slug 'demo', is_demo = true).
--
-- Two active follow-up sequences with English and Spanish versions of every step
-- (ADR-043), one Spanish-speaking and one English-speaking demo contact enrolled in
-- each with the first step due now, and a Spanish version of the demo newsletter
-- (ADR-045). All content is fictional and labeled "Demo". Nothing is sent: due
-- steps wait for a person, and email/texting aren't connected.
--
-- Idempotent: does nothing if the Demo workspace is missing or already has these
-- sequences. Never touches any other workspace.
-- =============================================================================

do $$
declare
  ws uuid;
  seq_owner uuid;
  seq_broker uuid;
  es_contact uuid;
  en_contact uuid;
begin
  select id into ws from public.workspaces where slug = 'demo' and is_demo;
  if ws is null then
    return;
  end if;
  if exists (select 1 from public.outreach_sequences where workspace_id = ws and name like 'Demo: % (bilingual)') then
    return;
  end if;

  insert into public.outreach_sequences (workspace_id, name, description, active, created_by)
  values (ws, 'Demo: new owner lead (bilingual)',
          'Demo data: three touches for an owner who might sell. Spanish speakers get the Spanish version.',
          true, null)
  returning id into seq_owner;
  insert into public.outreach_sequence_steps
    (workspace_id, sequence_id, position, channel, wait_days, subject, body, subject_es, body_es)
  values
    (ws, seq_owner, 1, 'email', 0,
     'Your building on {company}',
     E'Hi {first_name},\n\nThis is a demo message. I work with owners of small apartment buildings in San Diego. Would you be open to a short call about what your building could sell for today?\n\n{my_name}',
     'Su edificio',
     E'Hola {first_name}:\n\nEste es un mensaje de demostración. Trabajo con dueños de edificios de apartamentos en San Diego. ¿Le interesaría una llamada breve sobre cuánto podría valer su edificio hoy?\n\n{my_name}'),
    (ws, seq_owner, 2, 'sms', 3, null,
     'Hi {first_name}, it''s {my_name} (demo). Following up on my email about your building. Reply STOP to opt out.',
     null,
     'Hola {first_name}, soy {my_name} (demo). Le escribo sobre mi correo acerca de su edificio. Responda ALTO para no recibir más mensajes.'),
    (ws, seq_owner, 3, 'email', 7,
     'Last note about your building',
     E'Hi {first_name},\n\nDemo message: I''ll leave it here. If selling is ever on your mind, just reply and we''ll talk.\n\n{my_name}',
     'Última nota sobre su edificio',
     E'Hola {first_name}:\n\nMensaje de demostración: lo dejo aquí. Si algún día piensa en vender, responda este correo y hablamos.\n\n{my_name}');

  insert into public.outreach_sequences (workspace_id, name, description, active, created_by)
  values (ws, 'Demo: broker follow-up (bilingual)',
          'Demo data: stay in front of a broker after a listing comes in.',
          true, null)
  returning id into seq_broker;
  insert into public.outreach_sequence_steps
    (workspace_id, sequence_id, position, channel, wait_days, subject, body, subject_es, body_es)
  values
    (ws, seq_broker, 1, 'email', 0,
     'Thanks for the listing',
     E'Hi {first_name},\n\nDemo message: thanks for sending the listing. We''re a buyer for 30–500 units in San Diego. Send anything similar our way.\n\n{my_name}',
     'Gracias por la propiedad',
     E'Hola {first_name}:\n\nMensaje de demostración: gracias por enviarnos la propiedad. Compramos edificios de 30 a 500 unidades en San Diego. Envíenos cualquier cosa parecida.\n\n{my_name}'),
    (ws, seq_broker, 2, 'email', 14,
     'Anything new?',
     E'Hi {first_name},\n\nDemo message: checking in. Anything new that fits?\n\n{my_name}',
     '¿Algo nuevo?',
     E'Hola {first_name}:\n\nMensaje de demostración: ¿tiene algo nuevo que nos pueda interesar?\n\n{my_name}');

  -- One Spanish-speaking and one English-speaking demo contact that pass the checks.
  select c.id into es_contact from public.contacts c
  where c.workspace_id = ws and c.deleted_at is null and c.language = 'es' and not c.dnc and not c.email_opt_out
  order by c.created_at limit 1;
  select c.id into en_contact from public.contacts c
  where c.workspace_id = ws and c.deleted_at is null and c.language = 'en' and not c.dnc and not c.email_opt_out
  order by c.created_at limit 1;
  insert into public.outreach_enrollments (workspace_id, sequence_id, contact_id, next_position, next_due_at, enrolled_by)
  select ws, s.id, c.id, 1, now(), null
  from (values (seq_owner), (seq_broker)) as s(id)
  cross join (values (es_contact), (en_contact)) as c(id)
  where c.id is not null;

  -- A Spanish version of the demo newsletter, if it is still the untouched demo draft.
  update public.newsletters
     set subject_es = 'Demo: novedades del mercado multifamiliar en San Diego',
         preheader_es = 'Boletín de muestra: solo datos de demostración',
         body_es = E'# Novedades del mercado multifamiliar en San Diego\n\nEste es un **boletín de demostración** con contenido ficticio.\n\n- Nota de mercado de muestra uno\n- Nota de mercado de muestra dos\n\n¿Piensa vender? [Responda este correo](mailto:hello@example.com).'
   where workspace_id = ws and status = 'draft' and subject = 'Demo: San Diego multifamily update'
     and body_es is null;
end;
$$;
