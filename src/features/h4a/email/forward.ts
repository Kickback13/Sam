/**
 * Forwarded emails (pure). When Sam forwards an alert by hand, the marketplace
 * email sits under a "Forwarded message" header. Parsers need the ORIGINAL
 * sender and subject to pick the right format, so we unwrap it.
 */

const MARKERS = [
  /^-{2,}\s*Forwarded message\s*-{2,}\s*$/im, // Gmail
  /^Begin forwarded message:\s*$/im, // Apple Mail
  /^-{2,}\s*Original Message\s*-{2,}\s*$/im, // Outlook (older)
  /^_{10,}\s*$/m, // Outlook ("____" rule before From:/Sent:)
];

export type Unwrapped = {
  forwarded: boolean;
  from: string | null;
  subject: string | null;
  date: string | null;
  body: string;
};

const HEADER_RE = /^\s*\*?(From|Subject|Date|Sent|To|Cc)\*?\s*:\*?\s*(.*)$/i;

export function unwrapForward(text: string): Unwrapped {
  for (const marker of MARKERS) {
    const m = marker.exec(text);
    if (!m) continue;
    const after = text.slice(m.index + m[0].length).replace(/^\s*\n/, "");
    const lines = after.split("\n");
    const headers: Record<string, string> = {};
    let i = 0;
    // Skip blank lines before the header block (Apple Mail leaves one).
    while (i < lines.length && lines[i].trim() === "") i++;
    for (; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === "") {
        if (headers.from) break;
        continue;
      }
      const h = line.match(HEADER_RE);
      if (!h) {
        if (headers.from) break;
        continue;
      }
      headers[h[1].toLowerCase()] = h[2].trim();
    }
    if (!headers.from) continue;
    return {
      forwarded: true,
      from: headers.from,
      subject: headers.subject ?? null,
      date: headers.date ?? headers.sent ?? null,
      body: lines.slice(i).join("\n").trim(),
    };
  }
  return { forwarded: false, from: null, subject: null, date: null, body: text };
}

/** "Fwd: FW: Re: New listing" → "New listing" */
export function stripSubjectPrefixes(subject: string | null | undefined): string {
  return (subject ?? "").replace(/^\s*((fwd?|fw|re|aw|wg)\s*:\s*)+/i, "").trim();
}

/** "Pat Sample <pat@example.com>" → { name: "Pat Sample", address: "pat@example.com" } */
export function parseMailbox(raw: string | null | undefined): {
  name: string | null;
  address: string | null;
} {
  if (!raw) return { name: null, address: null };
  const s = raw.replace(/\[mailto:[^\]]*\]/gi, "").trim();
  const angle = s.match(/^(.*?)<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/);
  if (angle) {
    const name = angle[1].replace(/^["'\s]+|["'\s]+$/g, "").trim();
    return { name: name || null, address: angle[2].toLowerCase() };
  }
  const bare = s.match(/([^\s<>"]+@[^\s<>"]+\.[a-z]{2,})/i);
  if (bare) {
    const name = s
      .replace(bare[1], "")
      .replace(/[<>"()]/g, "")
      .trim();
    return { name: name || null, address: bare[1].toLowerCase() };
  }
  return { name: s || null, address: null };
}

export function domainOf(address: string | null | undefined): string | null {
  const m = address?.match(/@([a-z0-9.-]+)$/i);
  return m ? m[1].toLowerCase() : null;
}
