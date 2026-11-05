import { describe, expect, it } from "vitest";

import {
  advance,
  firstDue,
  mailtoLink,
  missingFields,
  normalizeSteps,
  renderTemplate,
  type SequenceStep,
} from "./sequences";

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
      { position: 1, channel: "sms", waitDays: 90, subject: null, body: "hi" },
      { position: 2, channel: "email", waitDays: 2, subject: null, body: "x" },
    ]);
  });

  it("builds a mail link", () => {
    expect(mailtoLink("ana@example.test", "Hi there", "Line 1\nLine 2")).toBe(
      "mailto:ana%40example.test?subject=Hi%20there&body=Line%201%0ALine%202",
    );
  });
});
