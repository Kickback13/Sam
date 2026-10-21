import { Inngest } from "inngest";

/**
 * Inngest client. Keys come from the environment (INNGEST_EVENT_KEY /
 * INNGEST_SIGNING_KEY via the Vercel integration; INNGEST_DEV for the local
 * dev server). See ADR-023 for what runs here and what stays synchronous.
 */
export const inngest = new Inngest({ id: "housing4all-platform" });
