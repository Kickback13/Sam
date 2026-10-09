import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/common/page-header";
import { PipelineView } from "@/components/pipeline/pipeline-view";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatNumber } from "@/lib/format";
import { dealNoun } from "@/lib/nav";
import { getBoardDeals } from "@/server/queries/deals";
import { getPipelines } from "@/server/queries/pipelines";
import { getWorkspaceContext } from "@/server/workspace";

export async function generateMetadata({ params }: PageProps<"/w/[slug]/pipeline">): Promise<Metadata> {
  const { slug } = await params;
  const { workspace } = await getWorkspaceContext(slug);
  return { title: workspace.businessType === "construction" ? "Projects" : "Pipeline" };
}

export default async function PipelinePage({ params, searchParams }: PageProps<"/w/[slug]/pipeline">) {
  const { slug } = await params;
  const sp = await searchParams;
  const { workspace, canWrite } = await getWorkspaceContext(slug);
  const pipelines = await getPipelines(workspace.id);
  const pipeline = pipelines.find((p) => p.id === sp.pipeline) ?? pipelines.find((p) => p.isDefault) ?? pipelines[0];

  if (!pipeline) {
    return <PageHeader title="Pipeline" description="No pipeline is configured. An admin can add one in Settings → Pipelines." />;
  }

  const deals = await getBoardDeals(workspace.id, pipeline.id);
  const open = deals.filter((d) => d.status === "open");
  const noun = dealNoun(workspace.businessType, true);
  const title = workspace.businessType === "construction" ? "Projects" : pipeline.name;

  return (
    <>
      <PageHeader
        title={title}
        description={`${formatNumber(open.length)} open ${open.length === 1 ? dealNoun(workspace.businessType) : noun} · ${formatCurrency(open.reduce((s, d) => s + (d.value ?? 0), 0))}`}
        actions={
          canWrite && (
            <Button asChild size="sm">
              <Link href={`/w/${slug}/pipeline?${new URLSearchParams({ ...(sp.pipeline ? { pipeline: String(sp.pipeline) } : {}), new: "1" })}`} scroll={false} data-testid="new-deal">
                <Plus aria-hidden /> New {dealNoun(workspace.businessType)}
              </Link>
            </Button>
          )
        }
      />
      <Suspense>
        <PipelineView pipeline={pipeline} pipelines={pipelines.map((p) => ({ id: p.id, name: p.name }))} deals={deals} />
      </Suspense>
    </>
  );
}
