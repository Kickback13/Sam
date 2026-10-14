"use client";

import { FileText, Loader2, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/shell/workspace-provider";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

import { checkFile, formatBytes, sanitizeFileName } from "../files";
import { deleteFile, registerFile } from "../server/actions/files";
import type { FileItem } from "../server/queries";

export type FileParent = { dealId: string } | { requestId: string };

/** Upload a file to azh-files and register it. Returns the new file id or throws a readable error. */
export async function uploadAzhFile(
  workspaceId: string,
  parent: FileParent,
  file: File,
  kind?: "receipt",
): Promise<string> {
  const check = checkFile(file);
  if (!check.ok) throw new Error(check.error);
  const path = `${workspaceId}/${crypto.randomUUID()}/${sanitizeFileName(file.name)}`;
  const { error } = await createClient()
    .storage.from("azh-files")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(`${file.name}: upload failed (${error.message}).`);
  const result = await registerFile({
    workspaceId,
    ...parent,
    path,
    name: file.name.slice(0, 200),
    mimeType: file.type,
    size: file.size,
    kind: kind ?? check.kind,
  });
  if (!result.ok) throw new Error(`${file.name}: ${result.error}`);
  return result.data.id;
}

export function FilesPanel({
  files,
  parent,
  title = "Files & photos",
  compact,
}: {
  files: FileItem[];
  parent: FileParent;
  title?: string;
  compact?: boolean;
}) {
  const ws = useWorkspace();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const photos = files.filter((f) => f.mime_type.startsWith("image/"));
  const docs = files.filter((f) => !f.mime_type.startsWith("image/"));
  const inputId = `files-${"dealId" in parent ? parent.dealId : parent.requestId}`;

  async function onFiles(list: FileList | null) {
    if (!list?.length) return;
    const chosen = Array.from(list).slice(0, 20);
    setErrors([]);
    setUploading(chosen.length);
    const problems: string[] = [];
    let done = 0;
    for (const file of chosen) {
      try {
        await uploadAzhFile(ws.id, parent, file);
        done++;
      } catch (e) {
        problems.push(e instanceof Error ? e.message : `${file.name}: upload failed.`);
      }
      setUploading((n) => n - 1);
    }
    if (input.current) input.current.value = "";
    setErrors(problems);
    if (done) {
      toast.success(`${done} file${done === 1 ? "" : "s"} uploaded`);
      router.refresh();
    }
  }

  async function remove(f: FileItem) {
    if (!window.confirm(`Delete ${f.name}? This can't be undone.`)) return;
    const result = await deleteFile({ workspaceId: ws.id, fileId: f.id });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("File deleted");
    router.refresh();
  }

  return (
    <section
      aria-label={title}
      className={compact ? "space-y-3" : "space-y-4 rounded-xl border bg-card p-4 sm:p-5"}
      data-testid="files-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={compact ? "text-sm font-bold" : "text-base font-bold"}>
          {title}{" "}
          {files.length > 0 && (
            <span className="font-normal text-muted-foreground">({files.length})</span>
          )}
        </h2>
        {ws.canWrite && (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={uploading > 0}
              onClick={() => input.current?.click()}
            >
              {uploading > 0 ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Upload aria-hidden />
              )}
              {uploading > 0 ? `Uploading ${uploading}…` : "Upload"}
            </Button>
            <input
              ref={input}
              id={inputId}
              type="file"
              multiple
              className="sr-only"
              aria-label={`Upload to ${title}`}
              accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
              onChange={(e) => void onFiles(e.target.files)}
              data-testid="file-input"
            />
          </>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Photos, PDF, Word, Excel, text or CSV · up to 10 MB each · private to this workspace.
      </p>
      {errors.length > 0 && (
        <ul
          role="alert"
          className="space-y-1 rounded-md bg-red-50 px-3 py-2 text-sm text-brand-danger"
        >
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {files.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          No files yet.{ws.canWrite ? " Upload plans, permits, contracts or job-site photos." : ""}
        </p>
      ) : (
        <>
          {photos.length > 0 && (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" data-testid="file-photos">
              {photos.map((f) => (
                <li key={f.id} className="group relative">
                  <a
                    href={f.url ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="block aspect-square overflow-hidden rounded-md border bg-muted"
                    title={f.name}
                  >
                    {f.url ? (
                      /* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */
                      <img
                        src={f.url}
                        alt={f.name}
                        className="size-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="flex size-full items-center justify-center text-xs text-muted-foreground">
                        Unavailable
                      </span>
                    )}
                  </a>
                  {ws.canWrite && (
                    <button
                      type="button"
                      onClick={() => void remove(f)}
                      className="absolute top-1 right-1 rounded-full bg-black/75 p-1 text-white"
                      aria-label={`Delete ${f.name}`}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {docs.length > 0 && (
            <ul className="divide-y rounded-lg border" data-testid="file-docs">
              {docs.map((f) => (
                <li key={f.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1">
                    {f.url ? (
                      <a
                        href={f.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate font-semibold text-brand-accent-text hover:underline"
                      >
                        {f.name}
                      </a>
                    ) : (
                      <span className="block truncate font-semibold">{f.name}</span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {formatBytes(f.size_bytes)} · {formatDate(f.created_at)}
                      {f.uploaderName ? ` · ${f.uploaderName}` : ""}
                      {f.kind === "receipt" ? " · receipt" : ""}
                    </span>
                  </span>
                  {ws.canWrite && (
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Delete ${f.name}`}
                      onClick={() => void remove(f)}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
