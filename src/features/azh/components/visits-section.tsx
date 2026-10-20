import { getVisits, type RequestListItem } from "../server/queries";
import { ScheduleVisitDialog } from "./schedule-visit-dialog";
import { VisitList } from "./visit-list";

export async function RequestVisits({
  workspaceId,
  request,
}: {
  workspaceId: string;
  request: RequestListItem;
}) {
  const visits = await getVisits(workspaceId, { requestId: request.id });
  return (
    <section aria-label="Estimate visits" className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold">Estimate visits</h3>
        <ScheduleVisitDialog
          requestId={request.id}
          dealId={request.dealId}
          defaultOffice={request.office}
          defaultAddress={[request.jobAddress, request.jobZip].filter(Boolean).join(" ")}
        />
      </div>
      <VisitList visits={visits} emptyText="No visit booked yet." />
    </section>
  );
}
