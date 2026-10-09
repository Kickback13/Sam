import type { Metadata } from "next";

import { PipelineEditor } from "@/components/settings/pipeline-editor";
import { getPipelines, getStageTotals } from "@/server/queries/pipelines";
import { getWorkspaceContext } from "@/server/workspace";

export const metadata: Metadata = { title: "Pipelines" };

export default async function PipelinesSettingsPage({
  params,
}: PageProps<"/w/[slug]/settings/pipelines">) {
  const { slug } = await params;
  const { workspace } = await getWorkspaceContext(slug);
  const pipelines = await getPipelines(workspace.id);
  const withCounts = await Promise.all(
    pipelines.map(async (p) => {
      const totals = await getStageTotals(p);
      return {
        id: p.id,
        name: p.name,
        kind: p.kind,
        isDefault: p.isDefault,
        stages: totals.map((s) => ({
          id: s.id,
          name: s.name,
          color: s.color,
          probability: s.probability,
          isWon: s.isWon,
          isLost: s.isLost,
          dealCount: s.dealCount,
        })),
      };
    }),
  );
  return <PipelineEditor pipelines={withCounts} />;
}
