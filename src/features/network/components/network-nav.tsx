"use client";

import { Building2, CalendarDays, Newspaper, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/** Bottom tab bar on phones, a row of tabs on wider screens. */
export function NetworkNav({ slug, showMe }: { slug: string; showMe: boolean }) {
  const pathname = usePathname();
  const base = `/n/${slug}`;
  const items = [
    { href: base, label: "Feed", icon: Newspaper, exact: true },
    { href: `${base}/deals`, label: "Deals", icon: Building2 },
    { href: `${base}/events`, label: "Events", icon: CalendarDays },
    { href: `${base}/members`, label: "Members", icon: Users },
    ...(showMe ? [{ href: `${base}/me`, label: "Me", icon: UserRound }] : []),
  ];
  return (
    <nav
      aria-label="Network"
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-background pb-[env(safe-area-inset-bottom)] md:static md:border-0 md:bg-transparent md:pb-0"
    >
      <ul className="mx-auto flex max-w-2xl md:gap-1 md:border-b">
        {items.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1 md:flex-none">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-semibold text-muted-foreground md:-mb-px md:min-h-10 md:flex-row md:gap-1.5 md:border-b-2 md:px-3 md:text-sm",
                  active ? "text-foreground md:border-brand-ink" : "md:border-transparent",
                )}
              >
                <Icon className="size-5 md:size-4" aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
