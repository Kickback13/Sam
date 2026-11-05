"use client";

import { ArrowLeft, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { FieldErrors } from "@/lib/validation/common";

import { formatSlotLong, type SlotDay } from "../../booking/booking";
import { bookPublicSlot } from "../../server/booking";

/** Pick a day, a time, then leave a name and a way to reach you. */
export function BookingPicker({
  slug,
  days,
  timeZone,
}: {
  slug: string;
  days: SlotDay[];
  timeZone: string;
}) {
  const router = useRouter();
  const [dayKey, setDayKey] = useState(days[0]?.key ?? "");
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [pending, start] = useTransition();
  const day = days.find((d) => d.key === dayKey) ?? days[0];

  if (!days.length)
    return (
      <p className="rounded-md bg-muted px-3 py-3 text-sm" data-testid="no-slots">
        No open times right now. Please check back soon or call us.
      </p>
    );

  if (startsAt)
    return (
      <form
        className="space-y-4"
        data-testid="booking-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setError(null);
          start(async () => {
            const r = await bookPublicSlot({
              slug,
              startsAt,
              name: String(f.get("name") ?? ""),
              email: String(f.get("email") ?? ""),
              phone: String(f.get("phone") ?? ""),
              note: String(f.get("note") ?? ""),
              website: String(f.get("website") ?? ""),
            });
            if (!r.ok) {
              setError(r.error);
              setFieldErrors(r.fieldErrors ?? {});
              if (/just taken/.test(r.error)) {
                setStartsAt(null);
                router.refresh();
              }
              return;
            }
            const q = new URLSearchParams({ start: r.data.startsAt, end: r.data.endsAt });
            router.push(`/b/${slug}/booked?${q}`);
          });
        }}
      >
        <button
          type="button"
          onClick={() => setStartsAt(null)}
          className="inline-flex items-center gap-1 text-sm font-semibold text-brand-accent-text hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden /> Pick another time
        </button>
        <p className="rounded-md bg-muted px-3 py-2 font-semibold" data-testid="chosen-slot">
          {formatSlotLong(startsAt, timeZone)}
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="b-name">Your name</Label>
          <Input id="b-name" name="name" autoComplete="name" required maxLength={120} />
          {fieldErrors.name && <FieldError msg={fieldErrors.name[0]} />}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="b-email">Email</Label>
            <Input id="b-email" name="email" type="email" autoComplete="email" maxLength={200} />
            {fieldErrors.email && <FieldError msg={fieldErrors.email[0]} />}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-phone">Phone</Label>
            <Input id="b-phone" name="phone" type="tel" autoComplete="tel" maxLength={40} />
            {fieldErrors.phone && <FieldError msg={fieldErrors.phone[0]} />}
          </div>
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">
          Email or phone — at least one, so we can reach you.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="b-note">What would you like to talk about? (optional)</Label>
          <Textarea id="b-note" name="note" rows={3} maxLength={2000} />
        </div>
        {/* Honeypot: hidden from people, bots fill it. */}
        <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label htmlFor="b-website">Website</label>
          <input id="b-website" name="website" tabIndex={-1} autoComplete="off" />
        </div>
        {error && (
          <p role="alert" className="text-sm font-medium text-brand-danger">
            {error}
          </p>
        )}
        <Button type="submit" disabled={pending} data-testid="confirm-booking" className="w-full">
          {pending && <Loader2 className="animate-spin" aria-hidden />} Book this time
        </Button>
      </form>
    );

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="text-sm font-medium text-brand-danger">
          {error}
        </p>
      )}
      <div>
        <h2 className="mb-2 text-sm font-bold">Pick a day</h2>
        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Day">
          {days.map((d) => (
            <button
              key={d.key}
              type="button"
              aria-pressed={d.key === day.key}
              onClick={() => setDayKey(d.key)}
              data-testid="slot-day"
              className={cn(
                "shrink-0 rounded-md border px-3 py-2 text-sm font-semibold whitespace-nowrap",
                d.key === day.key
                  ? "border-foreground bg-foreground text-background"
                  : "bg-background hover:bg-muted",
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <h2 className="mb-2 text-sm font-bold">Pick a time</h2>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" data-testid="slot-times">
          {day.slots.map((s) => (
            <Button
              key={s.startsAt}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setStartsAt(s.startsAt)}
              data-testid="slot-time"
              data-starts-at={s.startsAt}
            >
              {s.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

function FieldError({ msg }: { msg?: string }) {
  return msg ? <p className="text-xs font-medium text-brand-danger">{msg}</p> : null;
}
