import { describe, expect, it } from "vitest";

import {
  defaultReason,
  hasSpanishVersion,
  newsletterVersion,
  parseBody,
  renderNewsletter,
  UNSUBSCRIBE_PLACEHOLDER,
} from "./render";

const footer = {
  senderName: "Example Realty",
  mailingAddress: "100 Example St\nSan Diego, CA 92104",
  reason: "You're receiving this because you're a contact of Example Realty.",
  unsubscribeUrl: "https://app.example.com/unsubscribe/abc",
};

describe("parseBody", () => {
  it("splits headings, paragraphs and lists", () => {
    expect(parseBody("# Title\n\nFirst line\nsecond line\n\n- one\n- two\n## Sub\nText")).toEqual([
      { kind: "h1", text: "Title" },
      { kind: "p", text: "First line\nsecond line" },
      { kind: "ul", items: ["one", "two"] },
      { kind: "h2", text: "Sub" },
      { kind: "p", text: "Text" },
    ]);
  });
});

describe("renderNewsletter", () => {
  const out = renderNewsletter(
    {
      subject: " October market update ",
      preheader: "Rates, rents and two new listings",
      body: "# Market update\n\nRents are **up 3%**. See [the report](https://example.com/r?a=1&b=2).\n\n- Item <one>\n- Item two",
    },
    footer,
  );

  it("renders headings, bold, safe links and lists", () => {
    expect(out.subject).toBe("October market update");
    expect(out.html).toContain(">Market update</h1>");
    expect(out.html).toContain("<strong>up 3%</strong>");
    expect(out.html).toContain('<a href="https://example.com/r?a=1&amp;b=2"');
    expect(out.html).toContain("Item &lt;one&gt;</li>");
    expect(out.html).toContain("Rates, rents and two new listings");
  });

  it("always includes the CAN-SPAM footer: sender, address, reason, unsubscribe", () => {
    expect(out.html).toContain("Example Realty");
    expect(out.html).toContain("100 Example St<br>San Diego, CA 92104");
    expect(out.html).toContain("contact of Example Realty");
    expect(out.html).toContain('href="https://app.example.com/unsubscribe/abc"');
    expect(out.text).toContain("100 Example St\nSan Diego, CA 92104");
    expect(out.text).toContain("Unsubscribe: https://app.example.com/unsubscribe/abc");
  });

  it("writes a readable plain-text version", () => {
    expect(out.text).toContain("MARKET UPDATE");
    expect(out.text).toContain("Rents are up 3%. See the report (https://example.com/r?a=1&b=2).");
    expect(out.text).toContain("- Item <one>");
  });

  it("escapes HTML and refuses unsafe link schemes", () => {
    const evil = renderNewsletter(
      {
        subject: "x",
        body: '<script>alert(1)</script>\n\n[click](javascript:alert(1))\n\n[x](https://e.com/"onmouseover=1)',
      },
      footer,
    );
    expect(evil.html).not.toContain("<script>");
    expect(evil.html).toContain("&lt;script&gt;");
    expect(evil.html).not.toContain('href="javascript');
    expect(evil.html).not.toMatch(/href="[^"]*"onmouseover/);
  });

  it("uses a placeholder unsubscribe link in previews", () => {
    const preview = renderNewsletter(
      { subject: "x", body: "hi" },
      { ...footer, unsubscribeUrl: null },
    );
    expect(preview.html).toContain(UNSUBSCRIBE_PLACEHOLDER);
  });
});

describe("Spanish newsletters", () => {
  const footer = {
    senderName: "Housing4All",
    mailingAddress: "3683 University Ave\nSan Diego, CA 92104",
    reason: defaultReason("Housing4All", "es"),
    unsubscribeUrl: "https://app.example/unsubscribe/abc?lang=es",
  };
  const n = {
    subject: "This week's deals",
    preheader: "Three new buildings",
    body: "# Hello\nNew listings.",
    subjectEs: "Ofertas de la semana",
    preheaderEs: "Tres edificios nuevos",
    bodyEs: "# Hola\nNuevas propiedades.",
  };

  it("sends Spanish contacts the Spanish version, everyone else English", () => {
    expect(newsletterVersion(n, "es")).toEqual({
      language: "es",
      content: {
        subject: "Ofertas de la semana",
        preheader: "Tres edificios nuevos",
        body: "# Hola\nNuevas propiedades.",
      },
    });
    expect(newsletterVersion(n, "en").language).toBe("en");
    expect(newsletterVersion(n, null).content.subject).toBe("This week's deals");
  });

  it("falls back to English when there is no Spanish version", () => {
    expect(hasSpanishVersion({ ...n, bodyEs: "  " })).toBe(false);
    expect(newsletterVersion({ ...n, subjectEs: null, bodyEs: null }, "es").language).toBe("en");
  });

  it("keeps the CAN-SPAM footer, in Spanish", () => {
    const v = newsletterVersion(n, "es");
    const msg = renderNewsletter(v.content, footer, v.language);
    expect(msg.subject).toBe("Ofertas de la semana");
    expect(msg.html).toContain('<html lang="es">');
    expect(msg.html).toContain("Cancelar suscripción</a> — un clic, sin iniciar sesión.");
    expect(msg.html).toContain("3683 University Ave<br>San Diego, CA 92104");
    expect(msg.html).toContain("Recibe este mensaje porque es un contacto de Housing4All.");
    expect(msg.html).toContain('href="https://app.example/unsubscribe/abc?lang=es"');
    expect(msg.text).toContain("Cancelar suscripción: https://app.example/unsubscribe/abc?lang=es");
  });

  it("is still English by default", () => {
    const msg = renderNewsletter(n, { ...footer, reason: defaultReason("Housing4All") });
    expect(msg.html).toContain('<html lang="en">');
    expect(msg.html).toContain("Unsubscribe</a> — one click, no login.");
  });
});
