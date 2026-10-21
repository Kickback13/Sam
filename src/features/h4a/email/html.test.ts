import { describe, expect, it } from "vitest";

import { extractLinks, extractTextLinks, htmlToText, sanitizeEmailHtml } from "./html";

describe("htmlToText", () => {
  it("keeps one line per block and joins table cells", () => {
    const text = htmlToText(
      "<div>Hello&nbsp;there</div><table><tr><td>Price</td><td>$1,000,000</td></tr><tr><th>Units</th><td>4</td></tr></table><p>Bye<br>now</p>",
    );
    expect(text).toBe("Hello there\n\nPrice | $1,000,000\n\nUnits | 4\n\nBye\nnow");
  });
  it("drops scripts, styles, head and comments", () => {
    const text = htmlToText(
      "<html><head><title>T</title><style>a{}</style></head><body><!-- x --><script>evil()</script><p>Kept &amp; decoded</p></body></html>",
    );
    expect(text).toBe("Kept & decoded");
  });
});

describe("links", () => {
  it("collects http(s) anchors with their text, ignoring others", () => {
    expect(
      extractLinks(
        '<a href="https://example.com/listing/1">View <b>listing</b></a><a href="javascript:alert(1)">x</a><a href="mailto:a@b.c">mail</a>',
      ),
    ).toEqual([{ href: "https://example.com/listing/1", text: "View listing" }]);
  });
  it("finds URLs written in plain text", () => {
    expect(
      extractTextLinks("View Listing: https://example.com/l/1.\nOther <https://example.com/x>"),
    ).toEqual([
      { href: "https://example.com/l/1", text: "View Listing" },
      { href: "https://example.com/x", text: "Other" },
    ]);
  });
});

describe("sanitizeEmailHtml", () => {
  it("keeps basic formatting and tables", () => {
    expect(
      sanitizeEmailHtml(
        '<p class="x" style="color:red">A <b>bold</b> <i>word</i></p><table><tr><td colspan="2">c</td></tr></table>',
      ),
    ).toBe('<p>A <b>bold</b> <i>word</i></p><table><tr><td colspan="2">c</td></tr></table>');
  });
  it("removes scripts, styles, iframes, event handlers and javascript: links", () => {
    const out = sanitizeEmailHtml(
      '<script>alert(1)</script><style>p{}</style><iframe src="https://x"></iframe><a href="javascript:alert(1)" onclick="x()">click</a><div onmouseover="y()">hi</div>',
    );
    expect(out).toBe("<a>click</a><div>hi</div>");
    expect(out).not.toMatch(/script|style|iframe|onclick|onmouseover|javascript/i);
  });
  it("drops images (tracking pixels) and keeps their alt text", () => {
    expect(
      sanitizeEmailHtml('<img src="https://t.example/p.gif"><img src="x" alt="Front of building">'),
    ).toBe("[image: Front of building]");
  });
  it("marks safe links as external and escapes text", () => {
    expect(sanitizeEmailHtml('<a href="https://example.com/?a=1&b=2">x &lt;y&gt;</a>')).toBe(
      '<a href="https://example.com/?a=1&amp;b=2" rel="noopener noreferrer nofollow" target="_blank">x &lt;y&gt;</a>',
    );
  });
  it("unwraps unknown tags and closes unclosed ones", () => {
    expect(sanitizeEmailHtml("<font color=red>a</font><div><p>b")).toBe("a<div><p>b</p></div>");
  });
});
