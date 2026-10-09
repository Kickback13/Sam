"use client";

import { Copy, Link2, Loader2, UserMinus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Field } from "@/components/common/field";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { ROLE_LABELS } from "@/lib/constants";
import { formatDate, formatRelative } from "@/lib/format";
import type { MemberRole } from "@/lib/validation/settings";
import {
  createInvite,
  removeMember,
  revokeInvite,
  updateMemberRole,
} from "@/server/actions/settings";

export type InviteRow = {
  id: string;
  email: string | null;
  role: MemberRole;
  status: "pending" | "accepted" | "revoked" | "expired";
  url: string | null;
  createdAt: string;
  expiresAt: string;
};

export type MemberItem = {
  userId: string;
  name: string;
  email: string | null;
  role: MemberRole;
  joinedAt: string;
};

const ROLE_HELP: Record<MemberRole, string> = {
  owner: "Everything, including other owners",
  admin: "Settings, members, pipelines + all data",
  agent: "Create and edit CRM data",
  viewer: "Read-only",
};

export function MembersManager({
  members,
  invites,
  hasOwner,
}: {
  members: MemberItem[];
  invites: InviteRow[];
  hasOwner: boolean;
}) {
  const ws = useWorkspace();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("agent");
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const myRole = ws.role;

  async function copy(url: string) {
    await navigator.clipboard.writeText(url);
    toast.success("Invite link copied");
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Members ({members.length})</CardTitle>
        </CardHeader>
        <CardContent className="pt-1">
          <ul className="divide-y" data-testid="members">
            {members.map((m) => {
              const isMe = m.userId === ws.userId;
              const canEdit = ws.isAdmin && !isMe && (m.role !== "owner" || myRole === "owner");
              return (
                <li
                  key={m.userId}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      {m.name}{" "}
                      {isMe && (
                        <span className="text-xs font-normal text-muted-foreground">(you)</span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {m.email} · joined {formatDate(m.joinedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {canEdit ? (
                      <NativeSelect
                        aria-label={`Role for ${m.name}`}
                        className="h-9 w-32 text-sm"
                        value={m.role}
                        disabled={pending}
                        onChange={(e) =>
                          start(async () => {
                            const r = await updateMemberRole({
                              workspaceId: ws.id,
                              userId: m.userId,
                              role: e.target.value as MemberRole,
                            });
                            if (r.ok) toast.success("Role updated");
                            else toast.error(r.error);
                          })
                        }
                      >
                        {(Object.keys(ROLE_LABELS) as MemberRole[])
                          .filter((r) => r !== "owner" || myRole === "owner")
                          .map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                      </NativeSelect>
                    ) : (
                      <Badge variant={m.role === "owner" ? "default" : "secondary"}>
                        {ROLE_LABELS[m.role]}
                      </Badge>
                    )}
                    {canEdit && (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Remove ${m.name}`}
                        disabled={pending}
                        onClick={() => {
                          if (!confirm(`Remove ${m.name} from ${ws.name}?`)) return;
                          start(async () => {
                            const r = await removeMember({ workspaceId: ws.id, userId: m.userId });
                            if (r.ok) toast.success("Member removed");
                            else toast.error(r.error);
                          });
                        }}
                      >
                        <UserMinus aria-hidden />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {ws.isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Invite someone</CardTitle>
            <p className="text-sm text-muted-foreground">
              They get access after signing in with the invited email (or by opening a single-use
              link). No email is sent automatically — share the link yourself.
            </p>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  const r = await createInvite({ workspaceId: ws.id, email, role });
                  if (!r.ok) {
                    toast.error(r.fieldErrors?.email?.[0] ?? r.error);
                    return;
                  }
                  setLastUrl(r.data.url);
                  setEmail("");
                  toast.success(
                    email ? `Invite created for ${email}` : "Single-use invite link created",
                  );
                });
              }}
            >
              <Field
                id="invite-email"
                label="Email"
                help="Leave blank for a single-use link anyone can claim once."
              >
                <Input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                />
              </Field>
              <Field id="invite-role" label="Role" help={ROLE_HELP[role]}>
                <NativeSelect
                  id="invite-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as MemberRole)}
                >
                  {(Object.keys(ROLE_LABELS) as MemberRole[])
                    .filter((r) => r !== "owner" || myRole === "owner" || !hasOwner)
                    .map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                </NativeSelect>
              </Field>
              <Button type="submit" disabled={pending} className="sm:mb-5">
                {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Link2 aria-hidden />}
                Create invite
              </Button>
            </form>
            {lastUrl && (
              <div className="mt-3 flex items-center gap-2 rounded-md bg-brand-surface px-3 py-2 text-sm">
                <code className="min-w-0 flex-1 truncate" data-testid="invite-url">
                  {lastUrl}
                </code>
                <Button size="sm" variant="outline" onClick={() => copy(lastUrl)}>
                  <Copy aria-hidden /> Copy
                </Button>
              </div>
            )}
            {!hasOwner && (
              <p className="mt-3 text-xs text-muted-foreground">
                This workspace has no owner yet — an admin can invite Sam as <strong>Owner</strong>.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {ws.isAdmin && invites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Invites</CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            <ul className="divide-y">
              {invites.map((i) => (
                <li
                  key={i.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{i.email ?? "Single-use link"}</p>
                    <p className="text-xs text-muted-foreground">
                      {ROLE_LABELS[i.role]} · created {formatRelative(i.createdAt)} · expires{" "}
                      {formatDate(i.expiresAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        i.status === "pending"
                          ? "info"
                          : i.status === "accepted"
                            ? "success"
                            : "secondary"
                      }
                    >
                      {i.status}
                    </Badge>
                    {i.status === "pending" && i.url && (
                      <Button size="sm" variant="outline" onClick={() => copy(i.url!)}>
                        <Copy aria-hidden /> Link
                      </Button>
                    )}
                    {i.status === "pending" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-brand-danger"
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            const r = await revokeInvite({ workspaceId: ws.id, inviteId: i.id });
                            if (r.ok) toast.success("Invite revoked");
                            else toast.error(r.error);
                          })
                        }
                      >
                        Revoke
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
