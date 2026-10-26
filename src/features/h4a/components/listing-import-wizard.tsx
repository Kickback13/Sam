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
import { formatCurrency, formatNumber } from "@/lib/format";
import { useHydrated } from "@/lib/use-hydrated";
import { cn } from "@/lib/utils";

import {
  autoMapListings,
  LISTING_IMPORT_FIELDS,
  listingMappingProblems,
  transformListingRow,
  type ListingColumnMapping,
  type ListingImportField,
  type ListingRowResult,
  type RawListingRow,
} from "../csv/mapping";
import { listingKeys } from "../listing/normalize";
import {
  checkListingImport,
  finishListingImport,
  importListingChunk,
  startListingImport,
  type ListingDuplicateCheck,
} from "../server/actions/import";

const MAX_ROWS = 10_000;
const MAX_BYTES = 10 * 1024 * 1024;
const CHUNK = 200;

type Step = "upload" | "map" | "preview" | "importing" | "done";
type Parsed = { filename: string; headers: string[]; rows: RawListingRow[] };
type ErrorRow = { row: number; message: string };

/** CSV upload: map → preview + dedupe → confirm → error report (Phase 1 import pattern). */
export function ListingImportWizard() {
  const ws = useWorkspace();
  const hydrated = useHydrated();
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<Parsed | null>(null);
  const [mapping, setMapping] = useState<ListingColumnMapping>({});
  const [parseError, setParseError] = useState<string | null>(null);
  const [checks, setChecks] = useState<Map<number, ListingDuplicateCheck> | null>(null);
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState({ done: 0, created: 0, updated: 0, unchanged: 0 });
  const [errors, setErrors] = useState<ErrorRow[]>([]);
  const [fatal, setFatal] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const transformed = useMemo<{ row: number; result: ListingRowResult }[]>(() => {
    if (!file || step === "upload" || step === "map") return [];
    return file.rows.map((raw, i) => ({ row: i + 2, result: transformListingRow(raw, mapping) }));
  }, [file, mapping, step]);

  const summary = useMemo(() => {
    const invalid = transformed.filter((t) => !t.result.ok).length;
    let create = 0;
    let update = 0;
    let inFile = 0;
    for (const c of checks?.values() ?? []) {
      if (c.action === "create") create++;
      else if (c.action === "update") update++;
      else inFile++;
    }
    return { total: transformed.length, invalid, create, update, inFile };
  }, [transformed, checks]);

  function onFile(f: File | undefined) {
    setParseError(null);
    if (!f) return;
    if (f.size > MAX_BYTES)
      return setParseError("That file is larger than 10 MB. Split it into smaller files.");
    Papa.parse<RawListingRow>(f, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
      complete: (res) => {
        const headers = (res.meta.fields ?? []).filter(Boolean);
        if (headers.length === 0 || res.data.length === 0)
          return setParseError("We couldn't find a header row and data in that file.");
        if (res.data.length > MAX_ROWS)
          return setParseError(
            `That file has ${formatNumber(res.data.length)} rows. The limit is ${formatNumber(MAX_ROWS)} per upload.`,
          );
        setFile({ filename: f.name, headers, rows: res.data });
        setMapping(autoMapListings(headers));
        setStep("map");
      },
      error: (err) => setParseError(`Couldn't read that file: ${err.message}`),
    });
  }

  async function goPreview() {
    if (!file) return;
    setStep("preview");
    setChecking(true);
    setChecks(null);
    setFatal(null);
    const rows = file.rows
      .map((raw, i) => ({ row: i + 2, result: transformListingRow(raw, mapping) }))
      .filter(
        (t): t is { row: number; result: Extract<ListingRowResult, { ok: true }> } => t.result.ok,
      )
      .map((t) => {
        const k = listingKeys(t.result.fields);
        return { row: t.row, apnKey: k.apnKey, matchKeys: k.matchKeys };
      });
    const r = await checkListingImport({ workspaceId: ws.id, rows });
    setChecking(false);
    if (!r.ok) return setFatal(r.error);
    setChecks(new Map(r.data.map((c) => [c.row, c])));
  }

  async function runImport() {
    if (!file) return;
    setStep("importing");
    setFatal(null);
    const invalid: ErrorRow[] = transformed
      .filter((t) => !t.result.ok)
      .map((t) => ({ row: t.row, message: (t.result as { errors: string[] }).errors.join("; ") }));
    setErrors(invalid);
    const start = await startListingImport({
      workspaceId: ws.id,
      filename: file.filename,
      mapping: mapping as Record<string, string>,
      totalRows: file.rows.length,
    });
    if (!start.ok) {
      setFatal(start.error);
      setStep("preview");
      return;
    }
    const valid = new Set(transformed.filter((t) => t.result.ok).map((t) => t.row));
    const all = file.rows.map((raw, i) => ({ row: i + 2, raw })).filter((r) => valid.has(r.row));
    const totals = { created: 0, updated: 0, unchanged: 0 };
    const chunkErrors: ErrorRow[] = [];
    for (let i = 0; i < all.length; i += CHUNK) {
      const slice = all.slice(i, i + CHUNK).map((r) => ({
        row: r.row,
        raw: Object.fromEntries(Object.entries(r.raw).filter(([k]) => mapping[k])),
      }));
      const res = await importListingChunk({
        workspaceId: ws.id,
        importId: start.data.importId,
        rows: slice,
      });
      if (!res.ok) {
        setFatal(`Upload stopped at row ${slice[0].row}: ${res.error}`);
        await finishListingImport({
          workspaceId: ws.id,
          importId: start.data.importId,
          failed: true,
        });
        setStep("done");
        return;
      }
      totals.created += res.data.created;
      totals.updated += res.data.updated;
      totals.unchanged += res.data.unchanged;
      chunkErrors.push(...res.data.errors);
      setProgress({ done: Math.min(all.length, i + CHUNK), ...totals });
    }
    setErrors([...invalid, ...chunkErrors].sort((a, b) => a.row - b.row));
    await finishListingImport({ workspaceId: ws.id, importId: start.data.importId });
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

  const problems = listingMappingProblems(mapping);
  const steps = ["Upload", "Map columns", "Preview & dedupe", "Import"];
  const stepIndex = { upload: 0, map: 1, preview: 2, importing: 3, done: 3 }[step];

  return (
    <div className="space-y-5">
      <ol className="flex flex-wrap gap-2 text-sm" aria-label="Upload steps">
        {steps.map((s, i) => (
          <li
            key={s}
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
            {i + 1}. {s}
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
              <p className="font-semibold">Drop a CSV of listings here, or choose one</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Your own exports and spreadsheets: address, price, units, cap rate, broker… Columns
                map automatically. Up to {formatNumber(MAX_ROWS)} rows. Nothing is saved until you
                confirm.
              </p>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                id="listing-csv"
                data-testid="listing-csv-input"
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
            <CardTitle className="break-all">Map columns — {file.filename}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {formatNumber(file.rows.length)} rows · {file.headers.length} columns
            </p>
          </CardHeader>
          <CardContent>
            <ul className="divide-y rounded-lg border">
              {file.headers.map((h) => (
                <li
                  key={h}
                  className="grid gap-2 px-3 py-2.5 sm:grid-cols-[1fr_1fr_16rem] sm:items-center"
                >
                  <span className="font-medium break-words">{h}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {file.rows
                      .slice(0, 3)
                      .map((r) => r[h])
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </span>
                  <NativeSelect
                    aria-label={`Map ${h}`}
                    value={mapping[h] ?? ""}
                    onChange={(e) =>
                      setMapping({ ...mapping, [h]: e.target.value as ListingImportField | "" })
                    }
                  >
                    <option value="">Don&apos;t import</option>
                    {LISTING_IMPORT_FIELDS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </NativeSelect>
                </li>
              ))}
            </ul>
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
              <Button
                disabled={problems.length > 0}
                onClick={goPreview}
                data-testid="listing-to-preview"
              >
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
            <p className="text-sm text-muted-foreground">
              A row for a building already in Deal Finder (same APN or address) updates that
              listing; it never creates a duplicate. Values are sourced “CSV: {file.filename}”.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {checking ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Checking{" "}
                {formatNumber(summary.total)} rows…
              </p>
            ) : (
              <dl
                className="grid grid-cols-2 gap-3 sm:grid-cols-4"
                data-testid="listing-import-summary"
              >
                {[
                  ["New listings", summary.create],
                  ["Update existing", summary.update],
                  ["Repeats in file", summary.inFile],
                  ["Invalid rows", summary.invalid],
                ].map(([label, n]) => (
                  <div key={label} className="rounded-lg border p-3">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd
                      className={cn(
                        "text-xl font-bold tabular",
                        label === "Invalid rows" && Number(n) > 0 && "text-brand-danger",
                      )}
                    >
                      {formatNumber(Number(n))}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Row</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transformed.slice(0, 10).map((t) => {
                    const check = checks?.get(t.row);
                    const f = t.result.ok ? t.result.fields : null;
                    return (
                      <TableRow key={t.row}>
                        <TableCell className="tabular">{t.row}</TableCell>
                        <TableCell className="max-w-56 truncate">{f?.address ?? "—"}</TableCell>
                        <TableCell className="text-right tabular">
                          {formatCurrency(f?.price ?? null)}
                        </TableCell>
                        <TableCell className="text-right tabular">
                          {formatNumber(f?.units ?? null)}
                        </TableCell>
                        <TableCell>
                          {!t.result.ok ? (
                            <Badge variant="danger" title={t.result.errors.join("; ")}>
                              {t.result.errors[0]}
                            </Badge>
                          ) : check?.action === "update" ? (
                            <Badge variant="warning">Updates {check.existingAddress}</Badge>
                          ) : check?.action === "duplicate_in_file" ? (
                            <Badge variant="warning">Repeat of row {check.firstRow}</Badge>
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
                data-testid="listing-run-import"
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
              {formatNumber(progress.done)} rows…
            </p>
            <p className="text-sm text-muted-foreground">Keep this page open until it finishes.</p>
          </CardContent>
        </Card>
      )}

      {step === "done" && file && (
        <Card>
          <CardContent className="space-y-4 py-6" data-testid="listing-import-result">
            <p className="flex items-center gap-2 text-lg font-bold">
              {fatal ? (
                <AlertTriangle className="text-brand-danger" aria-hidden />
              ) : (
                <CheckCircle2 className="text-emerald-700" aria-hidden />
              )}
              {fatal ? "Upload stopped" : "Upload complete"}
            </p>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Added", progress.created, "listing-created-count"],
                ["Updated", progress.updated, "listing-updated-count"],
                ["Already up to date", progress.unchanged, "listing-unchanged-count"],
                ["Rows with issues", errors.length, "listing-error-count"],
              ].map(([label, n, id]) => (
                <div key={String(label)} className="rounded-lg border p-3">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="text-xl font-bold tabular" data-testid={String(id)}>
                    {formatNumber(Number(n))}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-wrap gap-2">
              {errors.length > 0 && (
                <Button
                  variant="outline"
                  onClick={downloadErrors}
                  data-testid="listing-download-errors"
                >
                  <Download aria-hidden /> Download error report
                </Button>
              )}
              <Button asChild>
                <Link href={`/w/${ws.slug}/deal-finder?sort=newest`}>View in Deal Finder</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
