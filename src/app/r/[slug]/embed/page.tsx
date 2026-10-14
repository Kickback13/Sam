import type { Metadata } from "next";

import { PublicRequestPage } from "@/features/azh/components/public-pages";

export const metadata: Metadata = { title: "Request an estimate" };

export default async function Page({ params, searchParams }: PageProps<"/r/[slug]/embed">) {
  const { slug } = await params;
  const { lang } = await searchParams;
  return <PublicRequestPage slug={slug} lang={lang} embed />;
}
