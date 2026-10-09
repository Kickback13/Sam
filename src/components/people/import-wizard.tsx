"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
} from "lucide-react";
import Link from "next/link";
import Papa from "papaparse";
import { useMemo, useRef, useState } from "react";

import { useWorkspace } from "@/components/shell/workspace-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toCsv } from "@/lib/csv/dedupe";
import {
  autoMap,
  IMPORT_FIELDS,
  mappingProblems,
  normalizeHeader,
  type ColumnMapping,
  type ImportField,
} from "@/lib/csv/mapping";
import { transformRow, type RawRow, type TransformResult } from "@/lib/csv/transform";
import { formatNumber } from "@/lib/format";
import { useHydrated } from "@/lib/use-hydrated";
import { cn } from "@/lib/utils";
import {
  checkImportDuplicates,
  finishImport,
  importChunk,
  startImport,
  type DuplicateCheck,
} from "@/server/actions/imports";

const MAX_ROWS = 20_000;
const MAX_BYTES = 15 * 1024 * 1024;
const CHUNK = 250;

type Step = "upload" | "map" | "preview" | "importing" | "done";
type Parsed = { filename: string; headers: string[]; rows: RawRow[] };
type ErrorRow = { row: number; message: string };

function todayTag() {
  return `import-${new Date().toISOString().slice(0, 10)}`;
}

export function ImportWizard() {
  const ws = useWorkspace();
  const hydrated = useHydrated();
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<Parsed | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [parseError, setParseError] = useState<string | null>(null);
  const [checks, setChecks] = useState<Map<number, DuplicateCheck> | null>(null);
  const [checking, setChecking] = useState(false);
  const [strategy, setStrategy] = useState<"skip" | "update">("skip");
  const [tag, setTag] = useState(todayTag());
  const [progress, setProgress] = useState({ done: 0, created: 0, updated: 0, skipped: 0 });
  const [errors, setErrors] = useState<ErrorRow[]>([]);
  const [fatal, setFatal] = useState<string | null>(null);
  const [importId, setImportId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isGhl = useMemo(
    () => file?.headers.some((h) => normalizeHeader(h) === "contact id") ?? false,
    [file],
  );

  // Row numbers match the spreadsheet: header is row 1, first data row is row 2.
  const transformed = useMemo<{ row: number; result: TransformResult; raw: RawRow }[]>(() => {
    if (!file || step === "upload" || step === "map") return [];
    return file.rows.map((raw, i) => ({
      row: i + 2,
      raw,
      result: transformRow(raw, mapping, { source: isGhl ? "GHL import" : "CSV import" }),
    }));
  }, [file, mapping, step, isGhl]);

  const summary = useMemo(() => {
    const invalid = transformed.filter((t) => !t.result.ok).length;
    let create = 0;
    let match = 0;
    let inFile = 0;
    if (checks) {
      for (const c of checks.values()) {
        if (c.action === "create") create++;
        else if (c.action === "match") match++;
        else inFile++;
      }
    }
    return { total: transformed.length, invalid, create, match, inFile };
  }, [transformed, checks]);

  function onFile(f: File | undefined) {
    setParseError(null);
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setParseError("That file is larger than 15 MB. Split it into smaller files.");
      return;
    }
    Papa.parse<RawRow>(f, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
      complete: (res) => {
        const headers = (res.meta.fields ?? []).filter(Boolean);
        if (headers.length === 0 || res.data.length === 0) {
          setParseError("We couldn't find a header row and data in that file.");
          return;
        }
        if (res.data.length > MAX_ROWS) {
          setParseError(
            `That file has ${formatNumber(res.data.length)} rows. The limit is ${formatNumber(MAX_ROWS)} per import.`,
          );
          return;
        }
        setFile({ filename: f.name, headers, rows: res.data });
        setMapping(autoMap(headers));
        setStep("map");
      },
      error: (err) => setParseError(`Couldn't read that file: ${err.message}`),
    });
  }

  async function goPreview() {
    setStep("preview");
    setChecking(true);
    setChecks(null);
    // Re-run the transform synchronously here so the dedupe check uses the current mapping.
    const rows = file!.rows
      .map((raw, i) => ({ row: i + 2, result: transformRow(raw, mapping) }))
      .filter((t) => t.result.ok)
      .map((t) => {
        const v = (t.result as Extract<TransformResult, { ok: true }>).value;
        return {
          row: t.row,
          emailKeys: v.emailKeys,
          phoneKeys: v.phoneKeys,
          ghlContactId: v.ghlContactId,
        };
      });
    const result = await checkImportDuplicates({ workspaceId: ws.id, rows });
    setChecking(false);
    if (!result.ok) {
      setFatal(result.error);
      return;
    }
    setChecks(new Map(result.data.map((c) => [c.row, c])));
  }

  async function runImport() {
    if (!file) return;
    setStep("importing");
    setFatal(null);
    const invalidErrors: ErrorRow[] = transformed
      .filter((t) => !t.result.ok)
      .map((t) => ({ row: t.row, message: (t.result as { errors: string[] }).errors.join("; ") }));
    setErrors(invalidErrors);

    const start = await startImport({
      workspaceId: ws.id,
      filename: file.filename,
      mapping: mapping as Record<string, string>,
      dedupeStrategy: strategy,
      totalRows: file.rows.length,
      extraTags: tag.trim() ? [tag.trim()] : [],
      defaultSource: isGhl ? "GHL import" : "CSV import",
    });
    if (!start.ok) {
      setFatal(start.error);
      setStep("preview");
      return;
    }
    setImportId(start.data.importId);

    const all = file.rows.map((raw, i) => ({ row: i + 2, raw }));
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const chunkErrors: ErrorRow[] = [];
    for (let i = 0; i < all.length; i += CHUNK) {
      const slice = all.slice(i, i + CHUNK).map((r) => ({
        row: r.row,
        raw: Object.fromEntries(Object.entries(r.raw).filter(([k]) => mapping[k])),
      }));
      const res = await importChunk({
        workspaceId: ws.id,
        importId: start.data.importId,
        rows: slice,
      });
      if (!res.ok) {
        setFatal(`Import stopped at row ${slice[0].row}: ${res.error}`);
        await finishImport({ workspaceId: ws.id, importId: start.data.importId, failed: true });
        setStep("done");
        return;
      }
      created += res.data.created;
      updated += res.data.updated;
      skipped += res.data.skipped;
      chunkErrors.push(...res.data.errors);
      setProgress({ done: Math.min(all.length, i + CHUNK), created, updated, skipped });
    }
    // Server-side validation errors supersede the client's for the same row.
    const serverRows = new Set(chunkErrors.map((e) => e.row));
    setErrors(
      [...invalidErrors.filter((e) => !serverRows.has(e.row)), ...chunkErrors].sort(
        (a, b) => a.row - b.row,
      ),
    );
    await finishImport({ workspaceId: ws.id, importId: start.data.importId });
    setStep("done");
  }

  function downloadErrors() {
    if (!file) return;
    const headers = ["row", "error", ...file.headers];
    const rows = errors.map((e) => [
      e.row,
      e.message,
      ...file.headers.map((h) => file.rows[e.row - 2]?.[h] ?? ""),
    ]);
    const blob = new Blob([toCsv(headers, rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${file.filename.replace(/\.csv$/i, "")}-errors.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const problems = mappingProblems(mapping);
  const steps: { key: Step; label: string }[] = [
    { key: "upload", label: "Upload" },
    { key: "map", label: "Map columns" },
    { key: "preview", label: "Preview & dedupe" },
    { key: "done", label: "Import" },
  ];
  const stepIndex = step === "importing" ? 3 : steps.findIndex((s) => s.key === step);

  return (
    <div className="space-y-5">
      <ol className="flex flex-wrap gap-2 text-sm" aria-label="Import steps">
        {steps.map((s, i) => (
          <li
            key={s.key}
            aria-current={i === stepIndex ? "step" : undefined}
            className={cn(
              "rounded-full border px-3 py-1 font-semibold",
              i === stepIndex
                ? "border-brand-ink bg-brand-ink text-white"
                : i < stepIndex
                  ? "bg-muted"
                  : "text-muted-foreground",
            )}
          >
            {i + 1}. {s.label}
          </li>
        ))}
      </ol>

      {fatal && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
        >
          {fatal}
        </p>
      )}

      {step === "upload" && (
        <Card>
          <CardContent className="py-8">
            <div
              className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                onFile(e.dataTransfer.files[0]);
              }}
            >
              <FileSpreadsheet className="size-10 text-muted-foreground" aria-hidden />
              <p className="font-semibold">Drop a CSV file here, or choose one</p>
              <p className="max-w-md text-sm text-muted-foreground">
                GoHighLevel contact exports map automatically. Up to {formatNumber(MAX_ROWS)} rows.
                Nothing is saved until you confirm the import.
              </p>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                id="csv-file"
                data-testid="csv-input"
                disabled={!hydrated}
                onChange={(e) => onFile(e.target.files?.[0])}
              />
              <Button type="button" disabled={!hydrated} onClick={() => inputRef.current?.click()}>
                <Upload aria-hidden /> Choose CSV
              </Button>
              {parseError && (
                <p role="alert" className="text-sm font-medium text-brand-danger">
                  {parseError}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {step === "map" && file && (
        <Card>
          <CardHeader>
            <CardTitle>Map columns — {file.filename}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {formatNumber(file.rows.length)} rows · {file.headers.length} columns
              {isGhl && (
                <Badge variant="info" className="ml-2">
                  GoHighLevel export detected
                </Badge>
              )}
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>CSV column</TableHead>
                  <TableHead>Sample</TableHead>
                  <TableHead>Import as</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {file.headers.map((h) => (
                  <TableRow key={h}>
                    <TableCell className="font-medium">{h}</TableCell>
                    <TableCell className="max-w-56 truncate text-xs text-muted-foreground">
                      {file.rows
                        .slice(0, 3)
                        .map((r) => r[h])
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </TableCell>
                    <TableCell className="w-64">
                      <NativeSelect
                        aria-label={`Map ${h}`}
                        value={mapping[h] ?? ""}
                        onChange={(e) =>
                          setMapping({ ...mapping, [h]: e.target.value as ImportField | "" })
                        }
                      >
                        <option value="">Don&apos;t import</option>
                        {IMPORT_FIELDS.map((f) => (
                          <option key={f.value} value={f.value}>
                            {f.label}
                          </option>
                        ))}
                      </NativeSelect>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {problems.length > 0 && (
              <ul role="alert" className="mt-3 space-y-1 text-sm text-brand-danger">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex justify-between gap-2">
              <Button variant="outline" onClick={() => setStep("upload")}>
                Back
              </Button>
              <Button disabled={problems.length > 0} onClick={goPreview} data-testid="to-preview">
                Preview
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "preview" && file && (
        <Card>
          <CardHeader>
            <CardTitle>Preview & dedupe</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {checking ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Checking{" "}
                {formatNumber(summary.total)} rows for duplicates…
              </p>
            ) : (
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="import-summary">
                <div className="rounded-lg border p-3">
                  <dt className="text-xs text-muted-foreground">New contacts</dt>
                  <dd className="text-xl font-bold tabular">{formatNumber(summary.create)}</dd>
                </div>
                <div className="rounded-lg border p-3">
                  <dt className="text-xs text-muted-foreground">Match existing</dt>
                  <dd className="text-xl font-bold tabular">{formatNumber(summary.match)}</dd>
                </div>
                <div className="rounded-lg border p-3">
                  <dt className="text-xs text-muted-foreground">Duplicates in file</dt>
                  <dd className="text-xl font-bold tabular">{formatNumber(summary.inFile)}</dd>
                </div>
                <div className="rounded-lg border p-3">
                  <dt className="text-xs text-muted-foreground">Invalid rows</dt>
                  <dd
                    className={cn(
                      "text-xl font-bold tabular",
                      summary.invalid > 0 && "text-brand-danger",
                    )}
                  >
                    {formatNumber(summary.invalid)}
                  </dd>
                </div>
              </dl>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold">
                  When a row matches an existing contact
                </legend>
                {(["skip", "update"] as const).map((s) => (
                  <label key={s} className="flex items-start gap-2 text-sm">
                    <input
                      type="radio"
                      name="strategy"
                      value={s}
                      checked={strategy === s}
                      onChange={() => setStrategy(s)}
                      className="mt-1 size-4 accent-black"
                    />
                    <span>
                      <strong>{s === "skip" ? "Skip it" : "Update it"}</strong>
                      <span className="block text-xs text-muted-foreground">
                        {s === "skip"
                          ? "Leave the existing contact unchanged."
                          : "Fill in new values, add new emails/phones and tags. DNC and opt-outs are never cleared."}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <div className="space-y-1.5">
                <Label htmlFor="import-tag">Tag imported contacts</Label>
                <Input id="import-tag" value={tag} onChange={(e) => setTag(e.target.value)} />
                <p className="text-xs text-muted-foreground">
                  Makes this batch easy to filter later. Leave blank for none.
                </p>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Row</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transformed.slice(0, 10).map((t) => {
                    const check = checks?.get(t.row);
                    const v = t.result.ok ? t.result.value : null;
                    return (
                      <TableRow key={t.row}>
                        <TableCell className="tabular">{t.row}</TableCell>
                        <TableCell>
                          {v
                            ? [v.contact.first_name, v.contact.last_name]
                                .filter(Boolean)
                                .join(" ") || "—"
                            : "—"}
                        </TableCell>
                        <TableCell className="max-w-48 truncate">
                          {v?.contact.emails[0]?.value ?? "—"}
                        </TableCell>
                        <TableCell>{v?.contact.phones[0]?.value ?? "—"}</TableCell>
                        <TableCell>
                          {!t.result.ok ? (
                            <Badge variant="danger" title={t.result.errors.join("; ")}>
                              {t.result.errors[0]}
                            </Badge>
                          ) : check?.action === "match" ? (
                            <Badge variant="warning">
                              Matches {check.existingName ?? "existing"} ({check.via})
                            </Badge>
                          ) : check?.action === "duplicate_in_file" ? (
                            <Badge variant="warning">Duplicate of row {check.firstRow}</Badge>
                          ) : (
                            <Badge variant="success">New</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {transformed.length > 10 && (
              <p className="text-xs text-muted-foreground">
                Showing the first 10 of {formatNumber(transformed.length)} rows.
              </p>
            )}

            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => setStep("map")}>
                Back
              </Button>
              <Button
                disabled={checking || summary.total === summary.invalid}
                onClick={runImport}
                data-testid="run-import"
              >
                Import {formatNumber(summary.total - summary.invalid)} rows
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "importing" && file && (
        <Card>
          <CardContent className="space-y-3 py-8" aria-live="polite">
            <p className="flex items-center gap-2 font-semibold">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Importing{" "}
              {formatNumber(progress.done)} of {formatNumber(file.rows.length)} rows…
            </p>
            <div
              className="h-2 rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={file.rows.length}
              aria-valuenow={progress.done}
            >
              <div
                className="h-full rounded-full bg-brand-primary transition-all"
                style={{ width: `${(progress.done / file.rows.length) * 100}%` }}
              />
            </div>
            <p className="text-sm text-muted-foreground">Keep this page open until it finishes.</p>
          </CardContent>
        </Card>
      )}

      {step === "done" && file && (
        <Card>
          <CardContent className="space-y-4 py-6" data-testid="import-result">
            <p className="flex items-center gap-2 text-lg font-bold">
              {fatal ? (
                <AlertTriangle className="text-brand-danger" aria-hidden />
              ) : (
                <CheckCircle2 className="text-emerald-700" aria-hidden />
              )}
              {fatal ? "Import stopped" : "Import complete"}
            </p>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border p-3">
                <dt className="text-xs text-muted-foreground">Created</dt>
                <dd className="text-xl font-bold tabular" data-testid="created-count">
                  {formatNumber(progress.created)}
                </dd>
              </div>
              <div className="rounded-lg border p-3">
                <dt className="text-xs text-muted-foreground">Updated</dt>
                <dd className="text-xl font-bold tabular">{formatNumber(progress.updated)}</dd>
              </div>
              <div className="rounded-lg border p-3">
                <dt className="text-xs text-muted-foreground">Skipped</dt>
                <dd className="text-xl font-bold tabular">{formatNumber(progress.skipped)}</dd>
              </div>
              <div className="rounded-lg border p-3">
                <dt className="text-xs text-muted-foreground">Rows with issues</dt>
                <dd className="text-xl font-bold tabular" data-testid="error-count">
                  {formatNumber(errors.length)}
                </dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-2">
              {errors.length > 0 && (
                <Button variant="outline" onClick={downloadErrors} data-testid="download-errors">
                  <Download aria-hidden /> Download error report
                </Button>
              )}
              <Button asChild>
                <Link
                  href={
                    tag.trim()
                      ? `/w/${ws.slug}/people?tag=${encodeURIComponent(tag.trim())}`
                      : `/w/${ws.slug}/people`
                  }
                >
                  View imported contacts
                </Link>
              </Button>
              {importId && (
                <Button asChild variant="ghost">
                  <Link href={`/w/${ws.slug}/people/import/${importId}`}>Import details</Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
