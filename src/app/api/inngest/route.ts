import { serve } from "inngest/next";

import { inngest } from "@/features/h4a/jobs/client";
import { h4aFunctions } from "@/features/h4a/jobs/functions";

/** Inngest endpoint (signed by INNGEST_SIGNING_KEY in production). See ADR-023. */
export const { GET, POST, PUT } = serve({ client: inngest, functions: h4aFunctions });
