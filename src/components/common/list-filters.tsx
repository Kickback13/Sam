"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { filterHref, filtersKey, mergeFilters, type FilterValues } from "@/lib/list-filters";

type SelectFilter = {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  allLabel: string;
};

/** Search box + simple select filters synced to the URL. */
export function ListFilters({
  values,
  placeholder,
  selects = [],
}: {
  values: FilterValues;
  placeholder: string;
  selects?: SelectFilter[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(values.q ?? "");
  const [navigating, start] = useTransition();
  // The filters as last requested. While a navigation is in flight, each change
  // builds on this, not on `values` (which lags until the page reloads), so quick
  // successive changes don't drop each other. Once nothing is loading, the
  // server's values win again (they may normalize, and the back button changes them).
  const [requested, setRequested] = useState<FilterValues>(values);
  const latest = useRef<FilterValues>(values);
  const current = navigating ? requested : values;

  const valuesKey = filtersKey(values);
  useEffect(() => {
    if (!navigating) latest.current = values;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valuesKey, navigating]);

  function apply(next: FilterValues) {
    const merged = mergeFilters(latest.current, next);
    latest.current = merged;
    setRequested(merged);
    start(() => router.replace(filterHref(pathname, merged), { scroll: false }));
  }

  useEffect(() => {
    if ((latest.current.q ?? "") === q) return;
    const t = setTimeout(() => apply({ q: q || undefined }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2" role="search">
      <div className="relative w-full sm:w-72">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          aria-label={placeholder}
          placeholder={placeholder}
          className="pl-9"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {selects.map((s) => (
        <NativeSelect
          key={s.key}
          aria-label={s.label}
          className="w-44"
          value={current[s.key] ?? ""}
          onChange={(e) => apply({ [s.key]: e.target.value || undefined })}
        >
          <option value="">{s.allLabel}</option>
          {s.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
      ))}
    </div>
  );
}
