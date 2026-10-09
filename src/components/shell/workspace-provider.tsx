"use client";

import { createContext, useContext } from "react";

import type { BusinessType } from "@/lib/nav";
import type { MemberRole } from "@/lib/validation/settings";

export type WorkspaceMember = { id: string; name: string; email: string | null; role: MemberRole };

export type WorkspaceClientContext = {
  id: string;
  slug: string;
  name: string;
  businessType: BusinessType;
  isDemo: boolean;
  role: MemberRole;
  canWrite: boolean;
  isAdmin: boolean;
  userId: string;
  members: WorkspaceMember[];
};

const Ctx = createContext<WorkspaceClientContext | null>(null);

export function WorkspaceProvider({ value, children }: { value: WorkspaceClientContext; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace(): WorkspaceClientContext {
  const value = useContext(Ctx);
  if (!value) throw new Error("useWorkspace must be used inside a workspace");
  return value;
}

/** Helper for building workspace-scoped links. */
export function useWsHref() {
  const { slug } = useWorkspace();
  return (path: string) => `/w/${slug}/${path.replace(/^\//, "")}`;
}
