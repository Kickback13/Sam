import { Building, CircleDot, Mail, MapPin, Pencil, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActivityTimeline } from "@/components/activity/activity-timeline";
import { LogActivity } from "@/components/activity/log-activity";
import { ComplianceBadges } from "@/components/common/compliance-badges";
import { PageHeader } from "@/components/common/page-header";
import { DeleteContactButton } from "@/components/people/delete-contact-button";
import { NewTaskDialog } from "@/components/tasks/new-task-dialog";
import { TaskList } from "@/components/tasks/task-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CONTACT_ROLES, labelFor, PROPERTY_TYPES, SMS_CONSENT_LABELS } from "@/lib/constants";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format";
import { dealNoun } from "@/lib/nav";
import { formatPhone } from "@/lib/normalize";
import { getSubjectActivity } from "@/server/queries/activity";
import { contactDisplayName, getContact, getContactLinks } from "@/server/queries/contacts";
import { getTasks } from "@/server/queries/tasks";
import { getWorkspaceContext } from "@/server/workspace";

type Entry = { value: string; label?: string; type?: string; is_primary?: boolean };

export async function generateMetadata({ params }: PageProps<"/w/[slug]/people/[id]">): Promise<Metadata> {
  const { slug, id } = await params;
  const { workspace } = await getWorkspaceContext(slug);
  const c = await getContact(workspace.id, id);
  return { title: c ? contactDisplayName(c) : "Contact" };
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export default async function ContactPage({ params }: PageProps<"/w/[slug]/people/[id]">) {
  const { slug, id } = await params;
  const { workspace, canWrite } = await getWorkspaceContext(slug);
  const c = await getContact(workspace.id, id);
  if (!c || c.deleted_at) notFound();

  const [links, activity, tasks] = await Promise.all([
    getContactLinks(workspace.id, id),
    getSubjectActivity(workspace.id, [{ type: "contact", id }]),
    getTasks(workspace.id, { related: [{ type: "contact", id }], status: "open" }),
  ]);

  const name = contactDisplayName(c);
  const emails = (Array.isArray(c.emails) ? c.emails : []) as Entry[];
  const phones = (Array.isArray(c.phones) ? c.phones : []) as Entry[];
  const address =
    c.address || c.city || c.zip ? [c.address, [c.city, c.state].filter(Boolean).join(", "), c.zip].filter(Boolean).join(" · ") : "";

  return (
    <>
      <PageHeader
        back={{ href: `/w/${slug}/people`, label: "People" }}
        title={name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {c.title && <span>{c.title}</span>}
            {c.company && (
              <Link href={`/w/${slug}/companies/${c.company.id}`} className="font-semibold text-brand-accent-text hover:underline">
                {c.company.name}
              </Link>
            )}
            {c.roles.map((r) => (
              <Badge key={r} variant="secondary">
                {labelFor(CONTACT_ROLES, r)}
              </Badge>
            ))}
          </span>
        }
        actions={
          canWrite && (
            <>
              <DeleteContactButton contactId={c.id} name={name} />
              <NewTaskDialog related={{ type: "contact", id: c.id, name }} />
              <Button asChild size="sm" variant="outline">
                <Link href={`/w/${slug}/people/${c.id}/edit`}>
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
              <CardTitle>Profile</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="mb-3 flex flex-wrap gap-2">
                {phones[0] && (
                  <Button asChild size="sm" variant="dark">
                    <a href={`tel:${phones.find((p) => p.is_primary)?.value ?? phones[0].value}`}>
                      <Phone aria-hidden /> Call
                    </a>
                  </Button>
                )}
                {emails[0] && !c.email_opt_out && (
                  <Button asChild size="sm" variant="outline">
                    <a href={`mailto:${emails.find((e) => e.is_primary)?.value ?? emails[0].value}`}>
                      <Mail aria-hidden /> Email
                    </a>
                  </Button>
                )}
              </div>
              <dl className="divide-y">
                <Row label="Email">
                  {emails.length
                    ? emails.map((e) => (
                        <span key={e.value} className="block">
                          {e.value}
                          {e.is_primary && emails.length > 1 && <span className="ml-1 text-xs text-muted-foreground">(primary)</span>}
                        </span>
                      ))
                    : "—"}
                </Row>
                <Row label="Phone">
                  {phones.length
                    ? phones.map((p) => (
                        <span key={p.value} className="block tabular">
                          {formatPhone(p.value)}
                          <span className="ml-1 text-xs text-muted-foreground">
                            {p.type && p.type !== "unknown" ? p.type : ""}
                            {p.is_primary && phones.length > 1 ? " · primary" : ""}
                          </span>
                        </span>
                      ))
                    : "—"}
                </Row>
                <Row label="Address">
                  {address ? (
                    <span className="flex gap-1">
                      <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      {address}
                    </span>
                  ) : (
                    "—"
                  )}
                </Row>
                <Row label="Source">{c.source ?? "—"}</Row>
                <Row label="Tags">{c.tags.length ? c.tags.join(", ") : "—"}</Row>
                <Row label="Assigned to">{c.assignee?.full_name || c.assignee?.email || "Unassigned"}</Row>
                <Row label="Language">{c.language === "es" ? "Spanish" : "English"}</Row>
                {c.ghl_contact_id && <Row label="GHL ID">{c.ghl_contact_id}</Row>}
                <Row label="Added">
                  {formatDateTime(c.created_at)}
                  {c.creator && ` by ${c.creator.full_name || c.creator.email}`}
                </Row>
              </dl>
              {c.notes && <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm whitespace-pre-wrap">{c.notes}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Compliance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-2" data-testid="compliance">
              <ComplianceBadges dnc={c.dnc} smsConsent={c.sms_consent} emailOptOut={c.email_opt_out} />
              <dl className="divide-y">
                <Row label="DNC">{c.dnc ? "Yes — do not contact" : "No"}</Row>
                <Row label="SMS">
                  {SMS_CONSENT_LABELS[c.sms_consent]}
                  {c.sms_consent_at && (
                    <span className="block text-xs text-muted-foreground">
                      {formatDateTime(c.sms_consent_at)} · {c.sms_consent_source}
                    </span>
                  )}
                </Row>
                <Row label="Email">
                  {c.email_opt_out ? `Unsubscribed${c.email_opt_out_at ? ` ${formatDateTime(c.email_opt_out_at)}` : ""}` : "Subscribed"}
                </Row>
              </dl>
              <p className="text-xs text-muted-foreground">No automated messages are sent in Phase 1.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CircleDot className="size-4" aria-hidden /> {dealNoun(workspace.businessType, true).replace(/^./, (s) => s.toUpperCase())}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              {links.deals.length === 0 ? (
                <p className="text-sm text-muted-foreground">Not on any {dealNoun(workspace.businessType, true)} yet.</p>
              ) : (
                <ul className="divide-y">
                  {links.deals.map((d) => (
                    <li key={d.id} className="py-2">
                      <Link href={`/w/${slug}/pipeline?deal=${d.id}`} className="font-semibold hover:underline">
                        {d.title}
                      </Link>
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {d.stage && <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: d.stage.color }} />}
                        {d.stage?.name} · {formatCurrency(d.value)} {d.role && `· ${d.role}`}
                      </p>
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
                <p className="text-sm text-muted-foreground">No properties linked as owner.</p>
              ) : (
                <ul className="divide-y">
                  {links.properties.map((p) => (
                    <li key={p.id} className="py-2">
                      <Link href={`/w/${slug}/properties/${p.id}`} className="font-semibold hover:underline">
                        {p.name ?? p.address}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {[p.name ? p.address : null, p.city, p.units !== null ? `${formatNumber(p.units)} units` : null, labelFor(PROPERTY_TYPES, p.property_type)]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5 lg:col-span-2">
          <LogActivity subjectType="contact" subjectId={c.id} />
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Open tasks</CardTitle>
              <NewTaskDialog related={{ type: "contact", id: c.id, name }} />
            </CardHeader>
            <CardContent className="pt-1">
              <TaskList tasks={tasks} showRelated={false} showAssignee emptyText="No open tasks for this contact." />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent className="pt-1">
              <ActivityTimeline items={activity} emptyText="No activity yet. Log a call or add a note above." />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
