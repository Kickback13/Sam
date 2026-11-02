"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { useWorkspace } from "@/components/shell/workspace-provider";
import { Button } from "@/components/ui/button";

import { RouteForm } from "./setup-forms";

const EMPTY = {
  id: null,
  name: "",
  description: "",
  forward_to: "",
  keywords: "",
  languages: ["en", "es"] as ("en" | "es")[],
  assignee_user_id: "",
  is_default: false,
  active: true,
  position: 0,
};

export function NewRoute({ count }: { count: number }) {
  const ws = useWorkspace();
  const [open, setOpen] = useState(count === 0);
  if (!ws.isAdmin) return null;
  if (!open)
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} data-testid="add-route">
        <Plus aria-hidden /> Add a route
      </Button>
    );
  return (
    <RouteForm
      // Default and position are decided by the server (the page's count can be stale).
      initial={EMPTY}
      onDone={() => setOpen(false)}
    />
  );
}
