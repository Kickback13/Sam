import "server-only";

import type { ActionResult } from "@/lib/validation/common";

type PgLikeError = { code?: string; message?: string; details?: string | null };

/** Turn Postgres/PostgREST errors into messages a person can act on. */
export function friendlyDbError(error: PgLikeError | null | undefined): string {
  if (!error) return "Something went wrong.";
  switch (error.code) {
    case "42501":
      return error.message?.startsWith("Only an owner") || error.message?.startsWith("This invite")
        ? error.message
        : "You don't have permission to do that in this workspace.";
    case "23503":
      return error.message?.includes("not found in this workspace")
        ? "That linked record isn't in this workspace."
        : "A linked record is missing, or this record is still in use.";
    case "23505":
      return "That already exists.";
    case "23514":
      return error.message?.includes("at least one owner")
        ? "A workspace must keep at least one owner."
        : "Some values aren't allowed. Check the form and try again.";
    case "22023":
    case "P0002":
      return error.message ?? "That request isn't valid.";
    case "PGRST116":
      return "Not found.";
    default:
      console.error("Unhandled database error", error);
      return "Something went wrong saving that. Please try again.";
  }
}

export function fail(
  error: string,
  fieldErrors?: Record<string, string[] | undefined>,
): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}
