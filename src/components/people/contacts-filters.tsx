"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { useWorkspace } from "@/components/shell/workspace-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { CONTACT_ROLES } from "@/lib/constants";
import type { ContactFilters } from "@/server/queries/contacts";

type Facet = { value: string; count: number };

export function ContactsFilters({ filters, tags, sources }: { filters: ContactFilters; tags: Facet[]; sources: Facet[] }) {
  const ws = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(filters.q ?? "");
  const [, start] = useTransition();

  function apply(next: Partial<ContactFilters>) {
    const merged = { ...filters, ...next, page: undefined } as Record<string, string | number | undefined>;
    const params = new URLSearchParams();
    for (const [k, val] of Object.entries(merged)) if (val !== undefined && val !== "" && val !== null) params.set(k, String(val));
    start(() => router.replace(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false }));
  }

  useEffect(() => {
    if ((filters.q ?? "") === q) return;
    const t = setTimeout(() => apply({ q: q || undefined }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const active = Boolean(filters.q || filters.role || filters.tag || filters.source || filters.assigned);

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2" role="search" aria-label="Filter people">
      <div className="relative w-full sm:w-64">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          aria-label="Search people"
          placeholder="Search name, email, phone…"
          className="pl-9"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          data-testid="people-search"
        />
      </div>
      <NativeSelect aria-label="Role" className="w-40" value={filters.role ?? ""} onChange={(e) => apply({ role: e.target.value || undefined })}>
        <option value="">All roles</option>
        {CONTACT_ROLES.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect aria-label="Tag" className="w-40" value={filters.tag ?? ""} onChange={(e) => apply({ tag: e.target.value || undefined })}>
        <option value="">All tags</option>
        {tags.map((t) => (
          <option key={t.value} value={t.value}>
            {t.value} ({t.count})
          </option>
        ))}
      </NativeSelect>
      <NativeSelect aria-label="Source" className="w-40" value={filters.source ?? ""} onChange={(e) => apply({ source: e.target.value || undefined })}>
        <option value="">All sources</option>
        {sources.map((s) => (
          <option key={s.value} value={s.value}>
            {s.value} ({s.count})
          </option>
        ))}
      </NativeSelect>
      <NativeSelect aria-label="Assigned to" className="w-40" value={filters.assigned ?? ""} onChange={(e) => apply({ assigned: e.target.value || undefined })}>
        <option value="">Anyone</option>
        <option value="unassigned">Unassigned</option>
        {ws.members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.id === ws.userId ? "Me" : m.name}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label="Sort"
        className="w-44"
        value={`${filters.sort ?? "name"}:${filters.dir ?? ""}`}
        onChange={(e) => {
          const [sort, dir] = e.target.value.split(":");
          apply({ sort: sort as ContactFilters["sort"], dir: (dir || undefined) as ContactFilters["dir"] });
        }}
      >
        <option value="name:">Name A–Z</option>
        <option value="name:desc">Name Z–A</option>
        <option value="updated:">Recently updated</option>
        <option value="created:">Newest first</option>
        <option value="created:asc">Oldest first</option>
      </NativeSelect>
      {active && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setQ("");
            start(() => router.replace(pathname, { scroll: false }));
          }}
        >
          <X aria-hidden /> Clear
        </Button>
      )}
    </div>
  );
}
