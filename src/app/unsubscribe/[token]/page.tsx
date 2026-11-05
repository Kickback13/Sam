import { CheckCircle2, MailX } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";

import { BrandFontPreloads } from "@/components/brand-font-preloads";
import { Button } from "@/components/ui/button";
import { pickBookingLang } from "@/features/h4a/booking/i18n";
import { getUnsubscribeInfo } from "@/features/outreach/server/unsubscribe";
import { UNSUBSCRIBE_TEXT } from "@/features/outreach/unsubscribe-text";
import { DEFAULT_BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };

/** Public, no login. GET only shows the page; the button POSTs (scanners can't unsubscribe anyone). */
export default async function UnsubscribePage({
  params,
  searchParams,
}: PageProps<"/unsubscribe/[token]">) {
  const { token } = await params;
  const { done, lang: langParam } = await searchParams;
  // The Spanish email links here with ?lang=es; otherwise the browser's language decides.
  const lang = pickBookingLang(langParam, (await headers()).get("accept-language"));
  const t = UNSUBSCRIBE_TEXT[lang];
  const info = await getUnsubscribeInfo(token);

  return (
    <main
      className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10"
      lang={lang}
      data-lang={lang}
    >
      <BrandFontPreloads brand={DEFAULT_BRAND} />
      <div className="space-y-4 rounded-xl border bg-card p-6" data-testid="unsubscribe-card">
        {!info ? (
          <>
            <h1 className="text-xl font-bold">{t.invalidTitle}</h1>
            <p className="text-sm text-muted-foreground">{t.invalidBody}</p>
          </>
        ) : info.unsubscribed || done ? (
          <>
            <CheckCircle2 className="size-8 text-emerald-700" aria-hidden />
            <h1 className="text-xl font-bold" data-testid="unsubscribed">
              {t.doneTitle}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t.doneBody(info.emailHint ?? t.thisAddress, info.workspaceName)}
            </p>
          </>
        ) : (
          <>
            <MailX className="size-8 text-muted-foreground" aria-hidden />
            <h1 className="text-xl font-bold">{t.askTitle(info.workspaceName)}</h1>
            <p className="text-sm text-muted-foreground">
              {t.askBody(info.emailHint ?? t.thisAddress, info.workspaceName)}
            </p>
            <form method="post" action={`/api/unsubscribe/${token}`}>
              <input type="hidden" name="from" value="page" />
              <input type="hidden" name="lang" value={lang} />
              <Button type="submit" className="w-full" data-testid="confirm-unsubscribe">
                {t.button}
              </Button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
