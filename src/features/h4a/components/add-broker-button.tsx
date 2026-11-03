"use client";

import { Loader2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/shell/workspace-provider";
import { Button } from "@/components/ui/button";
import { createContact } from "@/server/actions/contacts";

/** Prospects → Brokers: add a broker from their listings to People (role Broker). */
export function AddBrokerButton({
  name,
  company,
  email,
  phone,
}: {
  name: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
}) {
  const ws = useWorkspace();
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!ws.canWrite) return null;
  const [first, ...rest] = (name ?? "").trim().split(/\s+/);
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      data-testid="add-broker"
      onClick={() =>
        start(async () => {
          const r = await createContact({
            workspaceId: ws.id,
            contact: {
              first_name: first || null,
              last_name: rest.join(" ") || null,
              title: company ? `Broker, ${company}`.slice(0, 150) : "Broker",
              roles: ["broker"],
              emails: email ? [{ value: email, label: "work" }] : [],
              phones: phone ? [{ value: phone, label: "work" }] : [],
              source: "Prospects: broker ranking",
              tags: ["broker"],
            },
          });
          if (!r.ok) {
            if ("duplicates" in r && r.duplicates[0])
              toast.error(
                <span>
                  Already in People:{" "}
                  <Link className="underline" href={`/w/${ws.slug}/people/${r.duplicates[0].id}`}>
                    {r.duplicates[0].name ?? "open contact"}
                  </Link>
                </span>,
              );
            else toast.error(r.error);
            return;
          }
          toast.success(`${name ?? email ?? phone} added to People`);
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <UserPlus aria-hidden />}
      Add to People
    </Button>
  );
}
