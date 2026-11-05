import { describe, expect, it } from "vitest";

import { buildConversations, filterConversations, preview, type InboxMessage } from "./inbox";

const m = (over: Partial<InboxMessage>): InboxMessage => ({
  id: Math.random().toString(36),
  contactId: "c1",
  direction: "in",
  status: "received",
  body: "hi",
  keyword: null,
  createdAt: "2026-11-05T10:00:00Z",
  ...over,
});

describe("messages inbox", () => {
  it("one conversation per contact, newest first", () => {
    const list = buildConversations([
      m({ contactId: "a", createdAt: "2026-11-05T09:00:00Z" }),
      m({ contactId: "b", createdAt: "2026-11-05T11:00:00Z", body: "latest" }),
      m({ contactId: "a", createdAt: "2026-11-05T10:00:00Z", direction: "out", status: "sent" }),
      m({ contactId: null }),
    ]);
    expect(list.map((c) => c.contactId)).toEqual(["b", "a"]);
    expect(list[0].last.body).toBe("latest");
    expect(list[1].messageCount).toBe(2);
  });

  it("needs a reply when inbound texts came after our last real send", () => {
    const [c] = buildConversations([
      m({ direction: "out", status: "delivered", createdAt: "2026-11-05T08:00:00Z" }),
      m({ createdAt: "2026-11-05T09:00:00Z" }),
      m({ createdAt: "2026-11-05T09:05:00Z" }),
    ]);
    expect(c).toMatchObject({ needsReply: true, unanswered: 2 });
    const [answered] = buildConversations([
      m({ createdAt: "2026-11-05T09:00:00Z" }),
      m({ direction: "out", status: "sent", createdAt: "2026-11-05T09:10:00Z" }),
    ]);
    expect(answered.needsReply).toBe(false);
  });

  it("a blocked or failed attempt doesn't count as a reply; STOP/HELP don't need one", () => {
    const [blocked] = buildConversations([
      m({ createdAt: "2026-11-05T09:00:00Z" }),
      m({ direction: "out", status: "blocked", createdAt: "2026-11-05T09:10:00Z" }),
    ]);
    expect(blocked.needsReply).toBe(true);
    const [stop] = buildConversations([m({ body: "STOP", keyword: "stop" })]);
    expect(stop.needsReply).toBe(false);
  });

  it("filters and previews", () => {
    const list = buildConversations([
      m({ contactId: "a" }),
      m({ contactId: "b", direction: "out", status: "sent" }),
    ]);
    expect(filterConversations(list, "needs_reply").map((c) => c.contactId)).toEqual(["a"]);
    expect(filterConversations(list, "all")).toHaveLength(2);
    expect(preview(m({ direction: "out", status: "sent", body: "Hello  there" }))).toBe(
      "You: Hello there",
    );
    expect(preview(m({ direction: "out", status: "blocked", body: "x" }))).toBe("Not sent: x");
    expect(preview(m({ body: "a".repeat(100) }), 10)).toBe(`${"a".repeat(9)}…`);
  });
});
