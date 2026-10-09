import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/common/page-header";
import { ImportWizard } from "@/components/people/import-wizard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber, formatRelative } from "@/lib/format";
import { listImports } from "@/server/queries/imports";
import { getWorkspaceContext } from "@/server/workspace";

export const metadata: Metadata = { title: "Import contacts" };

export default async function ImportPage({ params }: PageProps<"/w/[slug]/people/import">) {
  const { slug } = await params;
  const { workspace, canWrite } = await getWorkspaceContext(slug);
  if (!canWrite) redirect(`/w/${slug}/people`);
  const recent = await listImports(workspace.id);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Import contacts"
        back={{ href: `/w/${slug}/people`, label: "People" }}
        description="CSV from GoHighLevel, a spreadsheet or another CRM. Duplicates are matched on email, phone and GHL contact ID."
      />
      <ImportWizard />
      {recent.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Recent imports</CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            <ul className="divide-y">
              {recent.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <Link href={`/w/${slug}/people/import/${i.id}`} className="font-semibold hover:underline">
                    {i.filename ?? "Import"}
                  </Link>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Badge variant={i.status === "completed" ? "success" : i.status === "failed" ? "danger" : "secondary"}>{i.status}</Badge>
                    {formatNumber(i.created_count)} created · {formatNumber(i.updated_count)} updated · {formatNumber(i.error_count)} errors ·{" "}
                    {formatRelative(i.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
