import type { BusinessType } from "@/lib/nav";

export type IntegrationProvider =
  "gohighlevel" | "google" | "twilio" | "elevenlabs" | "resend" | "data_api" | "mapbox";

export type IntegrationInfo = {
  provider: IntegrationProvider;
  name: string;
  purpose: string;
  phase: number;
};

/** What each integration will do and which phase connects it. No credentials live here. */
export const INTEGRATIONS: IntegrationInfo[] = [
  {
    provider: "gohighlevel",
    name: "GoHighLevel",
    purpose:
      "One-time import of contacts and opportunities before GHL is cancelled (read-only; token kept in Supabase Vault).",
    phase: 5,
  },
  {
    provider: "google",
    name: "Google (Gmail, Calendar, Business Profile)",
    purpose: "Calendar sync and booking, Gmail threads on contacts, Business Profile reviews.",
    phase: 5,
  },
  {
    provider: "resend",
    name: "Resend",
    purpose:
      "Parsing the saved-search alert emails you forward in, alert emails to you, and newsletters (Outreach) once a sending domain is verified.",
    phase: 2,
  },
  {
    provider: "data_api",
    name: "Property data API",
    purpose:
      "Licensed ownership, mortgage, foreclosure and tax data (ATTOM, RentCast or PropertyRadar — decided in Phase 3).",
    phase: 3,
  },
  {
    provider: "mapbox",
    name: "Mapbox",
    purpose: "Maps and geocoding for properties and deal search.",
    phase: 3,
  },
  {
    provider: "twilio",
    name: "Twilio",
    purpose: "Phone numbers and call routing for the AI receptionist.",
    phase: 7,
  },
  {
    provider: "elevenlabs",
    name: "ElevenLabs",
    purpose: "Conversational voice (English/Spanish) for the AI receptionist.",
    phase: 7,
  },
];

export function plannedOwner(businessType: BusinessType, isDemo: boolean): string {
  if (isDemo) return "Not connected in the Demo workspace";
  return businessType === "construction"
    ? "Sam's AZH Builders account"
    : "Sam's Housing4All account";
}
