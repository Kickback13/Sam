"use server";

import { z } from "zod";

import { toJson } from "@/lib/db/json";
import { parseFieldSources } from "@/lib/field-sources";
import { zodFieldErrors, type ActionResult } from "@/lib/validation/common";
import { actionContext, NOT_SIGNED_IN, revalidateWorkspace } from "@/server/action-context";
import { writeAudit } from "@/server/audit";
import { friendlyDbError } from "@/server/errors";

import { buildFacts } from "../../ai/citations";
import { generateSummary, type AiSummaryResult } from "../../ai/summary";
import { redFlags } from "../../underwriting/flags";
import { underwrite } from "../../underwriting/math";
import { prefillInputs, stampInputSources, type InputSources } from "../../underwriting/prefill";
import {
  compInputSchema,
  parseStoredInputs,
  scenarioNameSchema,
  underwritingInputsSchema,
} from "../../underwriting/schema";
import { getAnalysisData } from "../analysis";

const permission = (code: string | undefined, fallback: string) =>
  code === "42501" ? "Viewers can't change the analysis." : fallback;

const saveEnvelope = z.object({
  workspaceId: z.uuid(),
  propertyId: z.uuid(),
  scenarioId: z.uuid().nullish(),
  name: z.unknown(),
  inputs: z.unknown(),
  notes: z.string().max(5000).nullish(),
});

/**
 * Save a scenario. Inputs whose value changed are stamped "Entered by {user}";
 * values still matching the property/listing keep that source.
 */
export async function saveScenario(
  input: z.input<typeof saveEnvelope>,
): Promise<ActionResult<{ id: string }>> {
  const env = saveEnvelope.safeParse(input);
  if (!env.success) return { ok: false, error: "Invalid request" };
  const name = scenarioNameSchema.safeParse(env.data.name);
  const inputs = underwritingInputsSchema.safeParse(env.data.inputs);
  if (!name.success || !inputs.success)
    return {
      ok: false,
      error: "Check the highlighted fields",
      fieldErrors: {
        ...(name.success ? {} : { name: name.error.issues.map((i) => i.message) }),
        ...(inputs.success ? {} : zodFieldErrors(inputs.error)),
      },
    };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { workspaceId, propertyId, scenarioId } = env.data;

  // Baseline for source stamping: the saved scenario, or the property/listing prefill.
  let baseline: { inputs: ReturnType<typeof parseStoredInputs>; sources: InputSources };
  if (scenarioId) {
    const { data, error } = await ctx.supabase
      .from("h4a_underwriting")
      .select("inputs, input_sources")
      .eq("workspace_id", workspaceId)
      .eq("id", scenarioId)
      .maybeSingle();
    if (error || !data) return { ok: false, error: "That scenario no longer exists." };
    baseline = {
      inputs: parseStoredInputs(data.inputs),
      sources: parseFieldSources(data.input_sources) as InputSources,
    };
  } else {
    const [{ data: p }, { data: l }] = await Promise.all([
      ctx.supabase
        .from("properties")
        .select("units, building_sqft, field_sources")
        .eq("workspace_id", workspaceId)
        .eq("id", propertyId)
        .maybeSingle(),
      ctx.supabase
        .from("h4a_listings")
        .select("price, units, building_sqft, field_sources")
        .eq("workspace_id", workspaceId)
        .eq("property_id", propertyId)
        .order("promoted_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (!p) return { ok: false, error: "That property isn't in this workspace." };
    baseline = prefillInputs(
      {
        units: p.units,
        building_sqft: p.building_sqft,
        field_sources: parseFieldSources(p.field_sources),
      },
      l ? { ...l, field_sources: parseFieldSources(l.field_sources) } : null,
    );
  }

  const sources = stampInputSources(baseline.sources, baseline.inputs, inputs.data, ctx.user);
  const row = {
    name: name.data,
    inputs: toJson(inputs.data),
    input_sources: toJson(sources),
    notes: env.data.notes?.trim() || null,
    updated_by: ctx.user.id,
  };

  const result = scenarioId
    ? await ctx.supabase
        .from("h4a_underwriting")
        .update(row)
        .eq("workspace_id", workspaceId)
        .eq("id", scenarioId)
        .select("id")
        .single()
    : await ctx.supabase
        .from("h4a_underwriting")
        .insert({ ...row, workspace_id: workspaceId, property_id: propertyId })
        .select("id")
        .single();
  if (result.error)
    return { ok: false, error: permission(result.error.code, friendlyDbError(result.error)) };

  await writeAudit(ctx.supabase, {
    workspaceId,
    actorId: ctx.user.id,
    action: scenarioId ? "underwriting.update" : "underwriting.create",
    entityType: "underwriting",
    entityId: result.data.id,
    diff: { property_id: propertyId, name: name.data },
  });
  revalidateWorkspace();
  return { ok: true, data: { id: result.data.id } };
}

const idEnvelope = z.object({ workspaceId: z.uuid(), id: z.uuid() });

export async function deleteScenario(input: z.input<typeof idEnvelope>): Promise<ActionResult> {
  const env = idEnvelope.safeParse(input);
  if (!env.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { data, error } = await ctx.supabase
    .from("h4a_underwriting")
    .delete()
    .eq("workspace_id", env.data.workspaceId)
    .eq("id", env.data.id)
    .select("id, property_id, name");
  if (error) return { ok: false, error: permission(error.code, friendlyDbError(error)) };
  if (!data?.length) return { ok: false, error: "You can't delete this scenario." };
  await writeAudit(ctx.supabase, {
    workspaceId: env.data.workspaceId,
    actorId: ctx.user.id,
    action: "underwriting.delete",
    entityType: "underwriting",
    entityId: env.data.id,
    diff: { property_id: data[0].property_id, name: data[0].name },
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}

const compEnvelope = z.object({ workspaceId: z.uuid(), propertyId: z.uuid(), comp: z.unknown() });

export async function addComp(
  input: z.input<typeof compEnvelope>,
): Promise<ActionResult<{ id: string }>> {
  const env = compEnvelope.safeParse(input);
  if (!env.success) return { ok: false, error: "Invalid request" };
  const parsed = compInputSchema.safeParse(env.data.comp);
  if (!parsed.success)
    return {
      ok: false,
      error: "Check the highlighted fields",
      fieldErrors: zodFieldErrors(parsed.error),
    };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { data, error } = await ctx.supabase
    .from("h4a_comps")
    .insert({
      ...parsed.data,
      workspace_id: env.data.workspaceId,
      property_id: env.data.propertyId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: permission(error.code, friendlyDbError(error)) };
  await writeAudit(ctx.supabase, {
    workspaceId: env.data.workspaceId,
    actorId: ctx.user.id,
    action: "comp.create",
    entityType: "comp",
    entityId: data.id,
    diff: {
      property_id: env.data.propertyId,
      kind: parsed.data.kind,
      address: parsed.data.address,
      source_label: parsed.data.source_label,
    },
  });
  revalidateWorkspace();
  return { ok: true, data: { id: data.id } };
}

export async function deleteComp(input: z.input<typeof idEnvelope>): Promise<ActionResult> {
  const env = idEnvelope.safeParse(input);
  if (!env.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const { data, error } = await ctx.supabase
    .from("h4a_comps")
    .delete()
    .eq("workspace_id", env.data.workspaceId)
    .eq("id", env.data.id)
    .select("id, property_id, address");
  if (error) return { ok: false, error: permission(error.code, friendlyDbError(error)) };
  if (!data?.length) return { ok: false, error: "You can't delete this comp." };
  await writeAudit(ctx.supabase, {
    workspaceId: env.data.workspaceId,
    actorId: ctx.user.id,
    action: "comp.delete",
    entityType: "comp",
    entityId: env.data.id,
    diff: { property_id: data[0].property_id, address: data[0].address },
  });
  revalidateWorkspace();
  return { ok: true, data: undefined };
}

const summaryEnvelope = z.object({
  workspaceId: z.uuid(),
  propertyId: z.uuid(),
  scenarioId: z.uuid(),
});

/**
 * AI summary of a saved scenario (ADR-027). Reads everything under the user's
 * session (RLS), sends only the fact list, and returns only sentences that pass
 * the citation check. Nothing is stored.
 */
export async function generateAiSummary(
  input: z.input<typeof summaryEnvelope>,
): Promise<ActionResult<AiSummaryResult>> {
  const env = summaryEnvelope.safeParse(input);
  if (!env.success) return { ok: false, error: "Invalid request" };
  const ctx = await actionContext();
  if (!ctx) return NOT_SIGNED_IN;
  const data = await getAnalysisData(env.data.workspaceId, env.data.propertyId);
  const scenario = data?.scenarios.find((s) => s.id === env.data.scenarioId);
  if (!data || !scenario) return { ok: false, error: "That scenario no longer exists." };

  const result = underwrite(scenario.inputs);
  const flags = redFlags(scenario.inputs, result, {
    saleCompMedianPricePerUnit: data.compStats.saleMedianPricePerUnit,
    saleCompCount: data.compStats.saleCount,
    verificationStatus: data.listing?.verificationStatus ?? null,
  });
  const facts = buildFacts({
    inputs: scenario.inputs,
    sources: scenario.sources,
    result,
    comps: data.compStats,
    flags,
  });
  const summary = await generateSummary(facts);
  if (summary.status === "ok")
    await writeAudit(ctx.supabase, {
      workspaceId: env.data.workspaceId,
      actorId: ctx.user.id,
      action: "ai_summary.generate",
      entityType: "underwriting",
      entityId: scenario.id,
      diff: {
        model: summary.model,
        sentences: summary.summary.sentences.length,
        dropped: summary.summary.dropped,
      },
    });
  return { ok: true, data: summary };
}
