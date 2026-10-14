import { notFound } from "next/navigation";

import { DICTS, parseLang } from "../intake/i18n";
import { getPublicForm } from "../server/public-form";
import { PublicShell, ThanksBody } from "./public-shell";
import { RequestForm } from "./request-form";

type Props = { slug: string; lang?: string | string[]; embed?: boolean };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function PublicRequestPage({ slug, lang: rawLang, embed }: Props) {
  const form = await getPublicForm(slug);
  if (!form) notFound();
  const lang = parseLang(one(rawLang));
  const t = DICTS[lang];
  const base = `/r/${slug}${embed ? "/embed" : ""}`;
  return (
    <PublicShell form={form} lang={lang} compact={embed} langHref={(l) => `${base}?lang=${l}`}>
      <h1 className="text-2xl font-bold">{t.title}</h1>
      <p className="mt-1 mb-5 text-muted-foreground">{t.intro}</p>
      <RequestForm
        slug={slug}
        workspaceId={form.workspaceId}
        lang={lang}
        serviceTypes={form.serviceTypes}
        thanksPath={`${base}/thanks?lang=${lang}`}
      />
    </PublicShell>
  );
}

export async function PublicThanksPage({ slug, lang: rawLang, embed }: Props) {
  const form = await getPublicForm(slug);
  if (!form) notFound();
  const lang = parseLang(one(rawLang));
  const base = `/r/${slug}${embed ? "/embed" : ""}`;
  return (
    <PublicShell
      form={form}
      lang={lang}
      compact={embed}
      langHref={(l) => `${base}/thanks?lang=${l}`}
    >
      <ThanksBody lang={lang} againHref={`${base}?lang=${lang}`} />
    </PublicShell>
  );
}
