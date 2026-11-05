import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { ServerSupabase } from "@/lib/supabase/server";

import { notifyCommunity } from "./push";

const PAYLOAD = { title: "H4A", body: "New event: Mixer", url: "/n/h4a/events", tag: "event:x" };

function fakeDb(targets: { endpoint: string; p256dh: string; auth: string }[], err?: string) {
  const calls: { fn: string; args: unknown }[] = [];
  const db = {
    rpc: vi.fn(async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      if (fn === "network_push_targets")
        return err ? { data: null, error: { code: err } } : { data: targets, error: null };
      return { data: 1, error: null };
    }),
  } as unknown as ServerSupabase;
  return { db, calls };
}

const t = (n: number) => ({
  endpoint: `https://push.example/${n}`,
  p256dh: "k".repeat(30),
  auth: "a".repeat(10),
});

describe("notifyCommunity", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("does nothing while push isn't connected", async () => {
    const { db } = fakeDb([t(1)]);
    const send = vi.fn();
    expect(await notifyCommunity(db, "ws", PAYLOAD, send)).toMatchObject({
      sent: 0,
      skipped: "not connected",
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("sends to every device and drops the ones the push service says are gone", async () => {
    vi.stubEnv("NETWORK_PUSH_PUBLIC_KEY", "B" + "A".repeat(86));
    vi.stubEnv("NETWORK_PUSH_PRIVATE_KEY", "p".repeat(43));
    vi.stubEnv("NETWORK_PUSH_SUBJECT", "mailto:sam@example.test");
    const { db, calls } = fakeDb([t(1), t(2), t(3)]);
    const send = vi.fn(async (sub: { endpoint: string }, _body: string) => {
      void _body;
      if (sub.endpoint.endsWith("/2")) throw Object.assign(new Error("gone"), { statusCode: 410 });
      if (sub.endpoint.endsWith("/3")) throw Object.assign(new Error("busy"), { statusCode: 503 });
    });
    const r = await notifyCommunity(db, "ws", PAYLOAD, send);
    expect(r).toEqual({ sent: 1, gone: 1 });
    expect(JSON.parse(send.mock.calls[0][1])).toEqual(PAYLOAD);
    expect(calls.at(-1)).toEqual({
      fn: "network_push_forget",
      args: { p_workspace_id: "ws", p_endpoints: ["https://push.example/2"] },
    });
  });

  it("members (not the team) can't notify anyone, and that never throws", async () => {
    vi.stubEnv("NETWORK_PUSH_PUBLIC_KEY", "B" + "A".repeat(86));
    vi.stubEnv("NETWORK_PUSH_PRIVATE_KEY", "p".repeat(43));
    vi.stubEnv("NETWORK_PUSH_SUBJECT", "mailto:sam@example.test");
    const { db } = fakeDb([], "42501");
    expect(await notifyCommunity(db, "ws", PAYLOAD, vi.fn())).toMatchObject({
      sent: 0,
      skipped: "not team",
    });
  });
});
