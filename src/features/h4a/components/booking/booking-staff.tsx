"use client";

import {
  Ban,
  CalendarX,
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  Mail,
  Phone,
  Save,
  UserX,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Field } from "@/components/common/field";
import { useWorkspace } from "@/components/shell/workspace-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { formatPhone } from "@/lib/normalize";
import { useHydrated } from "@/lib/use-hydrated";
import type { FieldErrors } from "@/lib/validation/common";

import {
  BOOKING_STATUSES,
  DAYS,
  formatSlotDay,
  formatSlotTime,
  localDayKey,
  MEETING_LENGTHS,
  zonedToIso,
  type Hours,
} from "../../booking/booking";
import {
  blockTime,
  rotateCalendarFeed,
  saveBookingSettings,
  setBookingStatus,
} from "../../server/booking";
import type { BookingItem } from "../../server/booking-queries";

type Day = (typeof DAYS)[number]["key"];

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
    toast.error("Couldn't copy. Select the text and copy it yourself.");
  }
}

// ---------------------------------------------------------------------------
// Upcoming bookings
// ---------------------------------------------------------------------------
export function BookingList({
  items,
  timeZone,
  emptyText,
}: {
  items: BookingItem[];
  timeZone: string;
  emptyText: string;
}) {
  if (!items.length) return <p className="py-3 text-sm text-muted-foreground">{emptyText}</p>;
  const days = new Map<string, BookingItem[]>();
  for (const b of items) {
    const k = localDayKey(b.startsAt, timeZone);
    days.set(k, [...(days.get(k) ?? []), b]);
  }
  return (
    <div className="space-y-5" data-testid="booking-list">
      {[...days.entries()].map(([key, list]) => (
        <section key={key}>
          <h3 className="mb-2 text-sm font-bold">{formatSlotDay(list[0].startsAt, timeZone)}</h3>
          <ul className="divide-y rounded-lg border bg-card">
            {list.map((b) => (
              <BookingRow key={b.id} b={b} timeZone={timeZone} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function BookingRow({ b, timeZone }: { b: BookingItem; timeZone: string }) {
  const ws = useWorkspace();
  const router = useRouter();
  const [pending, start] = useTransition();
  const status = BOOKING_STATUSES.find((s) => s.value === b.status)?.label ?? b.status;
  const set = (next: "completed" | "no_show" | "canceled", msg: string) =>
    start(async () => {
      const r = await setBookingStatus({ workspaceId: ws.id, bookingId: b.id, status: next });
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(msg);
        router.refresh();
      }
    });
  const time = `${formatSlotTime(b.startsAt, timeZone)} – ${formatSlotTime(b.endsAt, timeZone)}`;
  const canceled = b.status === "canceled";

  return (
    <li
      className="flex flex-wrap items-start justify-between gap-3 p-3"
      data-testid="booking-row"
      data-kind={b.kind}
      data-status={b.status}
    >
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold tabular">{time}</span>
          {b.kind === "block" ? (
            <Badge variant="secondary">Blocked</Badge>
          ) : (
            <Badge variant={canceled ? "secondary" : b.status === "booked" ? "info" : "success"}>
              {status}
            </Badge>
          )}
        </p>
        {b.kind === "block" ? (
          <p className={canceled ? "text-sm line-through" : "text-sm"}>{b.title ?? "Busy"}</p>
        ) : (
          <>
            <p className={canceled ? "font-semibold line-through" : "font-semibold"}>
              {b.contactId ? (
                <Link href={`/w/${ws.slug}/people/${b.contactId}`} className="hover:underline">
                  {b.name}
                </Link>
              ) : (
                b.name
              )}
            </p>
            <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
              {b.phone && (
                <a
                  href={`tel:${b.phone}`}
                  className="inline-flex items-center gap-1 hover:underline"
                >
                  <Phone className="size-3" aria-hidden /> {formatPhone(b.phone)}
                </a>
              )}
              {b.email && (
                <span className="inline-flex items-center gap-1 break-all">
                  <Mail className="size-3" aria-hidden /> {b.email}
                </span>
              )}
              {b.source === "booking_page" && <span>Booked online</span>}
            </p>
            {b.note && <p className="mt-1 text-sm whitespace-pre-wrap">{b.note}</p>}
          </>
        )}
      </div>
      {ws.canWrite && !canceled && (
        <div className="flex flex-wrap gap-1">
          {b.kind === "meeting" && b.status === "booked" && (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => set("completed", "Marked completed")}
              >
                <Check aria-hidden /> Done
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => set("no_show", "Marked no-show")}
              >
                <UserX aria-hidden /> No-show
              </Button>
            </>
          )}
          {(b.kind === "block" || b.status === "booked") && (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                set("canceled", b.kind === "block" ? "Time freed up" : "Booking canceled")
              }
              data-testid="cancel-booking"
            >
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Ban aria-hidden />}
              {b.kind === "block" ? "Unblock" : "Cancel"}
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Block time
// ---------------------------------------------------------------------------
export function BlockTimeForm({ timeZone, today }: { timeZone: string; today: string }) {
  const ws = useWorkspace();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState({ date: today, from: "12:00", to: "13:00", title: "" });
  if (!ws.canWrite) return null;
  return (
    <form
      className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[1fr_auto_auto_1.5fr_auto] sm:items-end"
      data-testid="block-time"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await blockTime({
            workspaceId: ws.id,
            startsAt: zonedToIso(v.date, v.from, timeZone),
            endsAt: zonedToIso(v.date, v.to, timeZone),
            title: v.title,
          });
          if (!r.ok) {
            toast.error(r.error);
            return;
          }
          toast.success("Time blocked");
          setV((s) => ({ ...s, title: "" }));
          router.refresh();
        });
      }}
    >
      <Field id="blk-date" label="Block a day">
        <Input
          id="blk-date"
          type="date"
          value={v.date}
          min={today}
          onChange={(e) => setV((s) => ({ ...s, date: e.target.value }))}
        />
      </Field>
      <Field id="blk-from" label="From">
        <Input
          id="blk-from"
          type="time"
          value={v.from}
          onChange={(e) => setV((s) => ({ ...s, from: e.target.value }))}
        />
      </Field>
      <Field id="blk-to" label="To">
        <Input
          id="blk-to"
          type="time"
          value={v.to}
          onChange={(e) => setV((s) => ({ ...s, to: e.target.value }))}
        />
      </Field>
      <Field id="blk-title" label="Why (only your team sees this)">
        <Input
          id="blk-title"
          value={v.title}
          maxLength={200}
          placeholder="e.g. Property tour"
          onChange={(e) => setV((s) => ({ ...s, title: e.target.value }))}
        />
      </Field>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <CalendarX aria-hidden />}
        Block time
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Page link + private calendar feed
// ---------------------------------------------------------------------------
export function BookingLinks({
  publicUrl,
  enabled,
  feedBase,
  hasFeed,
}: {
  publicUrl: string;
  enabled: boolean;
  feedBase: string;
  hasFeed: boolean;
}) {
  const ws = useWorkspace();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedUrl, setFeedUrl] = useState<string | null>(null);
  return (
    <section className="space-y-4 rounded-xl border bg-card p-4" data-testid="booking-links">
      <div className="space-y-1.5">
        <h2 className="text-base font-bold">Your booking link</h2>
        <p className="text-xs text-muted-foreground">
          Share it in emails, your website or your GHL messages. Leads pick an open time; each
          booking creates or updates their contact, logs a meeting and gives the host a task.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <code
            className="min-w-0 rounded bg-muted px-2 py-1 text-xs break-all"
            data-testid="booking-url"
          >
            {publicUrl}
          </code>
          <Button size="sm" variant="outline" onClick={() => copy(publicUrl, "Booking link")}>
            <Copy aria-hidden /> Copy
          </Button>
          {enabled && (
            <Button asChild size="sm" variant="ghost">
              <a href={publicUrl} target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden /> Open
              </a>
            </Button>
          )}
        </div>
        {!enabled && (
          <p className="text-xs font-semibold text-muted-foreground" data-testid="booking-off">
            The page is off: the link shows “not found” until an owner or admin switches it on
            below.
          </p>
        )}
      </div>
      {ws.isAdmin && (
        <div className="space-y-1.5 border-t pt-4">
          <h2 className="text-base font-bold">See bookings in Google or Apple Calendar</h2>
          <p className="text-xs text-muted-foreground">
            A private, read-only feed: in Google Calendar choose <em>Other calendars → From URL</em>{" "}
            and paste it. No Google account is connected and nothing is written to your calendar.
            Google refreshes subscribed calendars every few hours. Anyone with the link can see the
            bookings, so keep it private; making a new link turns the old one off.
          </p>
          {feedUrl ? (
            <div className="flex flex-wrap items-center gap-2">
              <code
                className="min-w-0 rounded bg-muted px-2 py-1 text-xs break-all"
                data-testid="feed-url"
              >
                {feedUrl}
              </code>
              <Button size="sm" variant="outline" onClick={() => copy(feedUrl, "Calendar link")}>
                <Copy aria-hidden /> Copy
              </Button>
              <p className="w-full text-xs font-semibold">
                Copy it now. It won&apos;t be shown again.
              </p>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              data-testid="make-feed"
              onClick={() =>
                start(async () => {
                  const r = await rotateCalendarFeed({ workspaceId: ws.id });
                  if (!r.ok) {
                    toast.error(r.error);
                    return;
                  }
                  setFeedUrl(`${feedBase}/${r.data.token}.ics`);
                  router.refresh();
                })
              }
            >
              {pending ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <KeyRound aria-hidden />
              )}
              {hasFeed ? "Make a new calendar link" : "Create calendar link"}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Settings (owner/admin)
// ---------------------------------------------------------------------------
export type BookingSettingsInitial = {
  enabled: boolean;
  hostUserId: string | null;
  title: string;
  intro: string;
  location: string;
  meetingMinutes: number;
  bufferMinutes: number;
  minNoticeHours: number;
  maxDaysAhead: number;
  timeZone: string;
  hours: Hours;
};

export function BookingSettingsForm({
  initial,
  members,
}: {
  initial: BookingSettingsInitial;
  members: { userId: string; name: string }[];
}) {
  const ws = useWorkspace();
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, start] = useTransition();
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const readOnly = !ws.isAdmin;
  const setDay = (day: Day, idx: 0 | 1, value: string) =>
    setV((s) => {
      const cur = s.hours[day]?.[0] ?? ["09:00", "17:00"];
      const next: [string, string] = idx === 0 ? [value, cur[1]] : [cur[0], value];
      return { ...s, hours: { ...s.hours, [day]: [next] } };
    });
  const toggleDay = (day: Day, open: boolean) =>
    setV((s) => {
      const hours = { ...s.hours };
      if (open) hours[day] = [["09:00", "17:00"]];
      else delete hours[day];
      return { ...s, hours };
    });
  const num = (k: keyof BookingSettingsInitial) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setV((s) => ({ ...s, [k]: Number(e.target.value) }));

  return (
    <form
      noValidate
      className="space-y-4 rounded-xl border bg-card p-4"
      data-testid="booking-settings"
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        start(async () => {
          const r = await saveBookingSettings({
            workspaceId: ws.id,
            ...v,
            timeZone: v.timeZone as (typeof TIME_ZONES)[number][0],
          });
          if (!r.ok) {
            setErrors(r.fieldErrors ?? {});
            toast.error(r.error);
            return;
          }
          toast.success("Booking page saved");
          router.refresh();
        });
      }}
    >
      <h2 className="text-base font-bold">Booking page settings</h2>
      {readOnly && (
        <p className="text-xs text-muted-foreground">Only an owner or admin can change these.</p>
      )}
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          className="size-4 accent-black"
          checked={v.enabled}
          disabled={readOnly}
          onChange={(e) => setV((s) => ({ ...s, enabled: e.target.checked }))}
          data-testid="booking-enabled"
        />
        Booking page on (leads can book open times)
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="bk-title" label="Title" error={errors.title?.[0]}>
          <Input
            id="bk-title"
            value={v.title}
            maxLength={120}
            disabled={readOnly}
            onChange={(e) => setV((s) => ({ ...s, title: e.target.value }))}
          />
        </Field>
        <Field id="bk-host" label="Who leads book with" help="Gets a task for each booking.">
          <NativeSelect
            id="bk-host"
            value={v.hostUserId ?? ""}
            disabled={readOnly}
            onChange={(e) => setV((s) => ({ ...s, hostUserId: e.target.value || null }))}
          >
            <option value="">Nobody chosen</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field
          id="bk-location"
          label="Where"
          error={errors.location?.[0]}
          help="e.g. Phone call, or the office address."
        >
          <Input
            id="bk-location"
            value={v.location}
            maxLength={200}
            disabled={readOnly}
            onChange={(e) => setV((s) => ({ ...s, location: e.target.value }))}
          />
        </Field>
        <Field id="bk-length" label="Meeting length">
          <NativeSelect
            id="bk-length"
            value={v.meetingMinutes}
            disabled={readOnly}
            onChange={(e) => setV((s) => ({ ...s, meetingMinutes: Number(e.target.value) }))}
          >
            {MEETING_LENGTHS.map((m) => (
              <option key={m} value={m}>
                {m} minutes
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="bk-buffer" label="Gap between calls (minutes)">
          <Input
            id="bk-buffer"
            type="number"
            min={0}
            max={60}
            value={v.bufferMinutes}
            disabled={readOnly}
            onChange={num("bufferMinutes")}
          />
        </Field>
        <Field id="bk-notice" label="Minimum notice (hours)" help="No bookings sooner than this.">
          <Input
            id="bk-notice"
            type="number"
            min={0}
            max={336}
            value={v.minNoticeHours}
            disabled={readOnly}
            onChange={num("minNoticeHours")}
          />
        </Field>
        <Field id="bk-ahead" label="How far ahead (days)">
          <Input
            id="bk-ahead"
            type="number"
            min={1}
            max={90}
            value={v.maxDaysAhead}
            disabled={readOnly}
            onChange={num("maxDaysAhead")}
          />
        </Field>
        <Field id="bk-tz" label="Time zone">
          <NativeSelect
            id="bk-tz"
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
      <Field id="bk-intro" label="Intro (optional)" help="Shown above the times.">
        <Textarea
          id="bk-intro"
          rows={3}
          value={v.intro}
          maxLength={1000}
          disabled={readOnly}
          onChange={(e) => setV((s) => ({ ...s, intro: e.target.value }))}
        />
      </Field>
      <fieldset className="rounded-md border p-3">
        <legend className="px-1 text-sm font-bold">Bookable hours</legend>
        <div className="space-y-2" data-testid="booking-hours">
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
                    aria-label={`${label} bookable`}
                  />
                  {label}
                </label>
                {range ? (
                  <>
                    <Input
                      type="time"
                      aria-label={`${label} from`}
                      className="w-32"
                      value={range[0]}
                      disabled={readOnly}
                      onChange={(e) => setDay(key, 0, e.target.value)}
                    />
                    <span>to</span>
                    <Input
                      type="time"
                      aria-label={`${label} until`}
                      className="w-32"
                      value={range[1]}
                      disabled={readOnly}
                      onChange={(e) => setDay(key, 1, e.target.value)}
                    />
                  </>
                ) : (
                  <span className="text-muted-foreground">Not bookable</span>
                )}
              </div>
            );
          })}
        </div>
      </fieldset>
      {!readOnly && (
        <Button type="submit" disabled={!hydrated || pending} data-testid="booking-save">
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} Save
        </Button>
      )}
    </form>
  );
}
