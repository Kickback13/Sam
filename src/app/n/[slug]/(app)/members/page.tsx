import { Mail, MapPin, Phone, Users } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/common/empty-state";
import { memberTypeLabel } from "@/features/network/schema";
import { getNetworkContext, listDirectory } from "@/features/network/server/queries";
import { initials } from "@/lib/format";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage({ params }: PageProps<"/n/[slug]/members">) {
  const { slug } = await params;
  const ctx = await getNetworkContext(slug);
  const members = await listDirectory(ctx.workspaceId);
  return (
    <>
      <h1 className="font-display text-xl font-bold">Members</h1>
      <p className="text-sm text-muted-foreground">
        Members who chose to be listed. Contact details appear only when a member adds them to their
        profile.
      </p>
      {members.length === 0 ? (
        <EmptyState icon={Users} title="No members listed yet" />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2" data-testid="directory">
          {members.map((m) => (
            <li
              key={m.id}
              className="space-y-1.5 rounded-xl border bg-card p-4"
              data-testid="directory-member"
            >
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-accent text-sm font-bold text-black"
                >
                  {initials(m.displayName)}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold break-words">{m.displayName}</p>
                  <p className="text-xs text-muted-foreground">{memberTypeLabel(m.memberType)}</p>
                </div>
              </div>
              {m.headline && <p className="text-sm">{m.headline}</p>}
              {m.city && (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="size-3.5" aria-hidden /> {m.city}
                </p>
              )}
              {m.publicEmail && (
                <a
                  href={`mailto:${m.publicEmail}`}
                  className="flex items-center gap-1 text-sm break-all underline"
                >
                  <Mail className="size-3.5 shrink-0" aria-hidden /> {m.publicEmail}
                </a>
              )}
              {m.publicPhone && (
                <a
                  href={`tel:${m.publicPhone}`}
                  className="flex items-center gap-1 text-sm underline"
                >
                  <Phone className="size-3.5 shrink-0" aria-hidden /> {m.publicPhone}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
