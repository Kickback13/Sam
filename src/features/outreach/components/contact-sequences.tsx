import { ListOrdered } from "lucide-react";
import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelative } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { getContactEnrollments, getDueSteps } from "../server/sequence-queries";
import { getSmsState, smsOffReason } from "../server/sms-queries";
import {
  DueQueue,
  EnrollForm,
  EnrollmentStatus,
  StopEnrollmentButton,
} from "./sequence-components";

/** Contact page: their sequences, any step due now, and "add to a sequence". */
export async function ContactSequences({
  workspaceId,
  slug,
  contactId,
  dnc,
  myName,
}: {
  workspaceId: string;
  slug: string;
  contactId: string;
  dnc: boolean;
  myName: string | null;
}) {
  const supabase = await createClient();
  const [enrollments, due, sms, { data: active }] = await Promise.all([
    getContactEnrollments(workspaceId, contactId),
    getDueSteps(workspaceId, contactId),
    getSmsState(workspaceId),
    supabase
      .from("outreach_sequences")
      .select("id, name")
      .eq("workspace_id", workspaceId)
      .eq("active", true)
      .order("name"),
  ]);
  const inActive = new Set(
    enrollments.filter((e) => e.status === "active").map((e) => e.sequenceId),
  );
  return (
    <Card data-testid="contact-sequences">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListOrdered className="size-4" aria-hidden /> Sequences
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-1 text-sm">
        {due.length > 0 && (
          <DueQueue
            items={due}
            myName={myName}
            textingOff={smsOffReason(sms)}
            showContact={false}
          />
        )}
        {enrollments.length > 0 && (
          <ul className="divide-y">
            {enrollments.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 py-1.5">
                <Link
                  href={`/w/${slug}/outreach/sequences/${e.sequenceId}`}
                  className="font-medium hover:underline"
                >
                  {e.sequenceName}
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
        <EnrollForm
          contactId={contactId}
          dnc={dnc}
          sequences={(active ?? []).filter((s) => !inActive.has(s.id))}
        />
      </CardContent>
    </Card>
  );
}
