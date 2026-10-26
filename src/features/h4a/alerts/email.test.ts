import { describe, expect, it, vi } from "vitest";

import {
  NotConnectedCountyAdapter,
  compareWithListing,
  countyRecordsAdapter,
} from "../county/adapter";
import { alertEmailConfig, composeAlertEmail, sendAlertEmail } from "./email";

const ALERT = {
  alert_id: "a1",
  listing_id: "l1",
  score: 85,
  threshold: 70,
  address: "3100 Sample Ave",
  city: "San Diego",
  zip: "92104",
  price: "4950000.00",
  units: 24,
  source_label: "LoopNet alert",
  notify_email: "owner@example.com",
};

describe("owner alert email (behind a flag)", () => {
  it("is off unless the flag, API key and sender are all set", () => {
    expect(alertEmailConfig({})).toMatchObject({
      enabled: false,
      reason: expect.stringMatching(/switched off/),
    });
    expect(alertEmailConfig({ H4A_ALERT_EMAILS: "on" })).toMatchObject({
      enabled: false,
      reason: expect.stringMatching(/RESEND_API_KEY/),
    });
    expect(alertEmailConfig({ H4A_ALERT_EMAILS: "on", RESEND_API_KEY: "re_x" })).toMatchObject({
      enabled: false,
      reason: expect.stringMatching(/ALERT_EMAIL_FROM/),
    });
    expect(
      alertEmailConfig({
        H4A_ALERT_EMAILS: "on",
        RESEND_API_KEY: "re_x",
        ALERT_EMAIL_FROM: "Alerts <a@example.com>",
      }),
    ).toEqual({ enabled: true, apiKey: "re_x", from: "Alerts <a@example.com>", reason: null });
  });

  it("composes a short message with the score and a link", () => {
    const m = composeAlertEmail(ALERT, "https://app.example.com/w/housing4all/");
    expect(m.subject).toBe("New match: 3100 Sample Ave — score 85");
    expect(m.text).toContain("3100 Sample Ave, San Diego, 92104");
    expect(m.text).toContain("$4,950,000 · 24 units · score 85");
    expect(m.text).toContain("https://app.example.com/w/housing4all/deal-finder/l1");
    expect(m.html).not.toContain("<script");
  });

  it("refuses to send while off", async () => {
    const fetchMock = vi.fn();
    await expect(
      sendAlertEmail(
        alertEmailConfig({}),
        "owner@example.com",
        composeAlertEmail(ALERT, null),
        fetchMock,
      ),
    ).rejects.toThrow(/switched off/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends through Resend when on", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    const cfg = alertEmailConfig({
      H4A_ALERT_EMAILS: "on",
      RESEND_API_KEY: "re_x",
      ALERT_EMAIL_FROM: "a@example.com",
    });
    await sendAlertEmail(
      cfg,
      "owner@example.com",
      composeAlertEmail(ALERT, null),
      fetchMock as unknown as typeof fetch,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer re_x" }),
      }),
    );
  });
});

describe("county records adapter", () => {
  it("is Not connected in Phase 2A", async () => {
    const adapter = countyRecordsAdapter();
    expect(adapter).toBeInstanceOf(NotConnectedCountyAdapter);
    expect(adapter.connected).toBe(false);
    expect(await adapter.lookup({ apn: "1234567890" })).toMatchObject({ status: "not_connected" });
  });
  it("compares a county record with a listing", () => {
    const record = {
      apn: "123-456-78-90",
      situsAddress: null,
      ownerName: null,
      units: 24,
      yearBuilt: 1964,
      lastSaleDate: null,
      lastSalePrice: null,
      sourceLabel: "test",
      sourceUrl: null,
      fetchedAt: "2026-10-20T00:00:00Z",
    };
    expect(compareWithListing(record, { apn: "1234567890", units: 24, year_built: 1964 })).toEqual(
      [],
    );
    expect(compareWithListing(record, { apn: "1234567891", units: 23, year_built: null })).toEqual([
      { field: "apn", listing: "1234567891", county: "123-456-78-90" },
      { field: "units", listing: "23", county: "24" },
    ]);
  });
});
