import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/lib/db/types";

import { anon, cleanup, seed, signIn } from "./env";

/**
 * End-to-end tenancy proof through the real API: two users with real JWTs,
 * each in their own workspace, hitting PostgREST exactly like the app does.
 */
let A: SupabaseClient<Database>;
let B: SupabaseClient<Database>;
let ctx: Awaited<ReturnType<typeof seed>>;

beforeAll(async () => {
  ctx = await seed();
  A = await signIn(ctx.a);
  B = await signIn(ctx.b);
});

afterAll(async () => {
  await cleanup();
});

describe("workspace isolation (user A vs workspace B)", () => {
  it("A only sees its own workspace", async () => {
    const { data } = await A.from("workspaces").select("slug");
    expect(data?.map((w) => w.slug)).toEqual(["rls-vitest-a"]);
  });

  it("A reads its own contacts but none of B's", async () => {
    const own = await A.from("contacts").select("first_name").eq("workspace_id", ctx.wsA);
    expect(own.data?.map((c) => c.first_name)).toEqual(["Alpha"]);
    const other = await A.from("contacts").select("id").eq("workspace_id", ctx.wsB);
    expect(other.data).toEqual([]);
    const byId = await A.from("contacts").select("id").eq("id", ctx.contactB);
    expect(byId.data).toEqual([]);
  });

  it("A cannot insert into B", async () => {
    const { error } = await A.from("contacts").insert({
      workspace_id: ctx.wsB,
      first_name: "Intruder",
    });
    expect(error?.code).toBe("42501");
  });

  it("A cannot update or delete B's rows", async () => {
    const upd = await A.from("contacts")
      .update({ first_name: "Hacked" })
      .eq("id", ctx.contactB)
      .select("id");
    expect(upd.data).toEqual([]);
    const del = await A.from("contacts").delete().eq("id", ctx.contactB).select("id");
    expect(del.data).toEqual([]);
    const check = await B.from("contacts").select("first_name").eq("id", ctx.contactB).single();
    expect(check.data?.first_name).toBe("Bravo");
  });

  it("A cannot move its own contact into B", async () => {
    const own = await A.from("contacts").select("id").eq("workspace_id", ctx.wsA).single();
    const { error } = await A.from("contacts")
      .update({ workspace_id: ctx.wsB })
      .eq("id", own.data!.id);
    expect(error?.code).toBe("42501");
  });

  it("A cannot add itself to B or read B's members/invites", async () => {
    const join = await A.from("workspace_members").insert({
      workspace_id: ctx.wsB,
      user_id: ctx.a.id,
      role: "owner",
    });
    expect(join.error?.code).toBe("42501");
    expect(
      (await A.from("workspace_members").select("user_id").eq("workspace_id", ctx.wsB)).data,
    ).toEqual([]);
    expect((await A.from("invites").select("id").eq("workspace_id", ctx.wsB)).data).toEqual([]);
  });

  it("A cannot accept an invite bound to another email", async () => {
    const { error } = await A.rpc("accept_invite", { p_token: ctx.inviteB });
    expect(error?.message).toMatch(/different email/);
  });

  it("search and aggregates are tenant-scoped", async () => {
    expect(
      (await A.rpc("global_search", { p_workspace_id: ctx.wsB, p_query: "bravo" })).data,
    ).toEqual([]);
    expect(
      (await A.rpc("global_search", { p_workspace_id: ctx.wsA, p_query: "alpha" })).data,
    ).toHaveLength(1);
    const counts = (await A.rpc("workspace_counts", { p_workspace_id: ctx.wsB })).data as Record<
      string,
      number
    >;
    expect(counts.contacts).toBe(0);
  });

  it("agents cannot change pipeline configuration or read the audit log", async () => {
    const p = await A.from("pipelines").insert({
      workspace_id: ctx.wsA,
      name: "Sneaky",
      kind: "acquisition",
    });
    expect(p.error?.code).toBe("42501");
    expect((await A.from("audit_log").select("id")).data).toEqual([]);
  });

  it("anonymous requests see nothing", async () => {
    const { data, error } = await anon().from("contacts").select("id");
    expect(data ?? []).toEqual([]);
    expect(error === null || error.code === "42501").toBe(true);
  });

  it("B sees its own data and not A's", async () => {
    const { data } = await B.from("contacts").select("first_name");
    expect(data?.map((c) => c.first_name)).toEqual(["Bravo"]);
  });
});
