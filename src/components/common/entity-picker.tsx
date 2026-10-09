"use client";

import { Check, ChevronsUpDown, Loader2, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { useWorkspace } from "@/components/shell/workspace-provider";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { searchWorkspace, type SearchHit } from "@/server/actions/workspace";

export type PickedEntity = { id: string; label: string };

/** Search-as-you-type picker for a company, contact, property or deal in the current workspace. */
export function EntityPicker({
  id,
  entityType,
  value,
  onChange,
  placeholder = "Search…",
  invalid,
}: {
  id?: string;
  entityType: SearchHit["entityType"];
  value: PickedEntity | null;
  onChange: (value: PickedEntity | null) => void;
  placeholder?: string;
  invalid?: boolean;
}) {
  const ws = useWorkspace();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const req = useRef(0);
  const listId = useId();
  const searching = query.trim().length >= 2;
  const shownHits = searching ? hits : [];
  const shownLoading = searching && loading;

  function onQueryChange(next: string) {
    setQuery(next);
    if (next.trim().length >= 2) setLoading(true);
  }

  useEffect(() => {
    const q = query.trim();
    const n = ++req.current;
    if (q.length < 2) return;
    const t = setTimeout(async () => {
      const result = await searchWorkspace(ws.id, q);
      if (n !== req.current) return;
      setHits(result.ok ? result.data.filter((h) => h.entityType === entityType) : []);
      setLoading(false);
    }, 180);
    return () => clearTimeout(t);
  }, [query, ws.id, entityType]);

  return (
    <div className="flex gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-invalid={invalid}
            className={cn(
              "flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-base md:text-sm",
              !value && "text-muted-foreground",
              invalid && "border-destructive",
            )}
          >
            <span className="truncate">{value?.label ?? placeholder}</span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-60" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent id={listId} className="w-[--radix-popover-trigger-width] min-w-72 p-0">
          <Command shouldFilter={false}>
            <CommandInput value={query} onValueChange={onQueryChange} placeholder={placeholder} />
            <CommandList>
              {shownLoading && (
                <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden /> Searching…
                </div>
              )}
              {!shownLoading && searching && shownHits.length === 0 && (
                <CommandEmpty>No matches.</CommandEmpty>
              )}
              {!searching && (
                <p className="px-3 py-4 text-sm text-muted-foreground">
                  Type at least 2 characters.
                </p>
              )}
              {shownHits.length > 0 && (
                <CommandGroup>
                  {shownHits.map((h) => (
                    <CommandItem
                      key={h.id}
                      value={h.id}
                      onSelect={() => {
                        onChange({ id: h.id, label: h.title });
                        setOpen(false);
                        setQuery("");
                      }}
                    >
                      <Check
                        className={cn(
                          "text-brand-accent-text",
                          value?.id === h.id ? "opacity-100" : "opacity-0",
                        )}
                        aria-hidden
                      />
                      <span className="min-w-0">
                        <span className="block truncate">{h.title}</span>
                        {h.subtitle && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {h.subtitle}
                          </span>
                        )}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="rounded-md border border-input px-2 text-muted-foreground hover:bg-accent"
          aria-label="Clear selection"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
