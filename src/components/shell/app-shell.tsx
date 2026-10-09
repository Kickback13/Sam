"use client";

import { Menu, MoreHorizontal, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { mobilePrimaryNav, type BusinessType } from "@/lib/nav";
import type { MemberRole } from "@/lib/validation/settings";
import { cn } from "@/lib/utils";

import { CommandMenu } from "./command-menu";
import { NAV_ICONS } from "./icons";
import { SidebarNav, type NavCounts } from "./sidebar-nav";
import { UserMenu } from "./user-menu";
import { WorkspaceProvider, type WorkspaceClientContext } from "./workspace-provider";
import { WorkspaceSwitcher, type SwitcherWorkspace } from "./workspace-switcher";

export type AppShellProps = {
  ws: WorkspaceClientContext;
  current: SwitcherWorkspace;
  workspaces: SwitcherWorkspace[];
  counts: NavCounts;
  user: { name: string; email: string | null; role: MemberRole };
  children: React.ReactNode;
};

function SidebarBody({
  props,
  onNavigate,
}: {
  props: Omit<AppShellProps, "children">;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-4 bg-sidebar px-3 py-4 text-sidebar-foreground">
      <WorkspaceSwitcher current={props.current} workspaces={props.workspaces} />
      {props.ws.isDemo && (
        <p className="mx-1 rounded-md bg-violet-200 px-2 py-1.5 text-xs font-semibold text-violet-950">
          Demo workspace — all data is fictional
        </p>
      )}
      <div className="-mx-1 flex-1 overflow-y-auto px-1">
        <SidebarNav
          slug={props.ws.slug}
          businessType={props.ws.businessType as BusinessType}
          counts={props.counts}
          onNavigate={onNavigate}
        />
      </div>
    </div>
  );
}

export function AppShell(props: AppShellProps) {
  const { ws, user, children } = props;
  const [searchOpen, setSearchOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const pathname = usePathname();

  return (
    <WorkspaceProvider value={ws}>
      <div className="min-h-dvh bg-canvas" data-workspace={ws.slug} data-business={ws.businessType}>
        <a
          href="#main"
          className="sr-only z-50 rounded-md bg-background px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          Skip to content
        </a>

        {/* Desktop sidebar */}
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block" aria-label="Sidebar">
          <SidebarBody props={props} />
        </aside>

        <div className="lg:pl-64">
          {/* Top bar */}
          <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur sm:px-4">
            <button
              type="button"
              className="rounded-md p-2 hover:bg-accent lg:hidden"
              onClick={() => setMoreOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="size-5" />
            </button>
            <span className="truncate font-display text-sm font-bold lg:hidden">{ws.name}</span>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="ml-auto flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm text-muted-foreground hover:bg-accent sm:w-72 lg:ml-0 lg:w-96"
              aria-label="Search (Command K)"
              data-testid="open-search"
            >
              <Search className="size-4" aria-hidden />
              <span className="hidden sm:inline">Search…</span>
              <kbd className="ml-auto hidden rounded border bg-muted px-1.5 font-sans text-[11px] font-semibold sm:inline">
                ⌘K
              </kbd>
            </button>
            <div className="flex items-center gap-2 lg:ml-auto">
              {ws.isDemo && (
                <Badge variant="demo" className="hidden sm:inline-flex">
                  Demo data
                </Badge>
              )}
              <UserMenu name={user.name} email={user.email} role={user.role} />
            </div>
          </header>

          <main id="main" className="mx-auto w-full max-w-[1400px] px-3 pt-4 pb-24 sm:px-6 sm:pt-6 lg:pb-10">
            {children}
          </main>
        </div>

        {/* Mobile bottom nav */}
        <nav
          aria-label="Primary"
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-background pb-[env(safe-area-inset-bottom)] lg:hidden"
        >
          {mobilePrimaryNav(ws.businessType).map((item) => {
            const href = `/w/${ws.slug}/${item.path}`;
            const active = pathname === href || pathname.startsWith(`${href}/`);
            const Icon = NAV_ICONS[item.icon];
            return (
              <Link
                key={item.key}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-muted-foreground",
                  active && "text-foreground",
                )}
              >
                <span className={cn("rounded-full px-3 py-0.5", active && "bg-primary text-primary-foreground")}>
                  <Icon className="size-5" aria-hidden />
                </span>
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-muted-foreground"
          >
            <span className="px-3 py-0.5">
              <MoreHorizontal className="size-5" aria-hidden />
            </span>
            More
          </button>
        </nav>

        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetContent side="left" className="w-[85%] max-w-xs border-0 bg-sidebar p-0 text-sidebar-foreground">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SidebarBody props={props} onNavigate={() => setMoreOpen(false)} />
          </SheetContent>
        </Sheet>

        <CommandMenu open={searchOpen} onOpenChange={setSearchOpen} />
      </div>
    </WorkspaceProvider>
  );
}
