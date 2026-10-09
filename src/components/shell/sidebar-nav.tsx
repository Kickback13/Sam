"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { formatNumber } from "@/lib/format";
import { groupNav, navFor, type BusinessType, type CountKey } from "@/lib/nav";
import { cn } from "@/lib/utils";

import { NAV_ICONS } from "./icons";

export type NavCounts = Partial<Record<CountKey, number>>;

export function SidebarNav({
  slug,
  businessType,
  counts,
  onNavigate,
}: {
  slug: string;
  businessType: BusinessType;
  counts: NavCounts;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const groups = groupNav(navFor(businessType));

  return (
    <nav aria-label="Workspace" className="flex flex-col gap-5">
      {groups.map(({ group, items }) => (
        <div key={group}>
          <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wider text-sidebar-muted uppercase">{group}</p>
          <ul className="space-y-0.5">
            {items.map((item) => {
              const href = `/w/${slug}/${item.path}`;
              const active = pathname === href || pathname.startsWith(`${href}/`);
              const Icon = NAV_ICONS[item.icon];
              const count = item.countKey ? counts[item.countKey] : undefined;
              return (
                <li key={item.key}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium text-sidebar-foreground/90 hover:bg-sidebar-hover hover:text-white",
                      active && "bg-sidebar-hover text-white",
                    )}
                  >
                    {active && (
                      <span aria-hidden className="absolute top-1.5 bottom-1.5 left-0 w-1 rounded-r bg-brand-accent" />
                    )}
                    <Icon className="size-4 shrink-0" aria-hidden />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.comingIn ? (
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-sidebar-muted ring-1 ring-sidebar-muted/40">
                        <span className="sr-only">Coming in phase </span>P{item.comingIn}
                      </span>
                    ) : count !== undefined && count > 0 ? (
                      <span
                        className={cn(
                          "min-w-6 rounded-full px-1.5 py-0.5 text-center text-[11px] font-bold tabular",
                          active ? "bg-brand-accent text-black" : "bg-white/10 text-sidebar-foreground",
                        )}
                      >
                        {formatNumber(count)}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
