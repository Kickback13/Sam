import Link from "next/link";

import { formatNumber } from "@/lib/format";

export function Pagination({
  page,
  pageSize,
  total,
  hrefFor,
}: {
  page: number;
  pageSize: number;
  total: number;
  hrefFor: (page: number) => string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav
      aria-label="Pagination"
      className="mt-3 flex items-center justify-between text-sm text-muted-foreground"
    >
      <span className="tabular">
        {formatNumber(from)}–{formatNumber(to)} of {formatNumber(total)}
      </span>
      <span className="flex gap-2">
        {page > 1 ? (
          <Link
            className="rounded-md border bg-card px-3 py-1.5 font-semibold text-foreground hover:bg-accent"
            href={hrefFor(page - 1)}
          >
            Previous
          </Link>
        ) : null}
        {page < pages ? (
          <Link
            className="rounded-md border bg-card px-3 py-1.5 font-semibold text-foreground hover:bg-accent"
            href={hrefFor(page + 1)}
          >
            Next
          </Link>
        ) : null}
      </span>
    </nav>
  );
}
