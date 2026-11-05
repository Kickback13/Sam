import { describe, expect, it } from "vitest";

import { parseSubscription, pushConfig, pushPayload } from "./push";

const PUB = "B" + "A".repeat(86);
const PRIV = "p".repeat(43);

describe("network push", () => {
  it("is connected only with a well-formed key pair and a contact", () => {
    expect(pushConfig({}).connected).toBe(false);
    expect(
      pushConfig({ NETWORK_PUSH_PUBLIC_KEY: PUB, NETWORK_PUSH_PRIVATE_KEY: PRIV }).connected,
    ).toBe(false);
    expect(
      pushConfig({
        NETWORK_PUSH_PUBLIC_KEY: PUB,
        NETWORK_PUSH_PRIVATE_KEY: "short",
        NETWORK_PUSH_SUBJECT: "mailto:sam@example.test",
      }).connected,
    ).toBe(false);
    const ok = pushConfig({
      NETWORK_PUSH_PUBLIC_KEY: PUB,
      NETWORK_PUSH_PRIVATE_KEY: PRIV,
      NETWORK_PUSH_SUBJECT: "mailto:sam@example.test",
    });
    expect(ok).toMatchObject({ connected: true, publicKey: PUB });
  });

  it("builds short notifications with no private data", () => {
    expect(pushPayload("event", "Housing4All Network", "Investor mixer", "/n/h4a/events")).toEqual({
      title: "Housing4All Network",
      body: "New event: Investor mixer",
      url: "/n/h4a/events",
      tag: "event:/n/h4a/events",
    });
    expect(pushPayload("post", "X", "a".repeat(200), "/u").body).toHaveLength(140);
  });

  it("accepts only a real browser subscription", () => {
    const sub = {
      endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
      keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) },
    };
    expect(parseSubscription(sub)).toEqual({
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
    });
    expect(parseSubscription({ ...sub, endpoint: "http://insecure" })).toBeNull();
    expect(parseSubscription({ endpoint: sub.endpoint })).toBeNull();
    expect(parseSubscription("nope")).toBeNull();
  });
});
