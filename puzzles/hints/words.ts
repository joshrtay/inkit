// The batch's hint writers (src/lib/hint-words.ts holds the words themselves, shared with the site):
// the solver's free words, or a model's, one call per puzzle (write-site.ts --writer opus|sonnet).
import Anthropic from "@anthropic-ai/sdk";
export { cellsOfMark, ladderFromReply, parseReply, solverLadder, solverOpening, solverRungs, SOLVER_WRITER, usable, writerPrompt } from "../../src/lib/hint-words.ts";

/** The models a ladder can be written with, and their prices per token (as walkthrough-hints.ts). */
export const WRITERS = {
  opus: { id: "claude-opus-5-5", version: "opus-1", input: 4 / 1e6, output: 20 / 1e6 },
  sonnet: { id: "claude-sonnet-5-5", version: "sonnet-1", input: 2 / 1e6, output: 10 / 1e6 },
} as const;
export type Writer = keyof typeof WRITERS;

/** Ask a model (INKIT_ANTHROPIC_KEY, else ANTHROPIC_API_KEY). Returns the reply's text and its cost. */
export async function askModel(prompt: string, who: Writer): Promise<{ text: string; cost: number }> {
  const key = process.env.INKIT_ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("no INKIT_ANTHROPIC_KEY or ANTHROPIC_API_KEY");
  const m = WRITERS[who];
  const client = new Anthropic({ apiKey: key, maxRetries: 2, timeout: 10 * 60_000 });
  const r = await client.messages.create({ model: m.id, max_tokens: 16000, thinking: { type: "adaptive" }, output_config: { effort: "medium" }, messages: [{ role: "user", content: prompt }] } as any) as Anthropic.Message;
  const text = r.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  return { text, cost: r.usage.input_tokens * m.input + r.usage.output_tokens * m.output };
}
