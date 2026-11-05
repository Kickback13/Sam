import { describe, expect, it } from "vitest";

import {
  blockSchema,
  buildIcs,
  groupSlotsByDay,
  icsEscape,
  icsFold,
  localDayKey,
  publicBookingSchema,
  zonedToIso,
} from "./booking";

const TZ = "America/Los_Angeles";

describe("booking helpers", () => {
  it("groups open slots by the workspace's local day", () => {
    const days = groupSlotsByDay(
      [
        { startsAt: "2026-11-06T17:30:00.000Z", endsAt: "2026-11-06T18:00:00.000Z" },
        { startsAt: "2026-11-06T17:00:00.000Z", endsAt: "2026-11-06T17:30:00.000Z" },
        // 4:30 PM local on Nov 6 is 00:30 UTC on Nov 7: still Nov 6 locally.
        { startsAt: "2026-11-07T00:30:00.000Z", endsAt: "2026-11-07T01:00:00.000Z" },
        { startsAt: "2026-11-09T17:00:00.000Z", endsAt: "2026-11-09T17:30:00.000Z" },
      ],
      TZ,
    );
    expect(days.map((d) => d.key)).toEqual(["2026-11-06", "2026-11-09"]);
    expect(days[0].label).toBe("Fri, Nov 6");
    expect(days[0].slots.map((s) => s.label)).toEqual(["9:00 AM", "9:30 AM", "4:30 PM"]);
    expect(localDayKey("2026-11-07T00:30:00.000Z", TZ)).toBe("2026-11-06");
  });

  it("converts a local date and time to an instant across DST", () => {
    expect(zonedToIso("2026-11-02", "09:00", TZ)).toBe("2026-11-02T17:00:00.000Z"); // PST
    expect(zonedToIso("2026-10-30", "09:00", TZ)).toBe("2026-10-30T16:00:00.000Z"); // PDT
  });

  it("builds a valid iCalendar file with escaping and folding", () => {
    const ics = buildIcs(
      [
        {
          uid: "b1@housing4all",
          start: "2026-11-06T17:00:00.000Z",
          end: "2026-11-06T17:30:00.000Z",
          summary: "Call with Sam, Housing4All",
          description: "Line one\nLine two; done",
          location: "Phone call",
        },
      ],
      { name: "Housing4All bookings", now: new Date("2026-11-05T00:00:00.000Z") },
    );
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20261106T170000Z\r\n");
    expect(ics).toContain("DTSTAMP:20261105T000000Z\r\n");
    expect(ics).toContain("SUMMARY:Call with Sam\\, Housing4All\r\n");
    expect(ics).toContain("DESCRIPTION:Line one\\nLine two\; done\r\n");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(icsEscape("a\\b")).toBe("a\\\\b");
    const folded = icsFold(`DESCRIPTION:${"x".repeat(200)}`);
    expect(folded.split("\r\n ").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    expect(folded.replace(/\r\n /g, "")).toBe(`DESCRIPTION:${"x".repeat(200)}`);
  });

  it("validates the public form: a way to reach the lead is required", () => {
    const base = {
      slug: "housing4all",
      startsAt: "2026-11-06T17:00:00.000Z",
      name: "Pat Lead",
      email: "",
      phone: "",
      note: "",
    };
    expect(publicBookingSchema.safeParse(base).success).toBe(false);
    expect(publicBookingSchema.safeParse({ ...base, phone: "(619) 555-0100" }).success).toBe(true);
    expect(publicBookingSchema.safeParse({ ...base, email: "pat@example.test" }).success).toBe(
      true,
    );
    expect(publicBookingSchema.safeParse({ ...base, email: "nope" }).success).toBe(false);
    expect(
      publicBookingSchema.safeParse({ ...base, phone: "6195550100", website: "spam" }).success,
    ).toBe(false);
  });

  it("validates blocked time", () => {
    const ws = "00000000-0000-4000-8000-000000000000";
    expect(
      blockSchema.safeParse({
        workspaceId: ws,
        startsAt: "2026-11-06T17:00:00.000Z",
        endsAt: "2026-11-06T16:00:00.000Z",
        title: "",
      }).success,
    ).toBe(false);
    expect(
      blockSchema.safeParse({
        workspaceId: ws,
        startsAt: "2026-11-06T17:00:00.000Z",
        endsAt: "2026-11-06T19:00:00.000Z",
        title: "Escrow signing",
      }).success,
    ).toBe(true);
  });
});
