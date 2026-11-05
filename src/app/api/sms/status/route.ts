import { handleSmsStatus } from "@/features/outreach/server/sms-webhooks";

/** POST /api/sms/status: Twilio delivery status callback for texts sent from the app. */
export async function POST(request: Request) {
  return handleSmsStatus(request);
}
