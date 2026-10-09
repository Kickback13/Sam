import { Upload, UserPlus, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Pagination } from "@/components/common/pagination";
import { ContactsFilters } from "@/components/people/contacts-filters";
import { ContactsTable } from "@/components/people/contacts-table";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import {
  CONTACTS_PAGE_SIZE,
  getContactFacets,
  listContacts,
  type ContactFilters,
} from "@/server/queries/contacts";
import { getWorkspaceContext } from "@/server/workspace";

export const metadata: Metadata = { title: "People" };

function str(v: string | string[] | undefined) {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

export default async function PeoplePage({ params, searchParams }: PageProps<"/w/[slug]/people">) {
  const { slug } = await params;
  const sp = await searchParams;
  const { workspace, canWrite } = await getWorkspaceContext(slug);

  const filters: ContactFilters = {
    q: str(sp.q),
    role: str(sp.role),
    tag: str(sp.tag),
    source: str(sp.source),
    assigned: str(sp.assigned),
    sort: (["name", "created", "updated"] as const).find((s) => s === sp.sort),
    dir: sp.dir === "asc" || sp.dir === "desc" ? sp.dir : undefined,
    page: Number(str(sp.page) ?? 1) || 1,
  };

  const [{ rows, total }, facets] = await Promise.all([
    listContacts(workspace.id, filters),
    getContactFacets(workspace.id),
  ]);
  const filtered = Boolean(
    filters.q || filters.role || filters.tag || filters.source || filters.assigned,
  );

  const hrefFor = (page: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...filters, page }))
      if (v !== undefined && v !== "" && !(k === "page" && v === 1)) p.set(k, String(v));
    return `/w/${slug}/people${p.size ? `?${p}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="People"
        description={`${formatNumber(total)} ${filtered ? "matching" : ""} ${total === 1 ? "contact" : "contacts"}`}
        actions={
          canWrite && (
            <>
              <Button asChild variant="outline" size="sm">
                <Link href={`/w/${slug}/people/import`}>
                  <Upload aria-hidden /> Import CSV
                </Link>
              </Button>
              <Button asChild size="sm">
                <Link href={`/w/${slug}/people/new`} data-testid="new-contact">
                  <UserPlus aria-hidden /> New contact
                </Link>
              </Button>
            </>
          )
        }
      />
      <ContactsFilters filters={filters} tags={facets.tags} sources={facets.sources} />
      {rows.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={Users}
            title="No contacts match"
            description="Try a different search or clear the filters."
          />
        ) : (
          <EmptyState
            icon={Users}
            title="No contacts yet"
            description="Import your GoHighLevel export or a spreadsheet, or add people one at a time."
            actions={
              canWrite && (
                <>
                  <Button asChild>
                    <Link href={`/w/${slug}/people/import`}>
                      <Upload aria-hidden /> Import your contacts
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href={`/w/${slug}/people/new`}>
                      <UserPlus aria-hidden /> Add a contact
                    </Link>
                  </Button>
                </>
              )
            }
          />
        )
      ) : (
        <>
          <ContactsTable rows={rows} />
          <Pagination
            page={filters.page ?? 1}
            pageSize={CONTACTS_PAGE_SIZE}
            total={total}
            hrefFor={hrefFor}
          />
        </>
      )}
    </>
  );
}
