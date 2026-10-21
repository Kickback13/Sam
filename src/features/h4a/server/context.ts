import "server-only";

import { notFound } from "next/navigation";

import { getWorkspaceContext } from "@/server/workspace";

/** Deal Finder pages exist only in real-estate workspaces (404 elsewhere). */
export async function getRealEstateContext(slug: string) {
  const ctx = await getWorkspaceContext(slug);
  if (ctx.workspace.businessType !== "real_estate") notFound();
  return ctx;
}
