import { Building, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { ListFilters } from "@/components/common/list-filters";
import { PageHeader } from "@/components/common/page-header";
import { Pagination } from "@/components/common/pagination";
import { SourceChip } from "@/components/common/source-chip";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { labelFor, PROPERTY_TYPES } from "@/lib/constants";
import { parseFieldSources } from "@/lib/field-sources";
import { formatCurrency, formatNumber } from "@/lib/format";
import {
  listProperties,
  PROPERTIES_PAGE_SIZE,
  type PropertyFilters,
} from "@/server/queries/properties";
import { getWorkspaceContext } from "@/server/workspace";

export const metadata: Metadata = { title: "Properties" };

export default async function PropertiesPage({
  params,
  searchParams,
}: PageProps<"/w/[slug]/properties">) {
  const { slug } = await params;
  const sp = await searchParams;
  const { workspace, canWrite } = await getWorkspaceContext(slug);
  const f: PropertyFilters = {
    q: typeof sp.q === "string" ? sp.q : undefined,
    type: typeof sp.type === "string" ? sp.type : undefined,
    sort: sp.sort === "units" || sp.sort === "address" ? sp.sort : undefined,
    page: Number(sp.page ?? 1) || 1,
  };
  const { rows, total } = await listProperties(workspace.id, f);

  return (
    <>
      <PageHeader
        title="Properties"
        description={`${formatNumber(total)} ${total === 1 ? "property" : "properties"} · every value shows its source`}
        actions={
          canWrite && (
            <Button asChild size="sm">
              <Link href={`/w/${slug}/properties/new`} data-testid="new-property">
                <Plus aria-hidden /> New property
              </Link>
            </Button>
          )
        }
      />
      <ListFilters
        values={{ q: f.q, type: f.type, sort: f.sort }}
        placeholder="Search address, APN, submarket…"
        selects={[
          {
            key: "type",
            label: "Type",
            allLabel: "All types",
            options: PROPERTY_TYPES.map((t) => ({ value: t.value, label: t.label })),
          },
          {
            key: "sort",
            label: "Sort",
            allLabel: "Recently updated",
            options: [
              { value: "units", label: "Most units" },
              { value: "address", label: "Address A–Z" },
            ],
          },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={Building}
          title={f.q || f.type ? "No properties match" : "No properties yet"}
          description="Add properties by hand now. County-record verification and licensed data arrive in Phases 2–3, each value with its source."
          actions={
            canWrite && (
              <Button asChild>
                <Link href={`/w/${slug}/properties/new`}>
                  <Plus aria-hidden /> Add a property
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Property</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Units</TableHead>
                <TableHead className="hidden text-right md:table-cell">Built</TableHead>
                <TableHead className="hidden text-right lg:table-cell">Last sale</TableHead>
                <TableHead className="hidden md:table-cell">Owner</TableHead>
                <TableHead className="hidden xl:table-cell">Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => {
                const sources = parseFieldSources(p.field_sources);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="max-w-72">
                      <Link
                        href={`/w/${slug}/properties/${p.id}`}
                        className="block truncate font-semibold hover:underline"
                      >
                        {p.name ?? p.address}
                      </Link>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[p.name ? p.address : null, p.city, p.submarket]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {labelFor(PROPERTY_TYPES, p.property_type) || "—"}
                    </TableCell>
                    <TableCell className="text-right tabular">{formatNumber(p.units)}</TableCell>
                    <TableCell className="hidden text-right tabular md:table-cell">
                      {p.year_built ?? "—"}
                    </TableCell>
                    <TableCell className="hidden text-right tabular lg:table-cell">
                      {formatCurrency(p.last_sale_price, { compact: true })}
                    </TableCell>
                    <TableCell className="hidden max-w-48 truncate md:table-cell">
                      {p.owner ? (
                        <Link href={`/w/${slug}/people/${p.owner.id}`} className="hover:underline">
                          {p.owner.full_name ?? "Owner"}
                        </Link>
                      ) : p.owner_company ? (
                        <Link
                          href={`/w/${slug}/companies/${p.owner_company.id}`}
                          className="hover:underline"
                        >
                          {p.owner_company.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      {p.units !== null ? (
                        <SourceChip source={sources.units} />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <Pagination
        page={f.page ?? 1}
        pageSize={PROPERTIES_PAGE_SIZE}
        total={total}
        hrefFor={(page) => {
          const params = new URLSearchParams();
          if (f.q) params.set("q", f.q);
          if (f.type) params.set("type", f.type);
          if (f.sort) params.set("sort", f.sort);
          if (page > 1) params.set("page", String(page));
          return `/w/${slug}/properties${params.size ? `?${params}` : ""}`;
        }}
      />
    </>
  );
}
