import { Phone } from "lucide-react";
import Link from "next/link";

import { brandStyleBlock } from "@/lib/brand";
import { cn } from "@/lib/utils";

import { OFFICES } from "../constants";
import { DICTS, type Lang } from "../intake/i18n";
import type { PublicForm } from "../server/public-form";

/** Branded frame for the public request form (full page or compact iframe). */
export function PublicShell({
  form,
  lang,
  langHref,
  compact,
  children,
}: {
  form: PublicForm;
  lang: Lang;
  /** Builds the same page URL for the other language. */
  langHref: (lang: Lang) => string;
  compact?: boolean;
  children: React.ReactNode;
}) {
  const t = DICTS[lang];
  return (
    <div lang={lang} className={cn("bg-canvas", compact ? "min-h-0" : "min-h-dvh")}>
      <style>{brandStyleBlock(form.brand)}</style>
      <div className={cn("mx-auto w-full max-w-2xl px-4", compact ? "py-4" : "py-8 sm:py-12")}>
        <header className="mb-5 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden
              className="flex h-10 min-w-12 items-center justify-center rounded-md bg-brand-accent px-2 font-display text-lg font-bold text-black"
            >
              {form.brand.logoText ?? "AZH"}
            </span>
            <span className="truncate font-display text-xl font-bold">{form.name}</span>
          </div>
          <nav
            aria-label={t.language}
            className="flex shrink-0 rounded-md border bg-card p-0.5 text-sm font-semibold"
          >
            {(["en", "es"] as const).map((l) => (
              <Link
                key={l}
                href={langHref(l)}
                hrefLang={l}
                lang={l}
                aria-current={l === lang ? "true" : undefined}
                className={cn(
                  "rounded px-2.5 py-1",
                  l === lang ? "bg-brand-ink text-white" : "text-foreground hover:bg-muted",
                )}
              >
                {l === "en" ? "English" : "Español"}
              </Link>
            ))}
          </nav>
        </header>
        <main className="rounded-xl border bg-card p-4 shadow-sm sm:p-6">{children}</main>
        {!compact && (
          <footer className="mt-6 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            {OFFICES.map((o) => (
              <p key={o.value}>
                <strong className="text-foreground">{o.label}</strong>
                <br />
                {o.address}
                <br />
                <a
                  href={`tel:${o.phone.replace(/\D/g, "")}`}
                  className="inline-flex items-center gap-1 font-semibold text-brand-accent-text hover:underline"
                >
                  <Phone className="size-3.5" aria-hidden /> {o.phone}
                </a>
              </p>
            ))}
          </footer>
        )}
      </div>
    </div>
  );
}

export function ThanksBody({ lang, againHref }: { lang: Lang; againHref: string }) {
  const t = DICTS[lang];
  return (
    <div className="space-y-4 text-center" data-testid="request-thanks">
      <h1 className="text-2xl font-bold">{t.thanksTitle}</h1>
      <p className="text-muted-foreground">{t.thanksBody}</p>
      <ul className="flex flex-col items-center gap-1 text-sm">
        {OFFICES.map((o) => (
          <li key={o.value}>
            {o.label}:{" "}
            <a
              href={`tel:${o.phone.replace(/\D/g, "")}`}
              className="font-semibold text-brand-accent-text hover:underline"
            >
              {o.phone}
            </a>
          </li>
        ))}
      </ul>
      <Link
        href={againHref}
        className="inline-block text-sm font-semibold text-brand-accent-text hover:underline"
      >
        {t.another}
      </Link>
    </div>
  );
}
