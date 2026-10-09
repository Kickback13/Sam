import { Ban, MailX, MessageSquareOff, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { SMS_CONSENT_LABELS } from "@/lib/constants";

type Props = {
  dnc: boolean;
  smsConsent: "none" | "express" | "written";
  emailOptOut: boolean;
  compact?: boolean;
};

/** Compliance state that Phase 4 outreach gates will enforce. */
export function ComplianceBadges({ dnc, smsConsent, emailOptOut, compact }: Props) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {dnc && (
        <Badge variant="danger" title="Do not contact">
          <Ban aria-hidden /> DNC
        </Badge>
      )}
      {smsConsent === "none" ? (
        !compact && (
          <Badge variant="secondary" title="No SMS consent on file — texting is blocked">
            <MessageSquareOff aria-hidden /> No SMS consent
          </Badge>
        )
      ) : (
        <Badge variant="success" title={SMS_CONSENT_LABELS[smsConsent]}>
          <ShieldCheck aria-hidden /> SMS: {smsConsent}
        </Badge>
      )}
      {emailOptOut && (
        <Badge variant="warning" title="Unsubscribed from email">
          <MailX aria-hidden /> Email opt-out
        </Badge>
      )}
    </div>
  );
}
