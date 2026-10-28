import { CheckCircle2, MailX } from "lucide-react";
import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { getUnsubscribeInfo } from "@/features/outreach/server/unsubscribe";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };

/** Public, no login. GET only shows the page; the button POSTs (scanners can't unsubscribe anyone). */
export default async function UnsubscribePage({
  params,
  searchParams,
}: PageProps<"/unsubscribe/[token]">) {
  const { token } = await params;
  const { done } = await searchParams;
  const info = await getUnsubscribeInfo(token);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="space-y-4 rounded-xl border bg-card p-6" data-testid="unsubscribe-card">
        {!info ? (
          <>
            <h1 className="text-xl font-bold">This link isn&apos;t valid</h1>
            <p className="text-sm text-muted-foreground">
              It may have been copied incompletely. Reply to the email and ask to be removed, and
              we&apos;ll take care of it.
            </p>
          </>
        ) : info.unsubscribed || done ? (
          <>
            <CheckCircle2 className="size-8 text-emerald-700" aria-hidden />
            <h1 className="text-xl font-bold" data-testid="unsubscribed">
              You&apos;re unsubscribed
            </h1>
            <p className="text-sm text-muted-foreground">
              {info.emailHint ?? "This address"} won&apos;t get newsletters from{" "}
              {info.workspaceName} anymore.
            </p>
          </>
        ) : (
          <>
            <MailX className="size-8 text-muted-foreground" aria-hidden />
            <h1 className="text-xl font-bold">Unsubscribe from {info.workspaceName}?</h1>
            <p className="text-sm text-muted-foreground">
              {info.emailHint ?? "This address"} will stop getting newsletters from{" "}
              {info.workspaceName}.
            </p>
            <form method="post" action={`/api/unsubscribe/${token}`}>
              <input type="hidden" name="from" value="page" />
              <Button type="submit" className="w-full" data-testid="confirm-unsubscribe">
                Unsubscribe
              </Button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
