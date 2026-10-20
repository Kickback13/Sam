import { redirect } from "next/navigation";

import { requireConstruction } from "@/features/azh/server/queries";

/** Projects live on the board; /projects is a friendly alias. */
export default async function ProjectsIndex({ params }: PageProps<"/w/[slug]/projects">) {
  const { slug } = await params;
  await requireConstruction(slug);
  redirect(`/w/${slug}/pipeline`);
}
