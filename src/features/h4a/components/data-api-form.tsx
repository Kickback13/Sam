"use client";

import { Loader2, PlugZap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Field } from "@/components/common/field";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { disconnectDataApi, saveDataApiKey } from "../server/property-data";

/** Settings → Integrations → Property data: paste the RentCast key, set the monthly cap. */
export function DataApiForm({
  connected,
  monthlyLimit,
}: {
  connected: boolean;
  monthlyLimit: number;
}) {
  const ws = useWorkspace();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [key, setKey] = useState("");
  const [limit, setLimit] = useState(String(connected ? monthlyLimit : 40));
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      noValidate
      className="space-y-4 rounded-xl border bg-card p-4"
      data-testid="data-api-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await saveDataApiKey({
            workspaceId: ws.id,
            key: key.trim() ? key.trim() : undefined,
            monthlyLimit: Number(limit),
          });
          if (!r.ok) {
            setError(r.error);
            return;
          }
          setKey("");
          toast.success(key.trim() ? "RentCast connected" : "Monthly limit saved");
          router.refresh();
        });
      }}
    >
      <Field
        id="dk-key"
        label={connected ? "Replace the API key (optional)" : "RentCast API key"}
        help="From app.rentcast.io → API. Stored encrypted; nobody can read it back. Saving makes no request to RentCast."
      >
        <Input
          id="dk-key"
          type="password"
          autoComplete="off"
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
      </Field>
      <Field
        id="dk-limit"
        label="Monthly request limit"
        help="The app refuses requests past this number each month, so nothing is charged beyond what your RentCast plan includes. 0 pauses all requests."
      >
        <Input
          id="dk-limit"
          type="number"
          min={0}
          max={100000}
          className="w-32"
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
        />
      </Field>
      {error && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
        >
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          disabled={pending || (!connected && !key.trim())}
          data-testid="data-api-save"
        >
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <PlugZap aria-hidden />}
          {connected ? "Save" : "Connect"}
        </Button>
        {connected && (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            data-testid="data-api-disconnect"
            onClick={() =>
              start(async () => {
                const r = await disconnectDataApi({ workspaceId: ws.id });
                if (!r.ok) toast.error(r.error);
                else toast.success("RentCast disconnected");
                router.refresh();
              })
            }
          >
            Disconnect
          </Button>
        )}
      </div>
    </form>
  );
}
