import { Building2, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { ListFilters } from "@/components/common/list-filters";
import { PageHeader } from "@/components/common/page-header";
import { Pagination } from "@/components/common/pagination";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { COMPANY_TYPES, labelFor } from "@/lib/constants";
import { formatNumber, formatRelative } from "@/lib/format";
import { COMPANIES_PAGE_SIZE, listCompanies } from "@/server/queries/companies";
import { getWorkspaceContext } from "@/server/workspace";

export const metadata: Metadata = { title: "Companies" };

export default async function CompaniesPage({ params, searchParams }: PageProps<"/w/[slug]/companies">) {
  const { slug } = await params;
  const sp = await searchParams;
  const { workspace, canWrite } = await getWorkspaceContext(slug);
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const type = typeof sp.type === "string" ? sp.type : undefined;
  const page = Number(sp.page ?? 1) || 1;
  const { rows, total } = await listCompanies(workspace.id, { q, type, page });

  return (
    <>
      <PageHeader
        title="Companies"
        description={`${formatNumber(total)} ${total === 1 ? "company" : "companies"}`}
        actions={
          canWrite && (
            <Button asChild size="sm">
              <Link href={`/w/${slug}/companies/new`}>
                <Plus aria-hidden /> New company
              </Link>
            </Button>
          )
        }
      />
      <ListFilters
        values={{ q, type }}
        placeholder="Search companies…"
        selects={[{ key: "type", label: "Type", allLabel: "All types", options: COMPANY_TYPES.map((t) => ({ value: t.value, label: t.label })) }]}
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={q || type ? "No companies match" : "No companies yet"}
          description="Brokerages, property managers, lenders, GCs and owner entities. Companies are also created automatically from CSV imports."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="hidden md:table-cell">Phone</TableHead>
                <TableHead className="hidden md:table-cell">City</TableHead>
                <TableHead className="text-right">People</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="max-w-72">
                    <Link href={`/w/${slug}/companies/${c.id}`} className="block truncate font-semibold hover:underline">
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">{labelFor(COMPANY_TYPES, c.type) || "—"}</TableCell>
                  <TableCell className="hidden whitespace-nowrap md:table-cell">{c.phone ?? "—"}</TableCell>
                  <TableCell className="hidden md:table-cell">{c.city ?? "—"}</TableCell>
                  <TableCell className="text-right tabular">{formatNumber(c.contactCount)}</TableCell>
                  <TableCell className="hidden text-right text-xs text-muted-foreground sm:table-cell">{formatRelative(c.updated_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Pagination
        page={page}
        pageSize={COMPANIES_PAGE_SIZE}
        total={total}
        hrefFor={(p) => {
          const params = new URLSearchParams();
          if (q) params.set("q", q);
          if (type) params.set("type", type);
          if (p > 1) params.set("page", String(p));
          return `/w/${slug}/companies${params.size ? `?${params}` : ""}`;
        }}
      />
    </>
  );
}
