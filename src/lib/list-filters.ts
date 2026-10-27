export type FilterValues = Record<string, string | undefined>;

/** Merge a change into the current filters; any filter change resets to page 1. */
export function mergeFilters(current: FilterValues, next: FilterValues): FilterValues {
  const out: FilterValues = {};
  for (const [k, v] of Object.entries({ ...current, ...next, page: undefined })) if (v) out[k] = v;
  return out;
}

export function filterHref(pathname: string, values: FilterValues): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(values)) if (v) params.set(k, v);
  return `${pathname}${params.size ? `?${params}` : ""}`;
}

/** Order-insensitive key for comparing filter sets (blank values ignored). */
export function filtersKey(values: FilterValues): string {
  return JSON.stringify(
    Object.entries(values)
      .filter(([, v]) => v)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}
