import { describe, expect, it } from "vitest";

import { domainOf, parseMailbox, stripSubjectPrefixes, unwrapForward } from "./forward";

describe("unwrapForward", () => {
  it("unwraps a Gmail forward", () => {
    const u = unwrapForward(
      "FYI\n\n---------- Forwarded message ---------\nFrom: LoopNet <alerts@loopnet.example>\nDate: Mon, Oct 19, 2026\nSubject: New listings\nTo: Sam <s@example.com>\n\nBody line 1\nBody line 2",
    );
    expect(u).toEqual({
      forwarded: true,
      from: "LoopNet <alerts@loopnet.example>",
      subject: "New listings",
      date: "Mon, Oct 19, 2026",
      body: "Body line 1\nBody line 2",
    });
  });
  it("unwraps Apple Mail and Outlook forwards", () => {
    expect(
      unwrapForward(
        "Begin forwarded message:\n\nFrom: A <a@example.com>\nSubject: S\nDate: D\nTo: B\n\nHello",
      ).from,
    ).toBe("A <a@example.com>");
    const outlook = unwrapForward(
      "See below\n________________________________\nFrom: Broker <b@example.com>\nSent: Monday\nTo: Sam\nSubject: Duplex\n\nText",
    );
    expect(outlook).toMatchObject({
      forwarded: true,
      subject: "Duplex",
      date: "Monday",
      body: "Text",
    });
  });
  it("handles bolded Gmail headers (*From:*)", () => {
    expect(
      unwrapForward("---------- Forwarded message ---------\n*From:* X <x@example.com>\n\nHi").from,
    ).toBe("X <x@example.com>");
  });
  it("leaves a normal email alone", () => {
    expect(unwrapForward("Just text")).toEqual({
      forwarded: false,
      from: null,
      subject: null,
      date: null,
      body: "Just text",
    });
  });
});

describe("mailbox helpers", () => {
  it("parses display names and bare addresses", () => {
    expect(parseMailbox('"Pat Sample" <Pat@Example.com>')).toEqual({
      name: "Pat Sample",
      address: "pat@example.com",
    });
    expect(parseMailbox("pat@example.com")).toEqual({ name: null, address: "pat@example.com" });
    expect(parseMailbox("Pat Sample")).toEqual({ name: "Pat Sample", address: null });
    expect(parseMailbox(null)).toEqual({ name: null, address: null });
  });
  it("gets the domain and strips Fwd/Re prefixes", () => {
    expect(domainOf("a@Mail.Example.com")).toBe("mail.example.com");
    expect(stripSubjectPrefixes("Fwd: FW: Re: New listing")).toBe("New listing");
  });
});
