"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const TABS = [
  { path: "", label: "General & branding" },
  { path: "/members", label: "Members & invites" },
  { path: "/pipelines", label: "Pipelines" },
  { path: "/integrations", label: "Integrations" },
];

export function SettingsNav({ slug }: { slug: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings" className="mb-5 flex gap-1 overflow-x-auto border-b">
      {TABS.map((t) => {
        const href = `/w/${slug}/settings${t.path}`;
        const active = pathname === href;
        return (
          <Link
            key={t.path}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground",
              active ? "border-brand-ink text-foreground" : "border-transparent",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
