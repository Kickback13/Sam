# Phase 7A Plan — AI receptionist (everything that works before Sam's Twilio / ElevenLabs accounts)

Track A · Branch `h4a/receptionist` → one PR into `main` · rules in `docs/COLLABORATION.md`.

## Call flow

1. A call to Sam's Twilio number → `POST /api/receptionist/twilio/<token>/voice`.
2. During business hours (or when the AI is off) the **default route** is rung for `ring_seconds`
   (15 s ≈ 3 rings). After hours the AI answers straight away.
3. Nobody picks up → the AI agent answers (Twilio dials its SIP address, `RECEPTIONIST_AI_SIP_URI`).
   AI not connected or unreachable → bilingual voicemail greeting + recording.
4. After the call ElevenLabs posts the transcript + summary → the route is chosen from what the caller
   said (keywords, English/Spanish), the caller is matched to a contact by phone (or a contact is
   created, tag `receptionist`), the call lands on their timeline as a `call` activity, and if nobody
   picked up, the route's person gets a "Call back …" task due in 4 hours.

## Scope → where it lives

| Item                 | Where                                                                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Routing rules (pure) | `src/features/receptionist/routing.ts`: business hours per time zone, keyword routing (accent-insensitive, whole words, per language), language guess                                      |
| Twilio               | `twilio.ts`: request-signature check (verified against Twilio's documented example), TwiML for ring / AI hand-off / voicemail                                                              |
| ElevenLabs           | `elevenlabs.ts`: post-call webhook signature (`t=…,v0=…`), payload mapping (merges with the Twilio call by call SID)                                                                       |
| Webhooks             | `/api/receptionist/twilio/<token>/{voice,after-dial,after-ai,voicemail,status}` and `/api/receptionist/elevenlabs/<token>`; signed requests only on any production runtime                 |
| Data                 | `receptionist_settings / routes / tokens / calls`; webhooks write only through `receptionist_record_call(token, call)` (token hash checked in SQL)                                         |
| UI                   | `/w/<slug>/receptionist`: call log (outcome, summary, transcript, voicemail link, contact) and Setup (status, connection links, hours, greetings, routes, "Test routing")                  |
| Tests                | unit (13) · RLS `h4a_receptionist_rls.sql` (24) · e2e: setup → signed Twilio webhooks (ring → voicemail) → signed ElevenLabs webhook (new caller → contact, route, task) → call log, 390px |

## Compliance

California requires every party's consent to record a call: the default greetings say "This call may be
recorded", and the Setup form reminds whoever edits them. The ElevenLabs agent's own first message
must say the same (configured in ElevenLabs).

## Needs Sam (not connected until then)

Twilio account + number, ElevenLabs Conversational AI agent (English + Spanish) with its SIP address and
post-call webhook — steps in `docs/ACCOUNTS.md`. Until then: Setup works, voicemail fallback is built,
nothing rings.
