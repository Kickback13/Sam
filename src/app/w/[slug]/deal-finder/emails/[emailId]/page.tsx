import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScoreBadge } from "@/features/h4a/components/badges";
import { EmailViewer } from "@/features/h4a/components/email-viewer";
import { getRealEstateContext } from "@/features/h4a/server/context";
import { getInboundEmail } from "@/features/h4a/server/queries";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Listing email" };

export default async function EmailPage({
  params,
}: PageProps<"/w/[slug]/deal-finder/emails/[emailId]">) {
  const { slug, emailId } = await params;
  const { workspace } = await getRealEstateContext(slug);
  if (!/^[0-9a-f-]{36}$/i.test(emailId)) notFound();
  const found = await getInboundEmail(workspace.id, emailId);
  if (!found) notFound();
  const { email, listings } = found;
  const notes = Array.isArray(email.parse_notes) ? (email.parse_notes as string[]) : [];
  const base = `/w/${slug}/deal-finder`;
  return (
    <>
      <PageHeader
        back={{ href: `${base}/emails`, label: "Listing emails" }}
        title={email.subject ?? "(no subject)"}
        description={`${email.from_address ?? "Unknown sender"} · ${formatDateTime(email.received_at)}`}
      />
      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Email</CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <EmailViewer
              text={email.text_body}
              html={email.html_body}
              title={`Email: ${email.subject ?? ""}`}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Stored sanitized. Links are recorded, never opened by the app.
            </p>
          </CardContent>
        </Card>
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>What was read</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-2 text-sm">
              <p>
                {email.parser_label ?? "Not parsed yet"}
                {email.confidence ? ` · ${email.confidence} confidence` : ""}
              </p>
              {email.error && <p className="text-brand-danger">{email.error}</p>}
              {notes.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                  {notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Listings from this email</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              {listings.length === 0 ? (
                <p className="text-sm text-muted-foreground">None.</p>
              ) : (
                <ul className="divide-y">
                  {listings.map((l) => (
                    <li key={l.id} className="flex items-center gap-3 py-2">
                      <ScoreBadge score={l.score} />
                      <div className="min-w-0">
                        <Link
                          href={`${base}/${l.id}`}
                          className="block font-semibold break-words hover:underline"
                        >
                          {l.address}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {formatCurrency(l.price)} · {formatNumber(l.units)} units
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
