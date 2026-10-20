import { FILE_TYPES, MAX_FILE_BYTES } from "./constants";

/** Safe object name: keeps letters, digits, dot, dash, underscore; max 120 chars; keeps the extension. */
export function sanitizeFileName(name: string): string {
  const basename = name.split(/[\\/]/).pop() ?? "";
  const trimmed = basename.trim().replace(/\s+/g, "-");
  const dot = trimmed.lastIndexOf(".");
  const ext =
    dot > 0
      ? trimmed
          .slice(dot + 1)
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")
          .slice(0, 10)
      : "";
  const base = (dot > 0 ? trimmed.slice(0, dot) : trimmed)
    .normalize("NFKD")
    .replace(/[^\w.-]/g, "")
    .replace(/^[.-]+/, "")
    .slice(0, 100);
  return `${base || "file"}${ext ? `.${ext}` : ""}`;
}

export type FileCheck = { ok: true; kind: "photo" | "document" } | { ok: false; error: string };

/** Allow-list + 10 MB limit (mirrors the azh-files bucket settings). */
export function checkFile(file: { type: string; size: number; name: string }): FileCheck {
  const kind = FILE_TYPES[file.type];
  if (!kind)
    return {
      ok: false,
      error: `${file.name}: this file type isn't allowed. Use photos, PDF, Word, Excel, text or CSV.`,
    };
  if (file.size > MAX_FILE_BYTES) return { ok: false, error: `${file.name}: larger than 10 MB.` };
  if (file.size === 0) return { ok: false, error: `${file.name}: the file is empty.` };
  return { ok: true, kind };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const FILE_PATH_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[^/]{1,200}$/;
