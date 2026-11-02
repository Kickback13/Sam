import {
  handleTwilio,
  TWILIO_STEPS,
  type TwilioStep,
} from "@/features/receptionist/server/webhooks";

/** POST /api/receptionist/twilio/{token}/{voice|after-dial|after-ai|voicemail|status} */
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/receptionist/twilio/[token]/[step]">,
) {
  const { token, step } = await params;
  if (!TWILIO_STEPS.includes(step as TwilioStep)) return new Response("Not found", { status: 404 });
  return handleTwilio(request, token, step as TwilioStep);
}
