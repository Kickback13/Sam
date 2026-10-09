import type { Json } from "./types";

/** Non-null JSON (jsonb NOT NULL columns). */
export type JsonValue = NonNullable<Json>;

/** Cast a serializable value for a jsonb column. */
export function toJson(value: unknown): JsonValue {
  return value as JsonValue;
}
