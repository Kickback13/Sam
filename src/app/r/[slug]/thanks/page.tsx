import type { Metadata } from "next";

import { PublicThanksPage } from "@/features/azh/components/public-pages";

export const metadata: Metadata = { title: "Request received" };

export default async function Page({ params, searchParams }: PageProps<"/r/[slug]/thanks">) {
  const { slug } = await params;
  const { lang } = await searchParams;
  return <PublicThanksPage slug={slug} lang={lang} />;
}
