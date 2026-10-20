import Link from "next/link";

import { cn } from "@/lib/utils";

export const PROJECT_TABS = [
  { key: "overview", label: "Overview" },
  { key: "estimates", label: "Estimates" },
  { key: "files", label: "Files & Photos" },
  { key: "schedule", label: "Schedule" },
  { key: "budget", label: "Budget" },
  { key: "tasks", label: "Tasks" },
  { key: "activity", label: "Activity" },
] as const;
export type ProjectTab = (typeof PROJECT_TABS)[number]["key"];

export function parseProjectTab(value: unknown): ProjectTab {
  return PROJECT_TABS.some((t) => t.key === value) ? (value as ProjectTab) : "overview";
}

/** Link-based tabs: each tab is a URL (?tab=…), rendered on the server. */
export function ProjectTabs({ base, active }: { base: string; active: ProjectTab }) {
  return (
    <nav
      aria-label="Project sections"
      className="-mx-3 mb-5 overflow-x-auto border-b px-3 sm:mx-0 sm:px-0"
    >
      <ul className="flex gap-1">
        {PROJECT_TABS.map((t) => (
          <li key={t.key}>
            <Link
              href={t.key === "overview" ? base : `${base}?tab=${t.key}`}
              aria-current={active === t.key ? "page" : undefined}
              scroll={false}
              className={cn(
                "-mb-px block shrink-0 border-b-2 px-3 py-2 text-sm font-semibold whitespace-nowrap text-muted-foreground hover:text-foreground",
                active === t.key ? "border-brand-ink text-foreground" : "border-transparent",
              )}
            >
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
