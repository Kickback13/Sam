"use server";

import { z } from "zod";

import type { ActionResult } from "@/lib/validation/common";
import { actionContext, NOT_SIGNED_IN, revalidateWorkspace } from "@/server/action-context";
import { writeAudit } from "@/server/audit";
import { friendlyDbError } from "@/server/errors";

import { alertEmailConfig } from "../../alerts/email";
import { htmlToText, sanitizeEmailHtml } from "../../email/html";
import { processEmail } from "../../pipeline/pipeline";
import { siteUrl } from "../config";
import { sessionStore, StoreError } from "../stores";

const pasteSchema = z.object({
  workspaceId: z.uuid(),
  workspaceSlug: z.string().max(60),
  from: z.string().trim().max(500).optional(),
  subject: z.string().trim().max(998).optional(),
  body: z.string().max(1_000_000),
  format: z.enum(["auto", "text", "html"]).default("auto"),
});

export type PasteOutcome = {
  emailId: string;
  parserLabel: string;
  formatStatus: string;
  confidence: string | null;
  kind: string;
  notes: string[];
  confirmationCode: string | null;
  listings: { id: string | null; action: string; error?: string }[];
};

const looksLikeHtml = (s: string) => /<\/?(html|body|div|table|tr|td|p|br|span|a)\b[^>]*>/i.test(s);

/**
 * "Paste an email" (owners/admins): runs the exact parser pipeline used for
 * forwarded emails, so formats can be tested with no email setup at all.
 */
export async function pasteEmail(
  input: z.input<typeof pasteSchema>,
): Promise<ActionResult<PasteOutcome>> {
  const parsed = pasteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const { workspaceId, workspaceSlug, from, subject, body, format } = parsed.data;
  if (!body.trim())
    return { ok: false, error: "Paste the email first.", fieldErrors: { body: ["Required"] } };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;

  const isHtml = format === "html" || (format === "auto" && looksLikeHtml(body));
  const text = isHtml ? htmlToText(body) : body;
  if (!text.trim()) return { ok: false, error: "That email has no readable text." };

  const { data: emailId, error } = await ctx.supabase.rpc("h4a_create_email", {
    p_workspace_id: workspaceId,
    p_email: {
      from: from || null,
      subject: subject || null,
      text_body: text.slice(0, 500_000),
      html_body: isHtml ? sanitizeEmailHtml(body) : null,
    },
  });
  if (error)
    return {
      ok: false,
      error:
        error.code === "42501"
          ? "Only owners and admins can paste emails."
          : friendlyDbError(error),
    };

  try {
    const site = siteUrl();
    const out = await processEmail(
      sessionStore(ctx.supabase, workspaceId, emailId as string),
      {
        from: from || null,
        subject: subject || null,
        text: isHtml ? null : body,
        html: isHtml ? body : null,
        receivedAt: new Date().toISOString(),
      },
      "paste",
      alertEmailConfig(),
      site ? `${site}/w/${workspaceSlug}` : null,
    );
    await writeAudit(ctx.supabase, {
      workspaceId,
      actorId: ctx.user.id,
      action: "inbound_email.paste",
      entityType: "inbound_email",
      entityId: emailId as string,
      diff: { parser: out.parse.parserKey, listings: out.pipeline.results.length },
    });
    revalidateWorkspace();
    return {
      ok: true,
      data: {
        emailId: emailId as string,
        parserLabel: out.parse.parserLabel,
        formatStatus: out.parse.formatStatus,
        confidence: out.parse.confidence,
        kind: out.parse.kind,
        notes: out.parse.notes,
        confirmationCode: out.parse.confirmationCode ?? null,
        listings: out.pipeline.results.map((r) =>
          r.action === "error"
            ? { id: null, action: "error", error: r.error }
            : { id: r.listing_id, action: r.action },
        ),
      },
    };
  } catch (e) {
    revalidateWorkspace();
    return {
      ok: false,
      error:
        e instanceof StoreError
          ? friendlyDbError({ code: e.code, message: e.message })
          : "Parsing failed. The email was saved; try again.",
    };
  }
}
