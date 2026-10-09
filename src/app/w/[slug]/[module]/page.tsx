import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ComingSoon } from "@/components/common/coming-soon";
import { comingSoonModule } from "@/lib/nav";
import { getWorkspaceContext } from "@/server/workspace";

export async function generateMetadata({ params }: PageProps<"/w/[slug]/[module]">): Promise<Metadata> {
  const { slug, module } = await params;
  const ctx = await getWorkspaceContext(slug);
  return { title: comingSoonModule(module, ctx.workspace.businessType)?.title ?? "Not found" };
}

/** Honest placeholder routes for modules that ship in later phases. */
export default async function FutureModulePage({ params }: PageProps<"/w/[slug]/[module]">) {
  const { slug, module } = await params;
  const ctx = await getWorkspaceContext(slug);
  const info = comingSoonModule(module, ctx.workspace.businessType);
  if (!info) notFound();
  return <ComingSoon module={info} />;
}
