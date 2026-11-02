/**
 * Receptionist connection settings (env). All optional — missing ⇒ "Not connected".
 *
 *   TWILIO_AUTH_TOKEN           verifies Twilio's requests (from Sam's Twilio account)
 *   TWILIO_CALLER_ID            optional: number shown when forwarding (the Twilio number)
 *   ELEVENLABS_WEBHOOK_SECRET   verifies ElevenLabs' post-call webhook
 *   RECEPTIONIST_AI_SIP_URI     where Twilio hands unanswered calls to the AI agent (SIP address
 *                               from ElevenLabs). Unset ⇒ unanswered calls go to voicemail.
 */
export type ReceptionistConfig = {
  twilio: { connected: boolean; authToken: string | null; callerId: string | null };
  elevenlabs: { connected: boolean; webhookSecret: string | null };
  aiSipUri: string | null;
};

export function receptionistConfig(
  env: Record<string, string | undefined> = process.env,
): ReceptionistConfig {
  const authToken = env.TWILIO_AUTH_TOKEN?.trim() || null;
  const webhookSecret = env.ELEVENLABS_WEBHOOK_SECRET?.trim() || null;
  const sip = env.RECEPTIONIST_AI_SIP_URI?.trim() || null;
  return {
    twilio: {
      connected: Boolean(authToken),
      authToken,
      callerId: env.TWILIO_CALLER_ID?.trim() || null,
    },
    elevenlabs: { connected: Boolean(webhookSecret), webhookSecret },
    aiSipUri: sip && /^sips?:[^\s<>"]+$/i.test(sip) ? sip : null,
  };
}
