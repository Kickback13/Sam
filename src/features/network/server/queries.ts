import "server-only";

import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { parseBrand, type Brand } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/server/auth";

export type NetworkContext = {
  slug: string;
  workspaceId: string;
  name: string;
  brand: Brand;
  isStaff: boolean;
  canModerate: boolean;
  memberId: string | null;
  displayName: string | null;
  userId: string;
};

/** The member app's context: an active member, or the workspace's own staff (preview). */
export const getNetworkContext = cache(async (slug: string): Promise<NetworkContext> => {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/n/${slug}`)}`);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("network_context", { p_slug: slug });
  if (error) throw error;
  const row = data?.[0];
  if (!row) notFound();
  return {
    slug,
    workspaceId: row.workspace_id,
    name: row.workspace_name,
    brand: parseBrand(row.brand),
    isStaff: row.is_staff,
    canModerate: row.can_moderate,
    memberId: row.member_id,
    displayName: row.display_name,
    userId: user.id,
  };
});

export type FeedPost = {
  id: string;
  kind: "update" | "deal";
  title: string;
  body: string;
  propertyType: string | null;
  units: number | null;
  price: number | null;
  city: string | null;
  zip: string | null;
  link: string | null;
  pinned: boolean;
  hidden: boolean;
  createdAt: string;
  authorUserId: string | null;
  authorName: string;
  commentCount: number;
};

const POST_COLS =
  "id, kind, title, body, property_type, units, price, city, zip, link, pinned, hidden_at, created_at, author_user_id, author_member_id, author:network_members!network_posts_workspace_id_author_member_id_fkey(display_name), comments:network_comments(count)";

type RawPost = {
  id: string;
  kind: string;
  title: string;
  body: string;
  property_type: string | null;
  units: number | null;
  price: number | null;
  city: string | null;
  zip: string | null;
  link: string | null;
  pinned: boolean;
  hidden_at: string | null;
  created_at: string;
  author_user_id: string | null;
  author_member_id: string | null;
  author: { display_name: string } | null;
  comments: { count: number }[];
};

function toPost(r: RawPost, teamName: string): FeedPost {
  return {
    id: r.id,
    kind: r.kind as FeedPost["kind"],
    title: r.title,
    body: r.body,
    propertyType: r.property_type,
    units: r.units,
    price: r.price === null ? null : Number(r.price),
    city: r.city,
    zip: r.zip,
    link: r.link,
    pinned: r.pinned,
    hidden: r.hidden_at !== null,
    createdAt: r.created_at,
    authorUserId: r.author_user_id,
    // Staff post as the business; a member whose profile is unlisted shows as "A member".
    authorName: r.author_member_id ? (r.author?.display_name ?? "A member") : teamName,
    commentCount: r.comments?.[0]?.count ?? 0,
  };
}

export async function listPosts(
  ctx: Pick<NetworkContext, "workspaceId" | "name">,
  opts: { kind?: "deal"; includeHidden?: boolean } = {},
): Promise<FeedPost[]> {
  const supabase = await createClient();
  let q = supabase
    .from("network_posts")
    .select(POST_COLS)
    .eq("workspace_id", ctx.workspaceId)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);
  if (opts.kind) q = q.eq("kind", opts.kind);
  if (!opts.includeHidden) q = q.is("hidden_at", null);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as unknown as RawPost[]).map((r) => toPost(r, `${ctx.name} team`));
}

export type PostComment = {
  id: string;
  body: string;
  createdAt: string;
  authorUserId: string | null;
  authorName: string;
  hidden: boolean;
};

export async function getPost(
  ctx: Pick<NetworkContext, "workspaceId" | "name">,
  id: string,
): Promise<{ post: FeedPost; comments: PostComment[] } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("network_posts")
    .select(POST_COLS)
    .eq("workspace_id", ctx.workspaceId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { data: comments, error: cErr } = await supabase
    .from("network_comments")
    .select(
      "id, body, created_at, author_user_id, author_member_id, hidden_at, author:network_members!network_comments_workspace_id_author_member_id_fkey(display_name)",
    )
    .eq("workspace_id", ctx.workspaceId)
    .eq("post_id", id)
    .order("created_at")
    .limit(500);
  if (cErr) throw cErr;
  return {
    post: toPost(data as unknown as RawPost, `${ctx.name} team`),
    comments: (comments ?? []).map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.created_at,
      authorUserId: c.author_user_id,
      authorName: c.author_member_id ? (c.author?.display_name ?? "A member") : `${ctx.name} team`,
      hidden: c.hidden_at !== null,
    })),
  };
}

export type NetworkEvent = {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  url: string | null;
  canceled: boolean;
  going: number;
  myRsvp: "going" | "not_going" | null;
};

export async function listEvents(workspaceId: string, userId: string): Promise<NetworkEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("network_events")
    .select(
      "id, title, description, starts_at, ends_at, location, url, canceled_at, rsvps:network_rsvps(user_id, status)",
    )
    .eq("workspace_id", workspaceId)
    .gte("starts_at", new Date(Date.now() - 24 * 3600_000).toISOString())
    .order("starts_at")
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    startsAt: e.starts_at,
    endsAt: e.ends_at,
    location: e.location,
    url: e.url,
    canceled: e.canceled_at !== null,
    going: (e.rsvps ?? []).filter((r) => r.status === "going").length,
    myRsvp:
      ((e.rsvps ?? []).find((r) => r.user_id === userId)?.status as NetworkEvent["myRsvp"]) ?? null,
  }));
}

export type DirectoryMember = {
  id: string;
  userId: string;
  displayName: string;
  headline: string | null;
  bio: string | null;
  city: string | null;
  memberType: string;
  publicEmail: string | null;
  publicPhone: string | null;
  joinedAt: string;
};

export async function listDirectory(workspaceId: string): Promise<DirectoryMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("network_members")
    .select(
      "id, user_id, display_name, headline, bio, city, member_type, public_email, public_phone, joined_at",
    )
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .eq("show_in_directory", true)
    .order("display_name")
    .limit(1000);
  if (error) throw error;
  return (data ?? []).map((m) => ({
    id: m.id,
    userId: m.user_id,
    displayName: m.display_name,
    headline: m.headline,
    bio: m.bio,
    city: m.city,
    memberType: m.member_type,
    publicEmail: m.public_email,
    publicPhone: m.public_phone,
    joinedAt: m.joined_at,
  }));
}

export async function getMyProfile(workspaceId: string, userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("network_members")
    .select(
      "id, display_name, headline, bio, city, show_in_directory, public_email, public_phone, member_type",
    )
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Staff views
// ---------------------------------------------------------------------------
export type StaffMember = DirectoryMember & {
  status: "active" | "removed";
  tags: string[];
  showInDirectory: boolean;
  contactId: string | null;
};

export async function listMembersForStaff(workspaceId: string): Promise<StaffMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("network_members")
    .select(
      "id, user_id, display_name, headline, bio, city, member_type, public_email, public_phone, joined_at, status, tags, show_in_directory, contact_id",
    )
    .eq("workspace_id", workspaceId)
    .order("status")
    .order("joined_at", { ascending: false })
    .limit(2000);
  if (error) throw error;
  return (data ?? []).map((m) => ({
    id: m.id,
    userId: m.user_id,
    displayName: m.display_name,
    headline: m.headline,
    bio: m.bio,
    city: m.city,
    memberType: m.member_type,
    publicEmail: m.public_email,
    publicPhone: m.public_phone,
    joinedAt: m.joined_at,
    status: m.status as StaffMember["status"],
    tags: m.tags,
    showInDirectory: m.show_in_directory,
    contactId: m.contact_id,
  }));
}

export type PendingInvite = {
  id: string;
  email: string | null;
  name: string | null;
  memberType: string;
  token: string;
  expiresAt: string;
  createdAt: string;
};

export async function listPendingInvites(workspaceId: string): Promise<PendingInvite[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("network_invites")
    .select("id, email, name, member_type, token, expires_at, created_at")
    .eq("workspace_id", workspaceId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((i) => ({
    id: i.id,
    email: i.email,
    name: i.name,
    memberType: i.member_type,
    token: i.token,
    expiresAt: i.expires_at,
    createdAt: i.created_at,
  }));
}

export async function listStaffEvents(workspaceId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("network_events")
    .select("id, title, starts_at, location, canceled_at, rsvps:network_rsvps(status)")
    .eq("workspace_id", workspaceId)
    .order("starts_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((e) => ({
    id: e.id,
    title: e.title,
    startsAt: e.starts_at,
    location: e.location,
    canceled: e.canceled_at !== null,
    going: (e.rsvps ?? []).filter((r) => r.status === "going").length,
  }));
}
