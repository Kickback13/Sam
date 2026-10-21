/**
 * Email HTML helpers (pure): readable text for the parsers, link extraction,
 * and an allow-list sanitizer for storage. Nothing here fetches anything —
 * remote images, scripts and styles are dropped, never loaded.
 */
import { Parser } from "htmlparser2";

const SKIP_CONTENT = new Set([
  "script",
  "style",
  "head",
  "title",
  "noscript",
  "template",
  "iframe",
  "object",
  "embed",
  "svg",
  "math",
  "select",
  "textarea",
]);

const BLOCK = new Set([
  "p",
  "div",
  "section",
  "article",
  "header",
  "footer",
  "main",
  "aside",
  "nav",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "pre",
  "hr",
  "address",
  "center",
  "dl",
  "dt",
  "dd",
  "form",
  "fieldset",
]);

/** Readable text: one line per block, table cells joined with " | ". */
export function htmlToText(html: string): string {
  let out = "";
  let skip = 0;
  const parser = new Parser(
    {
      onopentag(name) {
        if (SKIP_CONTENT.has(name)) skip++;
        if (skip) return;
        if (name === "br") out += "\n";
        else if (name === "td" || name === "th") out += " | ";
        else if (name === "li") out += "\n- ";
        else if (BLOCK.has(name)) out += "\n";
      },
      ontext(text) {
        if (!skip) out += text;
      },
      onclosetag(name) {
        if (SKIP_CONTENT.has(name)) {
          skip = Math.max(0, skip - 1);
          return;
        }
        if (skip) return;
        if (BLOCK.has(name)) out += "\n";
      },
    },
    { decodeEntities: true, lowerCaseTags: true },
  );
  parser.write(html);
  parser.end();
  return tidyText(out);
}

/** Normalize whitespace: trimmed lines, no runs of blank lines, no leading cell separators. */
export function tidyText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[   ]/g, " ")
    .replace(/[​-‍﻿]/g, "")
    .split("\n")
    .map((line) =>
      line
        .replace(/[ \t]+/g, " ")
        .replace(/^\s*\|\s*/, "")
        .replace(/(\s*\|\s*)+$/, "")
        .replace(/(\s*\|\s*){2,}/g, " | ")
        .trim(),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type EmailLink = { href: string; text: string };

/** http(s) links with their visible text. Recorded only — never followed. */
export function extractLinks(html: string): EmailLink[] {
  const links: EmailLink[] = [];
  let current: EmailLink | null = null;
  const parser = new Parser(
    {
      onopentag(name, attribs) {
        if (name === "a") {
          const href = (attribs.href ?? "").trim();
          current = /^https?:\/\//i.test(href) ? { href, text: "" } : null;
        }
      },
      ontext(text) {
        if (current) current.text += text;
      },
      onclosetag(name) {
        if (name === "a" && current) {
          links.push({ href: current.href, text: current.text.replace(/\s+/g, " ").trim() });
          current = null;
        }
      },
    },
    { decodeEntities: true, lowerCaseTags: true },
  );
  parser.write(html);
  parser.end();
  return links;
}

/** URLs written out in plain text ("View listing: https://…", "<https://…>"). */
export function extractTextLinks(text: string): EmailLink[] {
  const out: EmailLink[] = [];
  for (const line of text.split("\n")) {
    for (const m of line.matchAll(/https?:\/\/[^\s<>"')\]]+/gi)) {
      const href = m[0].replace(/[.,;:]+$/, "");
      const label = line
        .slice(0, m.index)
        .replace(/[<:\s-]+$/, "")
        .trim();
      out.push({ href, text: label });
    }
  }
  return out;
}

const ALLOWED_TAGS = new Set([
  "a",
  "b",
  "strong",
  "i",
  "em",
  "u",
  "s",
  "small",
  "p",
  "br",
  "div",
  "span",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "td",
  "th",
  "caption",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "hr",
  "pre",
  "code",
  "dl",
  "dt",
  "dd",
  "address",
  "center",
]);
const VOID = new Set(["br", "hr"]);
const MAX_SANITIZED = 1_000_000;

function escapeText(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(s: string) {
  return escapeText(s).replace(/"/g, "&quot;");
}

/**
 * Allow-list sanitizer: keeps basic formatting and tables, drops every
 * attribute except safe link targets and table spans, drops images (often
 * tracking pixels), scripts, styles and embeds. Unknown tags are unwrapped.
 */
export function sanitizeEmailHtml(html: string): string {
  let out = "";
  let skip = 0;
  const open: string[] = [];
  const parser = new Parser(
    {
      onopentag(name, attribs) {
        if (SKIP_CONTENT.has(name)) {
          skip++;
          return;
        }
        if (skip) return;
        if (name === "img") {
          const alt = (attribs.alt ?? "").trim();
          if (alt) out += `[image: ${escapeText(alt.slice(0, 120))}]`;
          return;
        }
        if (!ALLOWED_TAGS.has(name)) return;
        let attrs = "";
        if (name === "a") {
          const href = (attribs.href ?? "").trim();
          if (/^(https?:|mailto:)/i.test(href)) {
            attrs = ` href="${escapeAttr(href)}" rel="noopener noreferrer nofollow" target="_blank"`;
          }
        } else if (name === "td" || name === "th") {
          for (const key of ["colspan", "rowspan"]) {
            const v = attribs[key];
            if (v && /^\d{1,2}$/.test(v)) attrs += ` ${key}="${v}"`;
          }
        }
        out += `<${name}${attrs}>`;
        if (!VOID.has(name)) open.push(name);
      },
      ontext(text) {
        if (!skip) out += escapeText(text);
      },
      onclosetag(name) {
        if (SKIP_CONTENT.has(name)) {
          skip = Math.max(0, skip - 1);
          return;
        }
        if (skip || VOID.has(name) || !ALLOWED_TAGS.has(name)) return;
        const idx = open.lastIndexOf(name);
        if (idx === -1) return;
        // Close anything left open inside this element, keeping the output well-formed.
        while (open.length > idx) out += `</${open.pop()}>`;
      },
    },
    { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true },
  );
  parser.write(html);
  parser.end();
  while (open.length) out += `</${open.pop()}>`;
  return out.length > MAX_SANITIZED ? out.slice(0, MAX_SANITIZED) : out;
}
