import { getFiles } from "../server/queries";
import { FilesPanel, type FileParent } from "./files-panel";

/** Server wrapper: loads files (with signed URLs) for a project or request. */
export async function FilesSection({
  workspaceId,
  parent,
  compact,
  title,
}: {
  workspaceId: string;
  parent: FileParent;
  compact?: boolean;
  title?: string;
}) {
  const files = await getFiles(workspaceId, parent);
  return <FilesPanel files={files} parent={parent} compact={compact} title={title} />;
}
