import { describe, expect, it } from "vitest";

import {
  advance,
  firstDue,
  mailtoLink,
  missingFields,
  normalizeSteps,
  renderTemplate,
  stepForLanguage,
  type SequenceStep,
} from "./sequences";

describe("stepForLanguage", () => {
  const step: SequenceStep = {
    position: 1,
    channel: "email",
    waitDays: 0,
    subject: "Quick question",
    body: "Hi {first_name}",
    subjectEs: "Una pregunta",
    bodyEs: "Hola {first_name}",
  };
  it("gives Spanish contacts the Spanish version", () => {
    expect(stepForLanguage(step, "es")).toMatchObject({
      language: "es",
      subject: "Una pregunta",
      body: "Hola {first_name}",
      missingSpanish: false,
    });
  });
  it("gives everyone else English", () => {
    expect(stepForLanguage(step, "en")).toMatchObject({ language: "en", body: "Hi {first_name}" });
    expect(stepForLanguage(step, null).language).toBe("en");
  });
  it("falls back to English, flagged, when a step has no Spanish version", () => {
    const r = stepForLanguage({ ...step, subjectEs: null, bodyEs: null }, "es");
    expect(r).toMatchObject({
      language: "en",
      body: "Hi {first_name}",
      missingSpanish: true,
      hasSpanish: false,
    });
  });
  it("uses the English subject when only the Spanish body exists", () => {
    expect(stepForLanguage({ ...step, subjectEs: null }, "es").subject).toBe("Quick question");
  });
  it("lets the person switch language", () => {
    expect(stepForLanguage(step, "es", "en").body).toBe("Hi {first_name}");
    expect(stepForLanguage(step, "en", "es").body).toBe("Hola {first_name}");
    expect(stepForLanguage({ ...step, bodyEs: null }, "en", "es").language).toBe("en");
  });
});

const steps: SequenceStep[] = [
  { position: 2, channel: "email", waitDays: 3, subject: "Following up", body: "Hi {first_name}" },
  { position: 1, channel: "sms", waitDays: 0, subject: null, body: "Hi" },
  { position: 3, channel: "sms", waitDays: 7, subject: null, body: "Last one" },
];
const now = new Date("2026-11-05T17:00:00Z");

describe("sequences", () => {
  it("fills merge fields and tidies gaps left by missing values", () => {
    expect(
      renderTemplate("Hi {first_name}, it's {my_name} at Housing4All.", {
        first_name: "Ana",
        my_name: "Sam",
      }),
    ).toBe("Hi Ana, it's Sam at Housing4All.");
    expect(renderTemplate("Hi {first_name}, about {company} .", {})).toBe("Hi, about.");
    expect(renderTemplate("Keep {unknown}", {})).toBe("Keep {unknown}");
    expect(
      missingFields("Hi {first_name} at {company} {first_name}", { first_name: "Ana" }),
    ).toEqual(["company"]);
  });

  it("schedules the first step and each next one by its wait", () => {
    expect(firstDue(steps, now)).toEqual({ position: 1, dueAt: now });
    expect(advance(steps, 1, now)).toEqual({
      finished: false,
      position: 2,
      dueAt: new Date("2026-11-08T17:00:00Z"),
    });
    expect(advance(steps, 3, now)).toEqual({ finished: true });
    expect(firstDue([], now)).toBeNull();
  });

  it("normalizes steps for saving", () => {
    expect(
      normalizeSteps([
        { position: 9, channel: "sms", waitDays: 120, subject: "dropped", body: "  hi  " },
        { position: 4, channel: "email", waitDays: 2.4, subject: "  ", body: "x" },
      ]),
    ).toEqual([
      {
        position: 1,
        channel: "sms",
        waitDays: 90,
        subject: null,
        body: "hi",
        subjectEs: null,
        bodyEs: null,
      },
      {
        position: 2,
        channel: "email",
        waitDays: 2,
        subject: null,
        body: "x",
        subjectEs: null,
        bodyEs: null,
      },
    ]);
  });

  it("keeps a Spanish version only when it has a message", () => {
    expect(
      normalizeSteps([
        {
          position: 1,
          channel: "email",
          waitDays: 0,
          subject: "Hi",
          body: "Hello",
          subjectEs: " Hola ",
          bodyEs: " Hola {first_name} ",
        },
        {
          position: 2,
          channel: "email",
          waitDays: 0,
          subject: "Hi",
          body: "Hello",
          subjectEs: "Hola",
          bodyEs: "  ",
        },
        {
          position: 3,
          channel: "sms",
          waitDays: 0,
          subject: null,
          body: "Hi",
          subjectEs: "dropped",
          bodyEs: "Hola",
        },
      ]).map((s) => [s.subjectEs, s.bodyEs]),
    ).toEqual([
      ["Hola", "Hola {first_name}"],
      [null, null],
      [null, "Hola"],
    ]);
  });

  it("builds a mail link", () => {
    expect(mailtoLink("ana@example.test", "Hi there", "Line 1\nLine 2")).toBe(
      "mailto:ana%40example.test?subject=Hi%20there&body=Line%201%0ALine%202",
    );
  });
});
