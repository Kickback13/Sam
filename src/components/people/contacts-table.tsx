"use client";

import { Loader2, Tag, Trash2, UserCheck } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ComplianceBadges } from "@/components/common/compliance-badges";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CONTACT_ROLES, labelFor } from "@/lib/constants";
import { formatRelative } from "@/lib/format";
import { formatPhone } from "@/lib/normalize";
import { bulkAssignContacts, bulkTagContacts, deleteContacts } from "@/server/actions/contacts";
import type { ContactListItem } from "@/server/queries/contacts";

function RoleBadges({ roles }: { roles: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {roles.slice(0, 2).map((r) => (
        <Badge key={r} variant="secondary">
          {labelFor(CONTACT_ROLES, r)}
        </Badge>
      ))}
      {roles.length > 2 && <Badge variant="outline">+{roles.length - 2}</Badge>}
    </div>
  );
}

export function ContactsTable({ rows }: { rows: ContactListItem[] }) {
  const ws = useWorkspace();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tagInput, setTagInput] = useState("");
  const [pending, start] = useTransition();
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const ids = [...selected];

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function run(
    fn: () => Promise<{ ok: boolean; error?: string; data?: { count: number } }>,
    success: (n: number) => string,
  ) {
    start(async () => {
      const result = await fn();
      if (!result.ok) {
        toast.error(result.error ?? "Something went wrong");
        return;
      }
      toast.success(success(result.data?.count ?? 0));
      setSelected(new Set());
      setTagInput("");
    });
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {ws.canWrite && selected.size > 0 && (
        <div
          className="flex flex-wrap items-center gap-2 border-b bg-brand-surface px-3 py-2"
          role="region"
          aria-label="Bulk actions"
        >
          <span className="text-sm font-semibold">{selected.size} selected</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" disabled={pending}>
                <Tag aria-hidden /> Tag
              </Button>
            </PopoverTrigger>
            <PopoverContent className="space-y-2">
              <label htmlFor="bulk-tag" className="text-sm font-semibold">
                Tags (comma-separated)
              </label>
              <Input
                id="bulk-tag"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="long-hold, priority"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={!tagInput.trim() || pending}
                  onClick={() =>
                    run(
                      () =>
                        bulkTagContacts({
                          workspaceId: ws.id,
                          contactIds: ids,
                          add: tagInput.split(","),
                          remove: [],
                        }),
                      (n) => `Tagged ${n} contacts`,
                    )
                  }
                >
                  Add tags
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!tagInput.trim() || pending}
                  onClick={() =>
                    run(
                      () =>
                        bulkTagContacts({
                          workspaceId: ws.id,
                          contactIds: ids,
                          add: [],
                          remove: tagInput.split(","),
                        }),
                      (n) => `Removed tags from ${n} contacts`,
                    )
                  }
                >
                  Remove
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          <div className="flex items-center gap-1">
            <UserCheck className="size-4 text-muted-foreground" aria-hidden />
            <NativeSelect
              aria-label="Assign selected to"
              className="h-8 w-44 text-sm"
              value=""
              disabled={pending}
              onChange={(e) => {
                const value = e.target.value;
                if (!value) return;
                run(
                  () =>
                    bulkAssignContacts({
                      workspaceId: ws.id,
                      contactIds: ids,
                      assignedTo: value === "unassigned" ? null : value,
                    }),
                  (n) => `Assigned ${n} contacts`,
                );
              }}
            >
              <option value="">Assign to…</option>
              <option value="unassigned">Unassigned</option>
              {ws.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="text-brand-danger"
            disabled={pending}
            onClick={() => {
              if (
                !confirm(
                  `Delete ${selected.size} contact(s)? They can be restored by an admin from the audit log.`,
                )
              )
                return;
              run(
                () => deleteContacts({ workspaceId: ws.id, contactIds: ids }),
                (n) => `Deleted ${n} contacts`,
              );
            }}
          >
            <Trash2 aria-hidden /> Delete
          </Button>
          {pending && <Loader2 className="size-4 animate-spin" aria-label="Working" />}
        </div>
      )}

      {/* Desktop table */}
      <div className="hidden md:block">
        <Table data-testid="contacts-table">
          <TableHeader>
            <TableRow>
              {ws.canWrite && (
                <TableHead className="w-10">
                  <Checkbox
                    aria-label="Select all on this page"
                    checked={allSelected}
                    onCheckedChange={(c) =>
                      setSelected(c ? new Set(rows.map((r) => r.id)) : new Set())
                    }
                  />
                </TableHead>
              )}
              <TableHead>Name</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Assigned</TableHead>
              <TableHead>Compliance</TableHead>
              <TableHead className="text-right">Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => (
              <TableRow key={c.id} data-state={selected.has(c.id) ? "selected" : undefined}>
                {ws.canWrite && (
                  <TableCell>
                    <Checkbox
                      aria-label={`Select ${c.name}`}
                      checked={selected.has(c.id)}
                      onCheckedChange={() => toggle(c.id)}
                    />
                  </TableCell>
                )}
                <TableCell className="max-w-64">
                  <Link
                    href={`/w/${ws.slug}/people/${c.id}`}
                    className="block truncate font-semibold hover:underline"
                  >
                    {c.name}
                  </Link>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[c.title, c.company?.name].filter(Boolean).join(" · ") || c.city || "—"}
                  </span>
                </TableCell>
                <TableCell>
                  <RoleBadges roles={c.roles} />
                </TableCell>
                <TableCell className="max-w-56 truncate">{c.email ?? "—"}</TableCell>
                <TableCell className="whitespace-nowrap tabular">
                  {c.phone ? formatPhone(c.phone) : "—"}
                </TableCell>
                <TableCell className="max-w-40">
                  <span className="block truncate text-xs text-muted-foreground">
                    {c.tags.join(", ") || "—"}
                  </span>
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap">{c.assignee ?? "—"}</TableCell>
                <TableCell>
                  <ComplianceBadges
                    dnc={c.dnc}
                    smsConsent={c.smsConsent}
                    emailOptOut={c.emailOptOut}
                    compact
                  />
                </TableCell>
                <TableCell className="text-right text-xs whitespace-nowrap text-muted-foreground">
                  {formatRelative(c.updatedAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <ul className="divide-y md:hidden">
        {rows.map((c) => (
          <li key={c.id} className="flex items-start gap-3 px-3 py-3">
            {ws.canWrite && (
              <Checkbox
                className="mt-1"
                aria-label={`Select ${c.name}`}
                checked={selected.has(c.id)}
                onCheckedChange={() => toggle(c.id)}
              />
            )}
            <Link href={`/w/${ws.slug}/people/${c.id}`} className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{c.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {[c.title, c.company?.name].filter(Boolean).join(" · ") || c.email || "—"}
              </span>
              <span className="mt-1 flex flex-wrap gap-1">
                <RoleBadges roles={c.roles} />
                <ComplianceBadges
                  dnc={c.dnc}
                  smsConsent={c.smsConsent}
                  emailOptOut={c.emailOptOut}
                  compact
                />
              </span>
            </Link>
            {c.phone && (
              <a
                href={`tel:${c.phone}`}
                className="shrink-0 rounded-md border px-2 py-1 text-xs font-semibold"
                aria-label={`Call ${c.name}`}
              >
                Call
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
