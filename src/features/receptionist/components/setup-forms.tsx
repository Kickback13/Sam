"use client";

import { Copy, KeyRound, Loader2, Plus, Save, Trash2, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Field } from "@/components/common/field";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useHydrated } from "@/lib/use-hydrated";
import type { FieldErrors } from "@/lib/validation/common";

import {
  chooseRoute,
  DAYS,
  detectLanguage,
  isOpen,
  type Day,
  type Hours,
  type Route,
} from "../routing";
import {
  createReceptionistToken,
  deleteRoute,
  saveReceptionistSettings,
  saveRoute,
} from "../server/actions";
import { DEFAULT_GREETING_EN, DEFAULT_GREETING_ES } from "../twilio";

const TIME_ZONES = [
  ["America/Los_Angeles", "Pacific"],
  ["America/Phoenix", "Arizona"],
  ["America/Denver", "Mountain"],
  ["America/Chicago", "Central"],
  ["America/New_York", "Eastern"],
  ["America/Anchorage", "Alaska"],
  ["Pacific/Honolulu", "Hawaii"],
] as const;

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.message(text);
  }
}

export function ConnectionLinks({ hasToken }: { hasToken: boolean | null }) {
  const ws = useWorkspace();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [token, setToken] = useState<string | null>(null);
  if (!ws.isAdmin) return null;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const urls = token
    ? [
        [
          "Twilio · A call comes in (webhook, POST)",
          `${origin}/api/receptionist/twilio/${token}/voice`,
        ],
        [
          "Twilio · Call status changes (POST)",
          `${origin}/api/receptionist/twilio/${token}/status`,
        ],
        ["ElevenLabs · Post-call webhook", `${origin}/api/receptionist/elevenlabs/${token}`],
      ]
    : [];
  return (
    <section
      className="space-y-3 rounded-xl border bg-card p-4"
      aria-labelledby="links-h"
      data-testid="receptionist-links"
    >
      <h2 id="links-h" className="font-sans text-base font-bold">
        Connection links
      </h2>
      <p className="text-sm text-muted-foreground">
        {hasToken
          ? "Links exist. Making new ones replaces them — update Twilio and ElevenLabs after."
          : "Paste these into Sam's Twilio number and ElevenLabs agent. They're shown once; keep them private."}
      </p>
      {urls.length > 0 && (
        <ul className="space-y-2 text-sm" data-testid="receptionist-urls">
          {urls.map(([label, url]) => (
            <li key={label} className="rounded-md bg-muted p-2">
              <p className="text-xs font-semibold">{label}</p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 break-all">{url}</code>
                <Button size="sm" variant="outline" onClick={() => copy(url, "Link")}>
                  <Copy aria-hidden /> Copy
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Button
        variant="outline"
        disabled={pending}
        data-testid="receptionist-create-token"
        onClick={() => {
          if (
            hasToken &&
            !confirm(
              "Replace the current links? Calls stop logging until Twilio/ElevenLabs are updated.",
            )
          )
            return;
          start(async () => {
            const r = await createReceptionistToken({ workspaceId: ws.id });
            if (!r.ok) {
              toast.error(r.error);
              return;
            }
            setToken(r.data.token);
            router.refresh();
          });
        }}
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <KeyRound aria-hidden />}
        {hasToken ? "Make new links" : "Create connection links"}
      </Button>
    </section>
  );
}

export type SettingsInitial = {
  enabled: boolean;
  ringSeconds: number;
  timeZone: string;
  hours: Hours;
  greetingEn: string;
  greetingEs: string;
};

export function SettingsForm({ initial }: { initial: SettingsInitial }) {
  const ws = useWorkspace();
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, start] = useTransition();
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const readOnly = !ws.isAdmin;
  const setDay = (day: Day, idx: 0 | 1, value: string) =>
    setV((s) => {
      const cur = s.hours[day]?.[0] ?? ["09:00", "18:00"];
      const next: [string, string] = idx === 0 ? [value, cur[1]] : [cur[0], value];
      return { ...s, hours: { ...s.hours, [day]: [next] } };
    });
  const toggleDay = (day: Day, open: boolean) =>
    setV((s) => {
      const hours = { ...s.hours };
      if (open) hours[day] = [["09:00", "18:00"]];
      else delete hours[day];
      return { ...s, hours };
    });

  return (
    <form
      noValidate
      className="space-y-4 rounded-xl border bg-card p-4"
      data-testid="receptionist-settings"
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        start(async () => {
          const r = await saveReceptionistSettings({
            workspaceId: ws.id,
            values: {
              enabled: v.enabled,
              ring_seconds: v.ringSeconds,
              time_zone: v.timeZone,
              hours: v.hours,
              greeting_en: v.greetingEn,
              greeting_es: v.greetingEs,
            },
          });
          if (!r.ok) {
            setErrors(r.fieldErrors ?? {});
            toast.error(r.error);
            return;
          }
          toast.success("Receptionist settings saved");
          router.refresh();
        });
      }}
    >
      <h2 className="font-sans text-base font-bold">How calls are answered</h2>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          className="size-4 accent-black"
          checked={v.enabled}
          disabled={readOnly}
          onChange={(e) => setV((s) => ({ ...s, enabled: e.target.checked }))}
          data-testid="receptionist-enabled"
        />
        AI receptionist on (when off, calls ring the default route, then go to voicemail)
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          id="rc-ring"
          label="Ring the default route for (seconds)"
          error={errors.ring_seconds?.[0]}
          help="About 5 seconds per ring — 15 ≈ 3 rings."
        >
          <Input
            id="rc-ring"
            type="number"
            min={5}
            max={60}
            value={v.ringSeconds}
            disabled={readOnly}
            onChange={(e) => setV((s) => ({ ...s, ringSeconds: Number(e.target.value) }))}
          />
        </Field>
        <Field id="rc-tz" label="Time zone">
          <NativeSelect
            id="rc-tz"
            value={v.timeZone}
            disabled={readOnly}
            onChange={(e) => setV((s) => ({ ...s, timeZone: e.target.value }))}
          >
            {TIME_ZONES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <fieldset className="rounded-md border p-3">
        <legend className="px-1 text-sm font-bold">Business hours</legend>
        <p className="mb-2 text-xs text-muted-foreground">
          During hours a person is rung first; after hours the AI answers right away. No days ticked
          = always ring first.
        </p>
        <div className="space-y-2" data-testid="receptionist-hours">
          {DAYS.map(({ key, label }) => {
            const range = v.hours[key]?.[0];
            return (
              <div key={key} className="flex flex-wrap items-center gap-2 text-sm">
                <label className="flex w-20 items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-4 accent-black"
                    checked={Boolean(range)}
                    disabled={readOnly}
                    onChange={(e) => toggleDay(key, e.target.checked)}
                  />
                  {label}
                </label>
                {range ? (
                  <>
                    <Input
                      type="time"
                      aria-label={`${label} opens`}
                      className="w-32"
                      value={range[0]}
                      disabled={readOnly}
                      onChange={(e) => setDay(key, 0, e.target.value)}
                    />
                    <span>to</span>
                    <Input
                      type="time"
                      aria-label={`${label} closes`}
                      className="w-32"
                      value={range[1]}
                      disabled={readOnly}
                      onChange={(e) => setDay(key, 1, e.target.value)}
                    />
                  </>
                ) : (
                  <span className="text-muted-foreground">Closed</span>
                )}
              </div>
            );
          })}
        </div>
        {errors.hours?.[0] && (
          <p className="mt-2 text-xs font-medium text-brand-danger">{errors.hours[0]}</p>
        )}
      </fieldset>
      <Field
        id="rc-greet-en"
        label="Voicemail greeting (English)"
        help="California needs every party's consent to record: keep a line like “This call may be recorded.”"
      >
        <Textarea
          id="rc-greet-en"
          rows={3}
          value={v.greetingEn}
          placeholder={DEFAULT_GREETING_EN}
          maxLength={1000}
          disabled={readOnly}
          onChange={(e) => setV((s) => ({ ...s, greetingEn: e.target.value }))}
        />
      </Field>
      <Field id="rc-greet-es" label="Voicemail greeting (Spanish)">
        <Textarea
          id="rc-greet-es"
          rows={3}
          value={v.greetingEs}
          placeholder={DEFAULT_GREETING_ES}
          maxLength={1000}
          disabled={readOnly}
          onChange={(e) => setV((s) => ({ ...s, greetingEs: e.target.value }))}
        />
      </Field>
      {!readOnly && (
        <div className="flex justify-end">
          <Button type="submit" disabled={!hydrated || pending} data-testid="receptionist-save">
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} Save
          </Button>
        </div>
      )}
    </form>
  );
}

export type RouteInitial = {
  id: string | null;
  name: string;
  description: string;
  forward_to: string;
  keywords: string;
  languages: ("en" | "es")[];
  assignee_user_id: string;
  is_default: boolean;
  active: boolean;
  position: number;
};

export function RouteForm({ initial, onDone }: { initial: RouteInitial; onDone?: () => void }) {
  const ws = useWorkspace();
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, start] = useTransition();
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const err = (k: string) => errors[k]?.[0];
  const prefix = initial.id ?? "new";
  return (
    <form
      noValidate
      className="space-y-3 rounded-xl border bg-card p-4"
      data-testid={initial.id ? "route-form" : "new-route-form"}
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        start(async () => {
          const r = await saveRoute({
            workspaceId: ws.id,
            id: initial.id,
            values: {
              ...v,
              keywords: v.keywords
                .split(",")
                .map((k) => k.trim())
                .filter(Boolean),
              assignee_user_id: v.assignee_user_id || null,
            },
          });
          if (!r.ok) {
            setErrors(r.fieldErrors ?? {});
            if (!r.fieldErrors) toast.error(r.error);
            return;
          }
          toast.success("Route saved");
          if (!initial.id) setV({ ...initial });
          onDone?.();
          router.refresh();
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`rt-name-${prefix}`} label="Route name" error={err("name")}>
          <Input
            id={`rt-name-${prefix}`}
            value={v.name}
            maxLength={80}
            onChange={(e) => setV((s) => ({ ...s, name: e.target.value }))}
            placeholder="e.g. Property management"
          />
        </Field>
        <Field
          id={`rt-phone-${prefix}`}
          label="Ring this number"
          error={err("forward_to")}
          help="Leave empty to have the AI take a message."
        >
          <Input
            id={`rt-phone-${prefix}`}
            type="tel"
            value={v.forward_to}
            onChange={(e) => setV((s) => ({ ...s, forward_to: e.target.value }))}
          />
        </Field>
        <Field
          id={`rt-kw-${prefix}`}
          label="Keywords (comma-separated)"
          className="sm:col-span-2"
          help="Words callers use for this route, in English and Spanish, e.g. repair, tenant, leak, reparación."
        >
          <Input
            id={`rt-kw-${prefix}`}
            value={v.keywords}
            onChange={(e) => setV((s) => ({ ...s, keywords: e.target.value }))}
          />
        </Field>
        <Field id={`rt-who-${prefix}`} label="Follow-up task goes to">
          <NativeSelect
            id={`rt-who-${prefix}`}
            value={v.assignee_user_id}
            onChange={(e) => setV((s) => ({ ...s, assignee_user_id: e.target.value }))}
          >
            <option value="">Nobody (unassigned)</option>
            {ws.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Languages</legend>
          <div className="flex gap-3 text-sm">
            {(["en", "es"] as const).map((l) => (
              <label key={l} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  className="size-4 accent-black"
                  checked={v.languages.includes(l)}
                  onChange={(e) =>
                    setV((s) => ({
                      ...s,
                      languages: e.target.checked
                        ? [...s.languages, l]
                        : s.languages.filter((x) => x !== l),
                    }))
                  }
                />
                {l === "en" ? "English" : "Spanish"}
              </label>
            ))}
          </div>
          {err("languages") && (
            <p className="text-xs font-medium text-brand-danger">{err("languages")}</p>
          )}
        </fieldset>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              className="size-4 accent-black"
              checked={v.is_default}
              onChange={(e) => setV((s) => ({ ...s, is_default: e.target.checked }))}
            />
            Default route (rung first; gets calls nothing else matches)
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              className="size-4 accent-black"
              checked={v.active}
              onChange={(e) => setV((s) => ({ ...s, active: e.target.checked }))}
            />
            Active
          </label>
        </div>
        <div className="flex gap-2">
          {initial.id && <DeleteRouteButton id={initial.id} />}
          <Button
            type="submit"
            size="sm"
            disabled={!hydrated || pending || !v.name.trim()}
            data-testid="route-save"
          >
            {pending ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : initial.id ? (
              <Save aria-hidden />
            ) : (
              <Plus aria-hidden />
            )}
            {initial.id ? "Save" : "Add route"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function DeleteRouteButton({ id }: { id: string }) {
  const ws = useWorkspace();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="text-brand-danger"
      disabled={pending}
      aria-label="Delete route"
      onClick={() => {
        if (!confirm("Delete this route?")) return;
        start(async () => {
          const r = await deleteRoute({ workspaceId: ws.id, id });
          if (!r.ok) toast.error(r.error);
          else router.refresh();
        });
      }}
    >
      <Trash2 aria-hidden />
    </Button>
  );
}

/** Try the rules without a phone: what would happen for this caller, now? */
export function RoutingTester({
  routes,
  hours,
  timeZone,
}: {
  routes: Route[];
  hours: Hours;
  timeZone: string;
}) {
  const [text, setText] = useState("");
  const [now] = useState(() => new Date());
  const result = useMemo(() => {
    if (!text.trim()) return null;
    const language = detectLanguage(text);
    return { language, route: chooseRoute(routes, text, language) };
  }, [text, routes]);
  const open = isOpen(hours, timeZone, now);
  return (
    <section
      className="space-y-3 rounded-xl border bg-card p-4"
      aria-labelledby="test-h"
      data-testid="routing-tester"
    >
      <h2 id="test-h" className="flex items-center gap-2 font-sans text-base font-bold">
        <Wand2 className="size-4" aria-hidden /> Test routing
      </h2>
      <p className="text-sm" data-testid="open-now">
        Right now it&apos;s <strong>{open ? "business hours" : "after hours"}</strong>:{" "}
        {open
          ? "the default route is rung first, then the AI answers."
          : "the AI answers right away."}
      </p>
      <Field id="rt-test" label="What the caller says">
        <Textarea
          id="rt-test"
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Hi, I'm a tenant at 3100 Sample Ave and my sink is leaking"
        />
      </Field>
      {result && (
        <p className="text-sm" data-testid="routing-result">
          Language: <strong>{result.language === "es" ? "Spanish" : "English"}</strong> · Route:{" "}
          <strong>{result.route?.name ?? "none set up"}</strong>
        </p>
      )}
    </section>
  );
}
