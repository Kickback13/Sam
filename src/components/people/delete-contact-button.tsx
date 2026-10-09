"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/shell/workspace-provider";
import { Button } from "@/components/ui/button";
import { deleteContacts } from "@/server/actions/contacts";

export function DeleteContactButton({ contactId, name }: { contactId: string; name: string }) {
  const ws = useWorkspace();
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!ws.canWrite) return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-brand-danger"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Delete ${name}? The record is kept in the audit trail.`)) return;
        start(async () => {
          const result = await deleteContacts({ workspaceId: ws.id, contactIds: [contactId] });
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success("Contact deleted");
          router.push(`/w/${ws.slug}/people`);
        });
      }}
    >
      <Trash2 aria-hidden /> Delete
    </Button>
  );
}
