import { Eye } from "lucide-react";
import type { Metadata, Viewport } from "next";
import Link from "next/link";

import { NetworkNav } from "@/features/network/components/network-nav";
import { NetworkPwa } from "@/features/network/components/pwa";
import { getNetworkContext } from "@/features/network/server/queries";
import { brandStyleBlock } from "@/lib/brand";

export async function generateMetadata({ params }: LayoutProps<"/n/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const ctx = await getNetworkContext(slug);
  const title = `${ctx.name} Network`;
  return {
    title: { default: title, template: `%s · ${title}` },
    manifest: `/n/${slug}/manifest.webmanifest`,
    icons: { apple: `/n/${slug}/icon/180`, icon: `/n/${slug}/icon/192` },
    appleWebApp: { capable: true, title, statusBarStyle: "default" },
  };
}

export async function generateViewport({ params }: LayoutProps<"/n/[slug]">): Promise<Viewport> {
  const { slug } = await params;
  const ctx = await getNetworkContext(slug);
  return { themeColor: ctx.brand.primary };
}

/** The member app: own shell, the workspace's brand, no CRM navigation at all. */
export default async function NetworkLayout({ children, params }: LayoutProps<"/n/[slug]">) {
  const { slug } = await params;
  const ctx = await getNetworkContext(slug);
  return (
    <>
      <style data-testid="brand-vars">{brandStyleBlock(ctx.brand)}</style>
      <div className="min-h-dvh bg-background pb-20 md:pb-8">
        <header className="bg-brand-primary text-white">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
            <Link href={`/n/${slug}`} className="font-display text-lg font-bold">
              {ctx.name} <span className="font-normal opacity-80">Network</span>
            </Link>
            {ctx.isStaff && (
              <Link
                href={`/w/${slug}/network`}
                className="inline-flex items-center gap-1 rounded-md bg-white/15 px-2 py-1 text-xs font-semibold"
                data-testid="staff-preview"
              >
                <Eye className="size-3.5" aria-hidden /> Team view · manage
              </Link>
            )}
          </div>
        </header>
        <div className="mx-auto max-w-2xl px-4 md:pt-2">
          <NetworkNav slug={slug} showMe={Boolean(ctx.memberId)} />
          <main className="space-y-4 py-4">
            <NetworkPwa slug={slug} name={`${ctx.name} Network`} />
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
