"use client";

import { LogOut } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLE_LABELS } from "@/lib/constants";
import type { MemberRole } from "@/lib/validation/settings";
import { signOut } from "@/server/actions/auth";

export function UserMenu({ name, email, role }: { name: string; email: string | null; role: MemberRole }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full" aria-label={`Account menu for ${name}`} data-testid="user-menu">
        <Avatar name={name} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm font-semibold text-foreground">{name}</span>
          {email && <span className="block truncate text-xs">{email}</span>}
          <span className="mt-1 block text-xs">Role: {ROLE_LABELS[role]}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
