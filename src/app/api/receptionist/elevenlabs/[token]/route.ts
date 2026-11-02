import { handleElevenLabs } from "@/features/receptionist/server/webhooks";

/** POST /api/receptionist/elevenlabs/{token} — ElevenLabs post-call webhook. */
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/receptionist/elevenlabs/[token]">,
) {
  const { token } = await params;
  return handleElevenLabs(request, token);
}
