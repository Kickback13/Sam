import { handleInboundSms } from "@/features/outreach/server/sms-webhooks";

/** POST /api/sms/inbound/{token}: Twilio "A message comes in" webhook. */
export async function POST(request: Request, { params }: RouteContext<"/api/sms/inbound/[token]">) {
  const { token } = await params;
  return handleInboundSms(request, token);
}
