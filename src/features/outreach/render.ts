/**
 * Newsletter body → email HTML + plain text. Pure and dependency-free.
 *
 * The body is plain text with a few markers (the editor shows them):
 *   # Heading / ## Subheading       a line starting with # or ##
 *   - item                          bullet list (consecutive lines)
 *   **bold**                        bold
 *   [link text](https://…)          link (http/https/mailto only)
 *   blank line                      new paragraph
 * Everything is HTML-escaped first, so a body can never inject markup.
 *
 * Every email gets the CAN-SPAM footer: sender name, physical mailing address,
 * why they're receiving it, and a working unsubscribe link. It can't be removed.
 */

export type NewsletterContent = {
  subject: string;
  preheader?: string | null;
  body: string;
};

export type FooterInfo = {
  senderName: string;
  mailingAddress: string;
  /** "You're receiving this because you're a contact of Housing4All." */
  reason: string;
  /** null in previews: shows a placeholder link. */
  unsubscribeUrl: string | null;
};

export type RenderedEmail = { subject: string; html: string; text: string };

export type EmailLanguage = "en" | "es";

/** The footer's fixed words, in each language (CAN-SPAM: always present, can't be removed). */
const FOOTER_TEXT: Record<EmailLanguage, { unsubscribe: string; oneClick: string }> = {
  en: { unsubscribe: "Unsubscribe", oneClick: "one click, no login." },
  es: { unsubscribe: "Cancelar suscripción", oneClick: "un clic, sin iniciar sesión." },
};

/** A newsletter with an optional Spanish version (ADR-045). */
export type BilingualNewsletter = NewsletterContent & {
  subjectEs?: string | null;
  preheaderEs?: string | null;
  bodyEs?: string | null;
};

export function hasSpanishVersion(n: BilingualNewsletter): boolean {
  return Boolean(n.subjectEs?.trim() && n.bodyEs?.trim());
}

/**
 * The version a recipient gets: Spanish when their language is Spanish and the issue has a
 * Spanish version; English otherwise.
 */
export function newsletterVersion(
  n: BilingualNewsletter,
  contactLanguage: string | null | undefined,
): { language: EmailLanguage; content: NewsletterContent } {
  if (contactLanguage === "es" && hasSpanishVersion(n))
    return {
      language: "es",
      content: { subject: n.subjectEs!, preheader: n.preheaderEs ?? null, body: n.bodyEs! },
    };
  return {
    language: "en",
    content: { subject: n.subject, preheader: n.preheader ?? null, body: n.body },
  };
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const SAFE_URL = /^(https?:\/\/|mailto:)[^\s"<>]+$/i;

/** Inline markers on already-escaped text. */
function inline(escaped: string): string {
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label: string, url: string) => {
      // url is escaped already (& → &amp;), which is what an href attribute needs.
      const raw = url.replace(/&amp;/g, "&");
      if (!SAFE_URL.test(raw)) return match;
      return `<a href="${url}" style="color:#007B82">${label}</a>`;
    });
}

/** Inline markers → plain text: "**bold**" → "bold", "[text](url)" → "text (url)". */
function inlineText(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label: string, url: string) =>
      SAFE_URL.test(url) ? `${label} (${url})` : match,
    );
}

type Block = { kind: "h1" | "h2" | "p"; text: string } | { kind: "ul"; items: string[] };

export function parseBody(body: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push({ kind: "p", text: para.join("\n") });
    para = [];
  };
  const flushList = () => {
    if (list.length) blocks.push({ kind: "ul", items: list });
    list = [];
  };
  for (const raw of body.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushPara();
      flushList();
    } else if (/^##\s+/.test(line)) {
      flushPara();
      flushList();
      blocks.push({ kind: "h2", text: line.replace(/^##\s+/, "") });
    } else if (/^#\s+/.test(line)) {
      flushPara();
      flushList();
      blocks.push({ kind: "h1", text: line.replace(/^#\s+/, "") });
    } else if (/^\s*[-*]\s+/.test(line)) {
      flushPara();
      list.push(line.replace(/^\s*[-*]\s+/, ""));
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return blocks;
}

const FONT = "font-family:Arial,Helvetica,sans-serif;color:#111111;";

function blocksToHtml(blocks: Block[]): string {
  return blocks
    .map((b) => {
      switch (b.kind) {
        case "h1":
          return `<h1 style="${FONT}font-size:24px;line-height:1.25;margin:24px 0 12px">${inline(escapeHtml(b.text))}</h1>`;
        case "h2":
          return `<h2 style="${FONT}font-size:19px;line-height:1.3;margin:20px 0 10px">${inline(escapeHtml(b.text))}</h2>`;
        case "ul":
          return `<ul style="${FONT}font-size:16px;line-height:1.5;margin:0 0 16px;padding-left:22px">${b.items
            .map((i) => `<li style="margin:0 0 6px">${inline(escapeHtml(i))}</li>`)
            .join("")}</ul>`;
        default:
          return `<p style="${FONT}font-size:16px;line-height:1.5;margin:0 0 16px">${inline(
            escapeHtml(b.text),
          ).replace(/\n/g, "<br>")}</p>`;
      }
    })
    .join("\n");
}

function blocksToText(blocks: Block[]): string {
  return blocks
    .map((b) => {
      switch (b.kind) {
        case "h1":
          return inlineText(b.text).toUpperCase();
        case "h2":
          return inlineText(b.text);
        case "ul":
          return b.items.map((i) => `- ${inlineText(i)}`).join("\n");
        default:
          return inlineText(b.text);
      }
    })
    .join("\n\n");
}

export const UNSUBSCRIBE_PLACEHOLDER = "#unsubscribe-link-added-when-sent";

export function renderNewsletter(
  content: NewsletterContent,
  footer: FooterInfo,
  language: EmailLanguage = "en",
): RenderedEmail {
  const words = FOOTER_TEXT[language];
  const blocks = parseBody(content.body);
  const unsub = footer.unsubscribeUrl ?? UNSUBSCRIBE_PLACEHOLDER;
  const pre = content.preheader?.trim();
  const address = escapeHtml(footer.mailingAddress).replace(/\n/g, "<br>");

  const html = `<!doctype html>
<html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(content.subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5">
${pre ? `<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(pre)}</div>` : ""}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:8px"><tr><td style="padding:28px 24px">
${blocksToHtml(blocks)}
</td></tr></table>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px"><tr><td style="padding:16px 24px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#444444">
<p style="margin:0 0 8px"><strong>${escapeHtml(footer.senderName)}</strong><br>${address}</p>
<p style="margin:0 0 8px">${escapeHtml(footer.reason)}</p>
<p style="margin:0"><a href="${escapeHtml(unsub)}" style="color:#007B82">${words.unsubscribe}</a> — ${words.oneClick}</p>
</td></tr></table>
</td></tr></table>
</body></html>`;

  const text = [
    blocksToText(blocks),
    "",
    "—",
    footer.senderName,
    footer.mailingAddress,
    "",
    footer.reason,
    `${words.unsubscribe}: ${unsub}`,
  ].join("\n");

  return { subject: content.subject.trim(), html, text };
}

/** "You're receiving this because you're a contact of {workspace}." */
export function defaultReason(workspaceName: string, language: EmailLanguage = "en"): string {
  return language === "es"
    ? `Recibe este mensaje porque es un contacto de ${workspaceName}.`
    : `You're receiving this because you're a contact of ${workspaceName}.`;
}
