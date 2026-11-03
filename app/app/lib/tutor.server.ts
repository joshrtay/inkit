// The tutor's replies (src/lib/tutor.ts): a model talks with the player from what the solver found
// on their board. A suggested question's first answer for a puzzle and a board signature is kept,
// and reused for every later player at the same point.
import { and, eq } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { schema, type Db } from "../db";
import type { GridSpec } from "~site/engine/types.ts";
import { type Ask, ASKS, type BoardRead, cacheKey, type ChatTurn, tutorSystem } from "~site/lib/tutor";

/** The tutor's model. Opus for now, while we judge the replies; a cheaper one may do once they're good. */
export const TUTOR = { model: "claude-opus-5-5", effort: "low" } as const;

const Reply = z.object({ text: z.string(), move: z.number().int(), mistake: z.boolean() });
export type TutorReply = z.infer<typeof Reply> & { kept?: boolean };

const MAX_TURNS = 24, MAX_CHARS = 600;

/** Is this a board read as the page sends it? (Shape and size only: it's the player's own help.) */
export function readOfBody(x: unknown): BoardRead | null {
  const r = x as BoardRead | null;
  if (!r || typeof r !== "object" || !Array.isArray(r.mistakes) || !Array.isArray(r.moves) || r.moves.length > 12 || r.mistakes.length > 200) return null;
  return { mistakes: r.mistakes.slice(0, 20), moves: r.moves, done: !!r.done };
}

export function turnsOfBody(x: unknown): ChatTurn[] | null {
  if (!Array.isArray(x) || x.length > MAX_TURNS) return null;
  const turns = x.filter((t): t is ChatTurn => !!t && (t.role === "player" || t.role === "tutor") && typeof t.text === "string" && t.text.length <= MAX_CHARS);
  return turns.length === x.length ? turns : null;
}

/** Reply to the player's latest turn (the last of `turns`). `ask`: the suggested question it is, if
 *  it is one and the chat has just started (then a kept answer is reused, or this one kept). */
export async function tutorReply(env: Env, db: Db, game: { id: string; sketchHash: string }, spec: GridSpec, read: BoardRead, turns: ChatTurn[], ask: Ask | null): Promise<TutorReply> {
  const key = ask && turns.length === 1 ? `${game.sketchHash}|${cacheKey(ask, read)}` : null;
  if (key) {
    const had = await db.query.tutorAnswers.findFirst({ where: and(eq(schema.tutorAnswers.gameId, game.id), eq(schema.tutorAnswers.key, key)) });
    const parsed = had && Reply.safeParse(had.answer);
    if (parsed?.success) return { ...parsed.data, kept: true };
  }
  if (!env.ANTHROPIC_API_KEY) return { text: "The tutor isn't set up here (no API key).", move: 0, mistake: false };
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  // the chat as the model sees it: the player's turns as the user's, its own as the assistant's
  const messages = turns.map((t) => ({ role: t.role === "player" ? "user" as const : "assistant" as const, content: t.text }));
  const res = await client.beta.messages.parse({
    model: TUTOR.model, max_tokens: 4000, thinking: { type: "adaptive" },
    output_config: { effort: TUTOR.effort, format: betaZodOutputFormat(Reply) },
    system: tutorSystem(spec, read), messages,
  });
  const out = res.parsed_output;
  if (!out) return { text: "Sorry, I lost my train of thought. Ask again?", move: 0, mistake: false };
  const reply = { text: out.text.trim(), move: out.move >= 1 && out.move <= read.moves.length ? out.move : 0, mistake: out.mistake && read.mistakes.length > 0 };
  if (key) await db.insert(schema.tutorAnswers).values({ gameId: game.id, key, answer: reply, model: TUTOR.model }).onConflictDoNothing();
  return reply;
}

export const isAsk = (x: unknown): x is Ask => typeof x === "string" && x in ASKS;
