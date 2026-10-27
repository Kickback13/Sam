import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

import { checkSummary, type CheckedSummary, type Fact } from "./citations";

/**
 * AI deal summary (ADR-027). Connected only when ANTHROPIC_API_KEY is set on
 * Sam's Anthropic account (Vercel env). The model gets the fact list only —
 * labels, values and sources; no names, addresses or contact details — and
 * every sentence it returns is checked by checkSummary() before it's shown.
 */
export const AI_MODEL = "claude-opus-5-5";

export const AI_NOT_CONNECTED =
  "AI summaries aren't connected yet. They need an Anthropic API key on Sam's account (ANTHROPIC_API_KEY).";

export type AiSummaryResult =
  | { status: "ok"; summary: CheckedSummary; model: string; generatedAt: string }
  | { status: "not_connected"; message: string }
  | { status: "refused" | "empty" | "error"; message: string };

const outputSchema = z.object({
  sentences: z
    .array(
      z.object({
        text: z.string().describe("One plain-English sentence."),
        fact_ids: z.array(z.string()).describe("Ids of the facts this sentence relies on."),
      }),
    )
    .describe("3 to 6 sentences."),
});

const SYSTEM = `You write short underwriting summaries for a San Diego multifamily investor.

You are given a numbered list of facts about one property: each has an id, a label, a value exactly as the app shows it, and where it came from. Use only these facts.

Rules:
- Write 3 to 6 plain-English sentences: what the deal is, how it performs, and the main risks or open questions (red flags and missing inputs).
- Every sentence lists the ids of the facts it relies on in fact_ids.
- Copy numbers exactly as they appear in the fact values. Never compute, round, estimate or introduce a number that isn't in a cited fact.
- If something important isn't in the facts, say it hasn't been entered — don't guess.
- No recommendation to buy or not buy; describe, don't decide.`;

export function aiSummaryAdapter() {
  return { name: "Claude (Anthropic)", connected: Boolean(process.env.ANTHROPIC_API_KEY) };
}

export async function generateSummary(facts: Fact[]): Promise<AiSummaryResult> {
  if (!aiSummaryAdapter().connected) return { status: "not_connected", message: AI_NOT_CONNECTED };
  if (facts.length === 0) return { status: "empty", message: "Enter some numbers first." };

  const factList = facts
    .map((f) => `${f.id} | ${f.label} | ${f.value} | source: ${f.source}`)
    .join("\n");

  try {
    const client = new Anthropic();
    const response = await client.beta.messages.parse({
      model: AI_MODEL,
      max_tokens: 16000,
      // Server-side fallback if the request is ever declined by a safety classifier.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(outputSchema) },
      system: SYSTEM,
      messages: [{ role: "user", content: `Facts (id | label | value | source):\n${factList}` }],
    });
    if (response.stop_reason === "refusal")
      return {
        status: "refused",
        message: "The AI declined to summarize this. Nothing was changed.",
      };
    const parsed = response.parsed_output;
    if (!parsed)
      return { status: "error", message: "The AI response couldn't be read. Try again." };
    const summary = checkSummary(parsed.sentences, facts);
    if (summary.sentences.length === 0)
      return {
        status: "empty",
        message: "The AI's sentences didn't pass the source check, so nothing is shown. Try again.",
      };
    return { status: "ok", summary, model: response.model, generatedAt: new Date().toISOString() };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError)
      return {
        status: "error",
        message: "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.",
      };
    if (e instanceof Anthropic.RateLimitError)
      return { status: "error", message: "The AI is busy right now. Try again in a minute." };
    if (e instanceof Anthropic.APIError) {
      console.error("ai summary failed", { status: e.status, message: e.message });
      return { status: "error", message: "The AI summary failed. Try again." };
    }
    console.error("ai summary failed", e);
    return { status: "error", message: "The AI summary failed. Try again." };
  }
}
