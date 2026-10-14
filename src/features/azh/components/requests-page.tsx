import { ExternalLink, Inbox } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { ListFilters } from "@/components/common/list-filters";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getSubjectActivity } from "@/server/queries/activity";
import type { WorkspaceContext } from "@/server/workspace";

import { OFFICES, officeLabel, REQUEST_STATUSES } from "../constants";
import { getAzhSettings, getRequest, getRequests, signedUrls } from "../server/queries";
import { REQUEST_STATUS_BADGE, RequestDrawer } from "./request-drawer";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function RequestsPage({
  ctx,
  searchParams,
  requestExtra,
}: {
  ctx: WorkspaceContext;
  searchParams: SP;
  /** Server-rendered sections for the open request (files, visits). */
  requestExtra?: (requestId: string, dealId: string | null) => React.ReactNode;
}) {
  const ws = ctx.workspace;
  const filters = {
    office: one(searchParams.office),
    service: one(searchParams.service),
    status: one(searchParams.status),
    q: one(searchParams.q),
  };
  const openId = one(searchParams.request);
  const [requests, settings, open] = await Promise.all([
    getRequests(ws.id, filters),
    getAzhSettings(ws.id),
    openId && /^[0-9a-f-]{36}$/.test(openId) ? getRequest(ws.id, openId) : null,
  ]);
  const [photoUrls, activity] = open
    ? await Promise.all([
        signedUrls("azh-intake", open.photoPaths),
        getSubjectActivity(
          ws.id,
          [
            ...(open.dealId ? [{ type: "deal" as const, id: open.dealId }] : []),
            ...(open.contact ? [{ type: "contact" as const, id: open.contact.id }] : []),
          ],
          50,
        ),
      ])
    : [{}, []];
  const filtered = Object.values(filters).some(Boolean);
  const newCount = requests.filter((r) => r.status === "new").length;
  const qs = (id: string) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v);
    p.set("request", id);
    return `?${p}`;
  };

  return (
    <>
      <PageHeader
        title="Requests"
        description={`${requests.length} ${filtered ? "matching" : "total"} · ${newCount} new`}
        actions={
          <Link
            href={`/r/${ws.slug}`}
            target="_blank"
            className="inline-flex items-center gap-1 text-sm font-semibold text-brand-accent-text hover:underline"
          >
            Public request form <ExternalLink className="size-3.5" aria-hidden />
          </Link>
        }
      />
      <ListFilters
        values={filters}
        placeholder="Search address, ZIP or description"
        selects={[
          {
            key: "status",
            label: "Status",
            allLabel: "All statuses",
            options: REQUEST_STATUSES.map((s) => ({ value: s.value, label: s.label })),
          },
          {
            key: "office",
            label: "Office",
            allLabel: "Both offices",
            options: OFFICES.map((o) => ({ value: o.value, label: o.label })),
          },
          {
            key: "service",
            label: "Service",
            allLabel: "All services",
            options: (settings?.service_types ?? []).map((s) => ({ value: s, label: s })),
          },
        ]}
      />
      {requests.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={filtered ? "No requests match these filters" : "No homeowner requests yet"}
          description={
            filtered
              ? "Try clearing a filter."
              : "Requests from your public form show up here, routed to the San Diego or Fallbrook office by ZIP code."
          }
        />
      ) : (
        <ul className="space-y-2" data-testid="requests-list">
          {requests.map((r) => (
            <li key={r.id}>
              <Link
                href={qs(r.id)}
                scroll={false}
                className={cn(
                  "grid gap-1 rounded-xl border bg-card px-4 py-3 hover:border-foreground/30 sm:grid-cols-[1fr_auto] sm:items-center",
                  openId === r.id && "border-brand-ink",
                )}
                data-testid="request-row"
              >
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{r.contact?.name ?? "Unnamed"}</span>
                    <Badge variant={REQUEST_STATUS_BADGE[r.status]}>
                      {REQUEST_STATUSES.find((s) => s.value === r.status)?.label ?? r.status}
                    </Badge>
                    {r.photoPaths.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {r.photoPaths.length} photo{r.photoPaths.length === 1 ? "" : "s"}
                      </span>
                    )}
                    {r.language === "es" && <Badge variant="outline">ES</Badge>}
                  </span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {[
                      r.serviceType,
                      r.jobAddress && `${r.jobAddress} ${r.jobZip ?? ""}`.trim(),
                      r.description,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="flex gap-3 text-xs text-muted-foreground sm:flex-col sm:items-end sm:gap-0.5">
                  <span className="font-semibold text-foreground">{officeLabel(r.office)}</span>
                  <span>{formatRelative(r.submittedAt)}</span>
                  {r.assigneeName && <span>→ {r.assigneeName}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Suspense>
        <RequestDrawer
          request={open}
          photoUrls={photoUrls}
          activity={activity}
          extra={open && requestExtra ? requestExtra(open.id, open.dealId) : undefined}
        />
      </Suspense>
    </>
  );
}
