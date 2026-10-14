import type { Metadata } from "next";

import { SchedulePage } from "@/features/azh/components/schedule-page";
import { requireConstruction } from "@/features/azh/server/queries";

export const metadata: Metadata = { title: "Schedule" };

export default async function Page({ params, searchParams }: PageProps<"/w/[slug]/schedule">) {
  const { slug } = await params;
  const ctx = await requireConstruction(slug);
  return <SchedulePage ctx={ctx} searchParams={await searchParams} />;
}
