import { Building, Globe, Mail, Pencil, Phone, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActivityTimeline } from "@/components/activity/activity-timeline";
import { LogActivity } from "@/components/activity/log-activity";
import { DeleteButton } from "@/components/common/delete-button";
import { PageHeader } from "@/components/common/page-header";
import { NewTaskDialog } from "@/components/tasks/new-task-dialog";
import { TaskList } from "@/components/tasks/task-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { COMPANY_TYPES, CONTACT_ROLES, labelFor } from "@/lib/constants";
import { formatNumber } from "@/lib/format";
import { deleteCompany } from "@/server/actions/companies";
import { getSubjectActivity } from "@/server/queries/activity";
import { getCompany, getCompanyLinks } from "@/server/queries/companies";
import { contactDisplayName } from "@/server/queries/contacts";
import { getTasks } from "@/server/queries/tasks";
import { getWorkspaceContext } from "@/server/workspace";

export const metadata: Metadata = { title: "Company" };

export default async function CompanyPage({ params }: PageProps<"/w/[slug]/companies/[id]">) {
  const { slug, id } = await params;
  const { workspace, canWrite } = await getWorkspaceContext(slug);
  const c = await getCompany(workspace.id, id);
  if (!c || c.deleted_at) notFound();
  const [links, activity, tasks] = await Promise.all([
    getCompanyLinks(workspace.id, id),
    getSubjectActivity(workspace.id, [{ type: "company", id }]),
    getTasks(workspace.id, { related: [{ type: "company", id }] }),
  ]);
  const wsId = workspace.id;

  return (
    <>
      <PageHeader
        back={{ href: `/w/${slug}/companies`, label: "Companies" }}
        title={c.name}
        description={labelFor(COMPANY_TYPES, c.type) || undefined}
        actions={
          canWrite && (
            <>
              <DeleteButton
                label="Company"
                confirmText={`Delete ${c.name}? Linked people stay, without the company.`}
                action={deleteCompany.bind(null, { workspaceId: wsId, companyId: c.id })}
                redirectTo={`/w/${slug}/companies`}
              />
              <NewTaskDialog related={{ type: "company", id: c.id, name: c.name }} />
              <Button asChild size="sm" variant="outline">
                <Link href={`/w/${slug}/companies/${c.id}/edit`}>
                  <Pencil aria-hidden /> Edit
                </Link>
              </Button>
            </>
          )
        }
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-2 text-sm">
              {c.website && (
                <p className="flex items-center gap-2">
                  <Globe className="size-4 text-muted-foreground" aria-hidden />
                  <a href={c.website} target="_blank" rel="noreferrer" className="truncate text-brand-accent-text hover:underline">
                    {c.website}
                  </a>
                </p>
              )}
              {c.phone && (
                <p className="flex items-center gap-2">
                  <Phone className="size-4 text-muted-foreground" aria-hidden />
                  <a href={`tel:${c.phone}`}>{c.phone}</a>
                </p>
              )}
              {c.email && (
                <p className="flex items-center gap-2">
                  <Mail className="size-4 text-muted-foreground" aria-hidden />
                  {c.email}
                </p>
              )}
              {(c.address || c.city) && <p className="text-muted-foreground">{[c.address, c.city, c.state, c.zip].filter(Boolean).join(", ")}</p>}
              {c.tags.length > 0 && <p className="text-xs text-muted-foreground">Tags: {c.tags.join(", ")}</p>}
              {c.notes && <p className="rounded-md bg-muted px-3 py-2 whitespace-pre-wrap">{c.notes}</p>}
              {!c.website && !c.phone && !c.email && !c.address && !c.notes && <p className="text-muted-foreground">No details yet.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="size-4" aria-hidden /> People ({formatNumber(links.contacts.length)})
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              {links.contacts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No one linked yet. Set the company on a contact to link them.</p>
              ) : (
                <ul className="divide-y">
                  {links.contacts.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                      <span className="min-w-0">
                        <Link href={`/w/${slug}/people/${p.id}`} className="block truncate font-semibold hover:underline">
                          {contactDisplayName(p)}
                        </Link>
                        {p.title && <span className="block truncate text-xs text-muted-foreground">{p.title}</span>}
                      </span>
                      {p.roles[0] && <Badge variant="secondary">{labelFor(CONTACT_ROLES, p.roles[0])}</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="size-4" aria-hidden /> Properties owned
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              {links.properties.length === 0 ? (
                <p className="text-sm text-muted-foreground">None linked.</p>
              ) : (
                <ul className="divide-y">
                  {links.properties.map((p) => (
                    <li key={p.id} className="py-2">
                      <Link href={`/w/${slug}/properties/${p.id}`} className="font-semibold hover:underline">
                        {p.name ?? p.address}
                      </Link>
                      <p className="text-xs text-muted-foreground">{[p.city, p.units !== null ? `${p.units} units` : null].filter(Boolean).join(" · ")}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-5 lg:col-span-2">
          <LogActivity subjectType="company" subjectId={c.id} />
          <Card>
            <CardHeader>
              <CardTitle>Open tasks</CardTitle>
            </CardHeader>
            <CardContent className="pt-1">
              <TaskList tasks={tasks} showRelated={false} showAssignee emptyText="No open tasks." />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent className="pt-1">
              <ActivityTimeline items={activity} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
