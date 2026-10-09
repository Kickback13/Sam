"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

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
  values: Record<string, string | undefined>;
  placeholder: string;
  selects?: SelectFilter[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(values.q ?? "");
  const [, start] = useTransition();

  function apply(next: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...values, ...next, page: undefined }))
      if (v) params.set(k, v);
    start(() => router.replace(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false }));
  }

  useEffect(() => {
    if ((values.q ?? "") === q) return;
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
          value={values[s.key] ?? ""}
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
