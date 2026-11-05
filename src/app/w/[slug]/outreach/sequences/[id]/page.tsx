import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  EnrollmentStatus,
  SequenceEditor,
  StopEnrollmentButton,
} from "@/features/outreach/components/sequence-components";
import { getSequence } from "@/features/outreach/server/sequence-queries";
import { formatRelative } from "@/lib/format";
import { getWorkspaceContext } from "@/server/workspace";

export const metadata: Metadata = { title: "Sequence" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default async function SequencePage({
  params,
}: PageProps<"/w/[slug]/outreach/sequences/[id]">) {
  const { slug, id } = await params;
  const { workspace } = await getWorkspaceContext(slug);
  const isNew = id === "new";
  if (!isNew && !UUID.test(id)) notFound();
  const seq = isNew ? null : await getSequence(workspace.id, id);
  if (!isNew && !seq) notFound();
  return (
    <>
      <Link
        href={`/w/${slug}/outreach/sequences`}
        className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Sequences
      </Link>
      <PageHeader title={seq?.name ?? "New sequence"} />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SequenceEditor
            initial={{
              id: seq?.id ?? null,
              name: seq?.name ?? "",
              description: seq?.description ?? "",
              active: seq?.active ?? false,
              steps: seq?.steps ?? [],
            }}
          />
        </div>
        {seq && (
          <Card>
            <CardHeader>
              <CardTitle>People in this sequence</CardTitle>
            </CardHeader>
            <CardContent className="pt-1">
              {seq.enrollments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nobody yet. Add contacts from their page (People → a contact → Sequences).
                </p>
              ) : (
                <ul className="divide-y" data-testid="enrollment-list">
                  {seq.enrollments.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                      <Link
                        href={`/w/${slug}/people/${e.contactId}`}
                        className="font-semibold hover:underline"
                      >
                        {e.contactName}
                      </Link>
                      <EnrollmentStatus status={e.status} stopReason={e.stopReason} />
                      {e.status === "active" && (
                        <span className="text-xs text-muted-foreground">
                          step {e.nextPosition} due {formatRelative(e.nextDueAt)}
                        </span>
                      )}
                      {e.status === "active" && (
                        <span className="ml-auto">
                          <StopEnrollmentButton enrollmentId={e.id} />
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
