"use client";

import { Building, Building2, CircleDot, Loader2, Plus, Search, Upload, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { dealNoun, navFor } from "@/lib/nav";
import { searchWorkspace, type SearchHit } from "@/server/actions/workspace";

import { NAV_ICONS } from "./icons";
import { useWorkspace } from "./workspace-provider";

const ENTITY_META = {
  contact: { label: "People", icon: User },
  company: { label: "Companies", icon: Building2 },
  property: { label: "Properties", icon: Building },
  deal: { label: "Deals", icon: CircleDot },
} as const;

export function hitHref(slug: string, hit: Pick<SearchHit, "entityType" | "id">): string {
  switch (hit.entityType) {
    case "contact":
      return `/w/${slug}/people/${hit.id}`;
    case "company":
      return `/w/${slug}/companies/${hit.id}`;
    case "property":
      return `/w/${slug}/properties/${hit.id}`;
    case "deal":
      return `/w/${slug}/pipeline?deal=${hit.id}`;
  }
}

export function CommandMenu({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const ws = useWorkspace();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const searching = query.trim().length >= 2;
  const shownHits = searching ? hits : [];
  const shownLoading = searching && loading;

  function onQueryChange(next: string) {
    setQuery(next);
    if (next.trim().length >= 2) setLoading(true);
  }

  useEffect(() => {
    const q = query.trim();
    const id = ++requestId.current;
    if (q.length < 2) return;
    const timer = setTimeout(async () => {
      const result = await searchWorkspace(ws.id, q);
      if (id !== requestId.current) return;
      setHits(result.ok ? result.data : []);
      setLoading(false);
    }, 180);
    return () => clearTimeout(timer);
  }, [query, ws.id]);

  function go(href: string) {
    onOpenChange(false);
    setQuery("");
    router.push(href);
  }

  const grouped = (Object.keys(ENTITY_META) as SearchHit["entityType"][])
    .map((type) => ({ type, items: shownHits.filter((h) => h.entityType === type) }))
    .filter((g) => g.items.length > 0);

  const deal = dealNoun(ws.businessType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        className="top-[12%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0"
      >
        <DialogTitle className="sr-only">Search {ws.name}</DialogTitle>
        <Command shouldFilter={false} label={`Search ${ws.name}`}>
          <CommandInput
            value={query}
            onValueChange={onQueryChange}
            placeholder="Search people, companies, properties, deals…"
            data-testid="command-input"
          />
          <CommandList>
            {searching && !shownLoading && grouped.length === 0 && (
              <CommandEmpty>No matches in {ws.name}.</CommandEmpty>
            )}
            {shownLoading && (
              <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Searching…
              </div>
            )}
            {!shownLoading &&
              grouped.map(({ type, items }) => {
                const Icon = ENTITY_META[type].icon;
                return (
                  <CommandGroup key={type} heading={ENTITY_META[type].label}>
                    {items.map((hit) => (
                      <CommandItem
                        key={`${hit.entityType}-${hit.id}`}
                        value={`${hit.entityType}-${hit.id}`}
                        onSelect={() => go(hitHref(ws.slug, hit))}
                        data-testid="search-result"
                      >
                        <Icon className="text-muted-foreground" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{hit.title}</span>
                          {hit.subtitle && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {hit.subtitle}
                            </span>
                          )}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                );
              })}
            {!searching && (
              <>
                {ws.canWrite && (
                  <CommandGroup heading="Create">
                    <CommandItem onSelect={() => go(`/w/${ws.slug}/people/new`)}>
                      <Plus aria-hidden /> New contact
                    </CommandItem>
                    <CommandItem onSelect={() => go(`/w/${ws.slug}/pipeline?new=1`)}>
                      <Plus aria-hidden /> New {deal}
                    </CommandItem>
                    <CommandItem onSelect={() => go(`/w/${ws.slug}/properties/new`)}>
                      <Plus aria-hidden /> New property
                    </CommandItem>
                    <CommandItem onSelect={() => go(`/w/${ws.slug}/people/import`)}>
                      <Upload aria-hidden /> Import contacts (CSV)
                    </CommandItem>
                  </CommandGroup>
                )}
                <CommandGroup heading="Go to">
                  {navFor(ws.businessType)
                    .filter((item) => !item.comingIn)
                    .map((item) => {
                      const Icon = NAV_ICONS[item.icon];
                      return (
                        <CommandItem
                          key={item.key}
                          onSelect={() => go(`/w/${ws.slug}/${item.path}`)}
                        >
                          <Icon aria-hidden /> {item.label}
                        </CommandItem>
                      );
                    })}
                </CommandGroup>
              </>
            )}
          </CommandList>
          <div className="flex items-center gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
            <Search className="size-3.5" aria-hidden /> Searching only in <strong>{ws.name}</strong>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
