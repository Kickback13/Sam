import { describe, expect, it } from "vitest";

import { sign, signatureHeaders, verifySignature } from "./signature";

// A made-up test secret (base64 of "test-secret-for-unit-tests-only!").
const SECRET = `whsec_${Buffer.from("test-secret-for-unit-tests-only!").toString("base64")}`;
const BODY = JSON.stringify({ type: "email.received", data: { email_id: "e1" } });
const NOW = new Date("2026-10-20T12:00:00Z");
const TS = String(Math.floor(NOW.getTime() / 1000));

function headers(signature: string, ts = TS, id = "msg_1") {
  return { id, timestamp: ts, signature };
}

describe("verifySignature (Svix / Standard Webhooks)", () => {
  const good = `v1,${sign(SECRET, "msg_1", TS, BODY)}`;

  it("accepts a valid signature", () => {
    expect(verifySignature(SECRET, headers(good), BODY, NOW)).toEqual({ ok: true });
  });
  it("accepts when any of several signatures matches (secret rotation)", () => {
    expect(verifySignature(SECRET, headers(`v1,AAAA ${good}`), BODY, NOW)).toEqual({ ok: true });
  });
  it("works with or without the whsec_ prefix", () => {
    const raw = SECRET.slice("whsec_".length);
    expect(verifySignature(raw, headers(good), BODY, NOW)).toEqual({ ok: true });
  });
  it("rejects a tampered body", () => {
    expect(verifySignature(SECRET, headers(good), BODY.replace("e1", "e2"), NOW)).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });
  it("rejects a signature made with another secret", () => {
    const other = `v1,${sign(`whsec_${Buffer.from("another-secret").toString("base64")}`, "msg_1", TS, BODY)}`;
    expect(verifySignature(SECRET, headers(other), BODY, NOW).ok).toBe(false);
  });
  it("rejects a different message id (replay with new id)", () => {
    expect(verifySignature(SECRET, headers(good, TS, "msg_2"), BODY, NOW).ok).toBe(false);
  });
  it("rejects old or future timestamps (> 5 minutes)", () => {
    const old = String(Number(TS) - 301);
    const sig = `v1,${sign(SECRET, "msg_1", old, BODY)}`;
    expect(verifySignature(SECRET, headers(sig, old), BODY, NOW)).toEqual({
      ok: false,
      reason: "stale",
    });
    const future = String(Number(TS) + 301);
    expect(
      verifySignature(
        SECRET,
        headers(`v1,${sign(SECRET, "msg_1", future, BODY)}`, future),
        BODY,
        NOW,
      ).ok,
    ).toBe(false);
    // Within tolerance is fine.
    const recent = String(Number(TS) - 299);
    expect(
      verifySignature(
        SECRET,
        headers(`v1,${sign(SECRET, "msg_1", recent, BODY)}`, recent),
        BODY,
        NOW,
      ).ok,
    ).toBe(true);
  });
  it("rejects missing headers, bad timestamps and unknown versions", () => {
    expect(
      verifySignature(SECRET, { id: null, timestamp: TS, signature: good }, BODY, NOW),
    ).toEqual({
      ok: false,
      reason: "missing_headers",
    });
    expect(verifySignature(SECRET, headers(good, "yesterday"), BODY, NOW)).toEqual({
      ok: false,
      reason: "bad_timestamp",
    });
    expect(verifySignature(SECRET, headers(good.replace("v1,", "v2,")), BODY, NOW).ok).toBe(false);
  });
  it("reads svix-* or webhook-* headers", () => {
    const h = new Headers({ "svix-id": "a", "svix-timestamp": "1", "svix-signature": "v1,x" });
    expect(signatureHeaders((n) => h.get(n))).toEqual({
      id: "a",
      timestamp: "1",
      signature: "v1,x",
    });
    const w = new Headers({
      "webhook-id": "b",
      "webhook-timestamp": "2",
      "webhook-signature": "v1,y",
    });
    expect(signatureHeaders((n) => w.get(n))).toEqual({
      id: "b",
      timestamp: "2",
      signature: "v1,y",
    });
  });
});
