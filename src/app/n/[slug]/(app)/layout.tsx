import { Eye } from "lucide-react";
import type { Metadata, Viewport } from "next";
import Link from "next/link";

import { NetworkNav } from "@/features/network/components/network-nav";
import { NetworkPwa } from "@/features/network/components/pwa";
import { PushToggle } from "@/features/network/components/push-toggle";
import { pushConfig } from "@/features/network/push";
import { getNetworkContext } from "@/features/network/server/queries";
import { communityTerms } from "@/features/network/terms";
import { BrandFontPreloads } from "@/components/brand-font-preloads";
import { brandStyleBlock } from "@/lib/brand";

export async function generateMetadata({ params }: LayoutProps<"/n/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const ctx = await getNetworkContext(slug);
  const title = `${ctx.name} ${communityTerms(ctx.kind).suffix}`;
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
  const terms = communityTerms(ctx.kind);
  const push = pushConfig();
  return (
    <>
      <style data-testid="brand-vars">{brandStyleBlock(ctx.brand)}</style>
      <BrandFontPreloads brand={ctx.brand} />
      <div className="min-h-dvh bg-background pb-20 md:pb-8">
        <header className="bg-brand-primary text-white">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
            <Link href={`/n/${slug}`} className="font-display text-lg font-bold">
              {ctx.name} <span className="font-normal opacity-80">{terms.suffix}</span>
            </Link>
            {ctx.isStaff && (
              <Link
                href={`/w/${slug}/${terms.staffPath}`}
                className="inline-flex items-center gap-1 rounded-md bg-white/15 px-2 py-1 text-xs font-semibold"
                data-testid="staff-preview"
              >
                <Eye className="size-3.5" aria-hidden /> Team view · manage
              </Link>
            )}
          </div>
        </header>
        <div className="mx-auto max-w-2xl px-4 md:pt-2">
          <NetworkNav slug={slug} showMe={Boolean(ctx.memberId)} kind={ctx.kind} />
          <main className="space-y-4 py-4">
            <NetworkPwa slug={slug} name={`${ctx.name} ${terms.suffix}`} />
            {push.connected && push.publicKey && (ctx.memberId || ctx.isStaff) && (
              <PushToggle workspaceId={ctx.workspaceId} slug={slug} publicKey={push.publicKey} />
            )}
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
