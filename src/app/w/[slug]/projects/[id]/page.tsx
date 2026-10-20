import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProjectPage } from "@/features/azh/components/project-page";
import { getProjectDeal, requireConstruction } from "@/features/azh/server/queries";

export async function generateMetadata({
  params,
}: PageProps<"/w/[slug]/projects/[id]">): Promise<Metadata> {
  const { slug, id } = await params;
  const { workspace } = await requireConstruction(slug);
  const deal = await getProjectDeal(workspace.id, id);
  return { title: deal?.title ?? "Project" };
}

export default async function Page({ params, searchParams }: PageProps<"/w/[slug]/projects/[id]">) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const ctx = await requireConstruction(slug);
  const deal = await getProjectDeal(ctx.workspace.id, id);
  if (!deal) notFound();
  return <ProjectPage ctx={ctx} deal={deal} searchParams={sp} />;
}
