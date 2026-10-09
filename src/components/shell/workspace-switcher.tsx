"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { rememberWorkspace } from "@/server/actions/workspace";

export type SwitcherWorkspace = {
  id: string;
  name: string;
  slug: string;
  isDemo: boolean;
  businessLabel: string;
  accent: string;
  logoText: string;
};

export function WorkspaceLogo({ accent, text, className }: { accent: string; text: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-md font-display font-extrabold text-black ${className ?? "size-9 text-[11px]"}`}
      style={{ backgroundColor: accent }}
    >
      {text}
    </span>
  );
}

export function WorkspaceSwitcher({
  current,
  workspaces,
  variant = "sidebar",
}: {
  current: SwitcherWorkspace;
  workspaces: SwitcherWorkspace[];
  variant?: "sidebar" | "light";
}) {
  const router = useRouter();
  const dark = variant === "sidebar";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={`flex w-full items-center gap-3 rounded-lg p-2 text-left ${dark ? "hover:bg-sidebar-hover" : "border hover:bg-accent"}`}
        aria-label={`Workspace: ${current.name}. Switch workspace`}
        data-testid="workspace-switcher"
      >
        <WorkspaceLogo accent={current.accent} text={current.logoText} />
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm font-bold ${dark ? "text-white" : ""}`}>{current.name}</span>
          <span className={`block truncate text-xs ${dark ? "text-sidebar-muted" : "text-muted-foreground"}`}>
            {current.businessLabel}
          </span>
        </span>
        <ChevronsUpDown className={`size-4 shrink-0 ${dark ? "text-sidebar-muted" : "text-muted-foreground"}`} aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        {workspaces.map((w) => (
          <DropdownMenuItem
            key={w.id}
            data-testid={`switch-to-${w.slug}`}
            onSelect={() => {
              if (w.id === current.id) return;
              void rememberWorkspace(w.id);
              router.push(`/w/${w.slug}/today`);
            }}
          >
            <WorkspaceLogo accent={w.accent} text={w.logoText} className="size-7 text-[9px]" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{w.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {w.isDemo ? "Demo · fictional data" : w.businessLabel}
              </span>
            </span>
            {w.id === current.id && <Check className="text-brand-accent-text" aria-label="Current" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-xs text-muted-foreground">Each workspace&apos;s data is fully separate.</p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
