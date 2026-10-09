"use client";

import { Loader2, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/shell/workspace-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { SubjectType } from "@/lib/validation/activity";
import { createTask } from "@/server/actions/tasks";

/** "YYYY-MM-DD" + "HH:MM" in the browser's timezone → ISO. */
function toIso(date: string, time: string): string | null {
  if (!date) return null;
  const d = new Date(`${date}T${time || "17:00"}:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function NewTaskDialog({
  related,
  trigger,
}: {
  related?: { type: SubjectType; id: string; name: string };
  trigger?: React.ReactNode;
}) {
  const ws = useWorkspace();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [assignee, setAssignee] = useState(ws.userId);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!ws.canWrite) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const result = await createTask({
        workspaceId: ws.id,
        title,
        notes,
        due_at: toIso(date, time),
        assigned_to: assignee || null,
        related_type: related?.type ?? null,
        related_id: related?.id ?? null,
      });
      if (!result.ok) {
        setError(result.fieldErrors?.title?.[0] ?? result.error);
        return;
      }
      toast.success("Task added");
      setOpen(false);
      setTitle("");
      setDate("");
      setTime("");
      setNotes("");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <Plus aria-hidden /> Task
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          {related && <DialogDescription>For {related.name}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Task</Label>
            <Input
              id="task-title"
              autoFocus
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Call the owner back about the T-12"
              aria-invalid={Boolean(error)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="task-date">Due date</Label>
              <Input id="task-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-time">Time</Label>
              <Input id="task-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={!date} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-assignee">Assigned to</Label>
            <NativeSelect id="task-assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">Unassigned</option>
              {ws.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id === ws.userId ? `${m.name} (me)` : m.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-notes">Notes</Label>
            <Textarea id="task-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error && (
            <p role="alert" className="text-sm text-brand-danger">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              Add task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
