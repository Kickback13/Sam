import { CircleDot, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActivityTimeline } from "@/components/activity/activity-timeline";
import { LogActivity } from "@/components/activity/log-activity";
import { DeleteButton } from "@/components/common/delete-button";
import { PageHeader } from "@/components/common/page-header";
import { SourceChip } from "@/components/common/source-chip";
import { NewTaskDialog } from "@/components/tasks/new-task-dialog";
import { TaskList } from "@/components/tasks/task-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { labelFor, PROPERTY_TYPES } from "@/lib/constants";
import { parseFieldSources } from "@/lib/field-sources";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { dealNoun } from "@/lib/nav";
import { deleteProperty } from "@/server/actions/properties";
import { getSubjectActivity } from "@/server/queries/activity";
import { getProperty, getPropertyDeals } from "@/server/queries/properties";
import { getTasks } from "@/server/queries/tasks";
import { getWorkspaceContext } from "@/server/workspace";

export const metadata: Metadata = { title: "Property" };

export default async function PropertyPage({ params }: PageProps<"/w/[slug]/properties/[id]">) {
  const { slug, id } = await params;
  const { workspace, canWrite } = await getWorkspaceContext(slug);
  const p = await getProperty(workspace.id, id);
  if (!p || p.deleted_at) notFound();
  const [deals, activity, tasks] = await Promise.all([
    getPropertyDeals(workspace.id, id),
    getSubjectActivity(workspace.id, [{ type: "property", id }]),
    getTasks(workspace.id, { related: [{ type: "property", id }] }),
  ]);
  const sources = parseFieldSources(p.field_sources);
  const title = p.name ?? p.address;
  const pricePerUnit = p.last_sale_price && p.units ? p.last_sale_price / p.units : null;

  const facts: { key: string; label: string; value: string }[] = [
    {
      key: "property_type",
      label: "Type",
      value: labelFor(PROPERTY_TYPES, p.property_type) || "—",
    },
    { key: "units", label: "Units", value: formatNumber(p.units) },
    { key: "buildings", label: "Buildings", value: formatNumber(p.buildings) },
    { key: "building_sqft", label: "Building sq ft", value: formatNumber(p.building_sqft) },
    { key: "lot_sqft", label: "Lot sq ft", value: formatNumber(p.lot_sqft) },
    { key: "year_built", label: "Year built", value: p.year_built ? String(p.year_built) : "—" },
    { key: "zoning", label: "Zoning", value: p.zoning ?? "—" },
    { key: "apn", label: "APN", value: p.apn ?? "—" },
    { key: "last_sale_date", label: "Last sale date", value: formatDate(p.last_sale_date) },
    { key: "last_sale_price", label: "Last sale price", value: formatCurrency(p.last_sale_price) },
    { key: "assessed_value", label: "Assessed value", value: formatCurrency(p.assessed_value) },
  ];

  return (
    <>
      <PageHeader
        back={{ href: `/w/${slug}/properties`, label: "Properties" }}
        title={title}
        description={[
          p.name ? p.address : null,
          p.city,
          p.state,
          p.zip,
          p.county ? `${p.county} County` : null,
        ]
          .filter(Boolean)
          .join(", ")}
        actions={
          canWrite && (
            <>
              <DeleteButton
                label="Property"
                confirmText={`Delete ${title}?`}
                action={deleteProperty.bind(null, { workspaceId: workspace.id, propertyId: p.id })}
                redirectTo={`/w/${slug}/properties`}
              />
              <NewTaskDialog related={{ type: "property", id: p.id, name: title }} />
              <Button asChild size="sm" variant="outline">
                <Link href={`/w/${slug}/properties/${p.id}/edit`}>
                  <Pencil aria-hidden /> Edit
                </Link>
              </Button>
            </>
          )
        }
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Key facts</CardTitle>
              <p className="text-xs text-muted-foreground">
                Every value shows where it came from and when.
              </p>
            </CardHeader>
            <CardContent className="pt-2">
              <dl className="grid gap-x-6 sm:grid-cols-2" data-testid="property-facts">
                {facts.map((f) => (
                  <div key={f.key} className="flex flex-col gap-1 border-b py-2.5">
                    <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      {f.label}
                    </dt>
                    <dd className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold tabular">{f.value}</span>
                      {f.value !== "—" && <SourceChip source={sources[f.key]} />}
                    </dd>
                  </div>
                ))}
                {pricePerUnit !== null && (
                  <div className="flex flex-col gap-1 border-b py-2.5">
                    <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      Last sale / unit
                    </dt>
                    <dd className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold tabular">{formatCurrency(pricePerUnit)}</span>
                      <span className="text-[11px] text-muted-foreground">
                        Calculated from sale price ÷ units
                      </span>
                    </dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>
          <LogActivity subjectType="property" subjectId={p.id} />
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent className="pt-1">
              <ActivityTimeline items={activity} />
            </CardContent>
          </Card>
        </div>
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Owner</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 pt-2 text-sm">
              {p.owner ? (
                <Link
                  href={`/w/${slug}/people/${p.owner.id}`}
                  className="block font-semibold hover:underline"
                >
                  {p.owner.full_name ?? "Owner"}
                </Link>
              ) : null}
              {p.owner_company ? (
                <Link
                  href={`/w/${slug}/companies/${p.owner_company.id}`}
                  className="block font-semibold hover:underline"
                >
                  {p.owner_company.name}
                </Link>
              ) : null}
              {!p.owner && !p.owner_company && (
                <p className="text-muted-foreground">
                  No owner linked. County ownership verification arrives in Phase 2.
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CircleDot className="size-4" aria-hidden />{" "}
                {dealNoun(workspace.businessType, true).replace(/^./, (x) => x.toUpperCase())}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              {deals.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No {dealNoun(workspace.businessType, true)} on this property.
                </p>
              ) : (
                <ul className="divide-y">
                  {deals.map((d) => (
                    <li key={d.id} className="py-2">
                      <Link
                        href={`/w/${slug}/pipeline?deal=${d.id}`}
                        className="font-semibold hover:underline"
                      >
                        {d.title}
                      </Link>
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {d.stage && (
                          <span
                            aria-hidden
                            className="size-2 rounded-full"
                            style={{ backgroundColor: d.stage.color }}
                          />
                        )}
                        {d.stage?.name} · {formatCurrency(d.value)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Open tasks</CardTitle>
            </CardHeader>
            <CardContent className="pt-1">
              <TaskList tasks={tasks} showRelated={false} showAssignee emptyText="No open tasks." />
            </CardContent>
          </Card>
          {p.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent className="pt-2 text-sm whitespace-pre-wrap">{p.notes}</CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
