import type { Metadata } from "next";

import { RequestsPage } from "@/features/azh/components/requests-page";
import { requireConstruction } from "@/features/azh/server/queries";

export const metadata: Metadata = { title: "Requests" };

export default async function Page({ params, searchParams }: PageProps<"/w/[slug]/requests">) {
  const { slug } = await params;
  const ctx = await requireConstruction(slug);
  return <RequestsPage ctx={ctx} searchParams={await searchParams} />;
}
