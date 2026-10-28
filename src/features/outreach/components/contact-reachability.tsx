import { Check, X } from "lucide-react";

import { formatDateTime } from "@/lib/format";
import { formatPhone } from "@/lib/normalize";

import { checkEmail, checkSms, type GateResult, type SmsConsent } from "../compliance";
import {
  gateSettings,
  getOutreachSettings,
  suppressionsForContact,
  toGateContact,
} from "../server/queries";
import { RecordStopButton } from "./record-stop-button";

/**
 * "Can we reach them right now?" on the contact page — the same gates every
 * send runs, evaluated live. Hooked into people/[id] with one line.
 */
export async function ContactReachability({
  workspaceId,
  contactId,
  contact,
}: {
  workspaceId: string;
  contactId: string;
  contact: {
    dnc: boolean;
    sms_consent: SmsConsent;
    sms_consent_at: string | null;
    email_opt_out: boolean;
    emails: unknown;
    phones: unknown;
  };
}) {
  const gc = toGateContact(contact);
  const [settings, suppressions] = await Promise.all([
    getOutreachSettings(workspaceId),
    suppressionsForContact(workspaceId, gc),
  ]);
  const gs = gateSettings(settings);
  const now = new Date();
  const email = checkEmail(gc, gs, suppressions);
  const sms = checkSms(gc, gs, suppressions, "marketing", now);
  const smsInfo = checkSms(gc, gs, suppressions, "informational", now);
  const stoppable = gc.phones.map((p) => p.value).filter((v, i, all) => all.indexOf(v) === i);

  return (
    <div className="space-y-2 border-t pt-3" data-testid="reachability">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Can we reach them right now?
      </p>
      <Gate label="Newsletter email" r={email} />
      <Gate label="Marketing text" r={sms} />
      <Gate label="Informational text" r={smsInfo} />
      <p className="text-xs text-muted-foreground">
        Checked {formatDateTime(now)} against DNC, consent, opt-outs, the do-not-send list and
        texting hours. Texting isn&apos;t connected yet; nothing sends from here.
      </p>
      {stoppable.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {stoppable.map((p) => (
            <RecordStopButton key={p} contactId={contactId} phone={p} label={formatPhone(p)} />
          ))}
        </div>
      )}
    </div>
  );
}

function Gate({ label, r }: { label: string; r: GateResult }) {
  return (
    <div
      className="flex items-start gap-2 text-sm"
      data-testid={`gate-${label.toLowerCase().replace(/\s+/g, "-")}`}
      data-allowed={r.allowed}
    >
      {r.allowed ? (
        <Check className="mt-0.5 size-4 shrink-0 text-emerald-700" aria-hidden />
      ) : (
        <X className="mt-0.5 size-4 shrink-0 text-red-700" aria-hidden />
      )}
      <div className="min-w-0">
        <span className="font-medium">{label}:</span>{" "}
        {r.allowed ? (
          <span>OK{r.to ? ` → ${r.channel === "sms" ? formatPhone(r.to) : r.to}` : ""}</span>
        ) : (
          <span>{r.blocks.map((b) => b.message).join(" · ")}</span>
        )}
        {r.warnings.map((w) => (
          <span key={w} className="block text-xs text-amber-900">
            {w}
          </span>
        ))}
        {!r.allowed &&
          r.nextAllowedAt &&
          r.blocks.length === 1 &&
          r.blocks[0].code === "quiet_hours" && (
            <span className="block text-xs text-muted-foreground">
              Opens again {formatDateTime(r.nextAllowedAt)}
            </span>
          )}
      </div>
    </div>
  );
}
