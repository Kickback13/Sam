import { ListOrdered, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OutreachTabs } from "@/features/outreach/components/outreach-chrome";
import { DueQueue } from "@/features/outreach/components/sequence-components";
import { getDueSteps, listSequences } from "@/features/outreach/server/sequence-queries";
import { getSmsState, smsOffReason } from "@/features/outreach/server/sms-queries";
import { formatNumber } from "@/lib/format";
import { getWorkspaceContext } from "@/server/workspace";

export const metadata: Metadata = { title: "Sequences" };

export default async function SequencesPage({ params }: PageProps<"/w/[slug]/outreach/sequences">) {
  const { slug } = await params;
  const { workspace, canWrite, user } = await getWorkspaceContext(slug);
  const [sequences, due, sms] = await Promise.all([
    listSequences(workspace.id),
    getDueSteps(workspace.id),
    getSmsState(workspace.id),
  ]);
  return (
    <>
      <PageHeader
        title="Outreach"
        description="Follow-up sequences: a series of emails and texts, each step due a set number of days after the last. Your team sends every step; nothing goes out by itself, and texts pass the same consent, STOP, do-not-contact and texting-hours checks."
        actions={
          canWrite && (
            <Button asChild size="sm">
              <Link href={`/w/${slug}/outreach/sequences/new`} data-testid="new-sequence">
                <Plus aria-hidden /> New sequence
              </Link>
            </Button>
          )
        }
      />
      <OutreachTabs slug={slug} active="sequences" />
      <section className="space-y-3">
        <h2 className="text-lg font-bold">
          Due now <span className="text-muted-foreground tabular">{formatNumber(due.length)}</span>
        </h2>
        <DueQueue items={due} myName={user.name} textingOff={smsOffReason(sms)} />
      </section>
      <section className="mt-6 space-y-3">
        <h2 className="text-lg font-bold">Sequences</h2>
        {sequences.length === 0 ? (
          <EmptyState
            icon={ListOrdered}
            title="No sequences yet"
            description="Create one, then add contacts from their page. Each step shows up under Due now when it's time."
          />
        ) : (
          <ul className="divide-y rounded-xl border bg-card" data-testid="sequence-list">
            {sequences.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/w/${slug}/outreach/sequences/${s.id}`}
                  className="flex flex-wrap items-center gap-2 px-4 py-3 hover:bg-muted"
                >
                  <span className="font-semibold">{s.name}</span>
                  <Badge variant={s.active ? "success" : "secondary"}>
                    {s.active ? "Active" : "Off"}
                  </Badge>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {s.steps} {s.steps === 1 ? "step" : "steps"} · {s.activeEnrollments} in progress
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
