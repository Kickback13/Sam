import { Download } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime, formatNumber } from "@/lib/format";
import { getImport } from "@/server/queries/imports";
import { getWorkspaceContext } from "@/server/workspace";

export const metadata: Metadata = { title: "Import details" };

export default async function ImportDetailPage({ params }: PageProps<"/w/[slug]/people/import/[id]">) {
  const { slug, id } = await params;
  const { workspace } = await getWorkspaceContext(slug);
  const job = await getImport(workspace.id, id);
  if (!job) notFound();
  const errors = (Array.isArray(job.errors) ? job.errors : []) as { row: number; message: string }[];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={job.filename ?? "Import"}
        back={{ href: `/w/${slug}/people/import`, label: "Imports" }}
        description={`Started ${formatDateTime(job.created_at)}${job.creator ? ` by ${job.creator.full_name || job.creator.email}` : ""}`}
        actions={
          errors.length > 0 && (
            <Button asChild variant="outline" size="sm">
              <a href={`/w/${slug}/people/import/${id}/errors`} download>
                <Download aria-hidden /> Error report (CSV)
              </a>
            </Button>
          )
        }
      />
      <Card>
        <CardContent className="space-y-4 py-5">
          <Badge variant={job.status === "completed" ? "success" : job.status === "failed" ? "danger" : "secondary"}>{job.status}</Badge>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              ["Rows", job.total_rows],
              ["Created", job.created_count],
              ["Updated", job.updated_count],
              ["Skipped", job.skipped_count],
              ["Errors", job.error_count],
            ].map(([label, n]) => (
              <div key={label} className="rounded-lg border p-3">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="text-xl font-bold tabular">{formatNumber(Number(n))}</dd>
              </div>
            ))}
          </dl>
          <p className="text-sm text-muted-foreground">Duplicate handling: {job.dedupe_strategy === "update" ? "update existing contacts" : "skip existing contacts"}.</p>
          {errors.length > 0 && (
            <ul className="max-h-96 divide-y overflow-y-auto rounded-lg border text-sm">
              {errors.slice(0, 200).map((e, i) => (
                <li key={i} className="flex gap-3 px-3 py-2">
                  <span className="w-14 shrink-0 tabular text-muted-foreground">Row {e.row}</span>
                  <span>{e.message}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
