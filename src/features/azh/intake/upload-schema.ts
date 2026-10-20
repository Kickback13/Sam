import { z } from "zod";

import { INTAKE_PHOTO_TYPES, MAX_FILE_BYTES, MAX_INTAKE_PHOTOS } from "../constants";

/** Body of POST /r/<slug>/upload — what the form asks for before uploading photos. */
export const uploadRequestSchema = z.object({
  phone: z.string().trim().min(7).max(40),
  files: z
    .array(
      z.object({
        type: z.string().refine((t) => t in INTAKE_PHOTO_TYPES, "photoType"),
        size: z.number().int().min(1, "photoSize").max(MAX_FILE_BYTES, "photoSize"),
      }),
    )
    .min(1, "photoCount")
    .max(MAX_INTAKE_PHOTOS, "photoCount"),
});
export type UploadRequest = z.infer<typeof uploadRequestSchema>;

export type UploadSlot = { path: string; token: string };
export type UploadResponse =
  | { ok: true; slots: UploadSlot[] }
  | {
      ok: false;
      error:
        | "unavailable"
        | "rateLimited"
        | "photoType"
        | "photoSize"
        | "photoCount"
        | "phone"
        | "photoUpload";
    };
