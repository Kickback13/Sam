import { describe, expect, it } from "vitest";

import { formatSlotLong, groupSlotsByDay } from "./booking";
import { BOOKING_LOCALE, BOOKING_TEXT, bookingError, isSlotTaken, pickBookingLang } from "./i18n";

describe("pickBookingLang", () => {
  it("uses ?lang= first", () => {
    expect(pickBookingLang("es", "en-US,en;q=0.9")).toBe("es");
    expect(pickBookingLang("en", "es-MX,es;q=0.9")).toBe("en");
    expect(pickBookingLang(["es", "en"], null)).toBe("es");
  });
  it("falls back to the browser's languages, by preference", () => {
    expect(pickBookingLang(undefined, "es-MX,es;q=0.9,en;q=0.8")).toBe("es");
    expect(pickBookingLang(undefined, "en-US,es;q=0.5")).toBe("en");
    expect(pickBookingLang(undefined, "fr-FR,es;q=0.7,en;q=0.6")).toBe("es");
    expect(pickBookingLang(undefined, "en;q=0.4,es;q=0.8")).toBe("es");
    expect(pickBookingLang(undefined, "es;q=0")).toBe("en");
  });
  it("defaults to English", () => {
    expect(pickBookingLang("fr", null)).toBe("en");
    expect(pickBookingLang(undefined, "")).toBe("en");
    expect(pickBookingLang(undefined, "de-DE")).toBe("en");
  });
});

describe("Spanish text", () => {
  it("translates the booking checks' messages, and leaves others alone", () => {
    expect(bookingError("That time was just taken. Please pick another.", "es")).toBe(
      "Esa hora se acaba de ocupar. Por favor elija otra.",
    );
    expect(bookingError("Enter your name", "es")).toBe("Escriba su nombre");
    expect(bookingError("Enter your name", "en")).toBe("Enter your name");
    expect(bookingError("Something new", "es")).toBe("Something new");
  });
  it("recognizes a taken slot in either language", () => {
    expect(isSlotTaken("That time was just taken. Please pick another.")).toBe(true);
    expect(isSlotTaken(bookingError("That time was just taken. Please pick another.", "es"))).toBe(
      true,
    );
    expect(isSlotTaken("Enter your name")).toBe(false);
  });
  it("has the same keys in both languages", () => {
    expect(Object.keys(BOOKING_TEXT.es).sort()).toEqual(Object.keys(BOOKING_TEXT.en).sort());
  });
  it("formats days and times in Spanish", () => {
    const iso = "2026-11-10T18:00:00Z"; // Tue Nov 10, 10:00 AM Pacific
    expect(formatSlotLong(iso, "America/Los_Angeles", BOOKING_LOCALE.es)).toMatch(
      /martes.*10 de noviembre/i,
    );
    const [day] = groupSlotsByDay(
      [{ startsAt: iso, endsAt: "2026-11-10T18:30:00Z" }],
      "America/Los_Angeles",
      BOOKING_LOCALE.es,
    );
    expect(day.label.toLowerCase()).toContain("nov");
    expect(day.slots[0].label).toMatch(/10:00/);
  });
});
