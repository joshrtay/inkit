// The tutor's replies (src/lib/tutor.ts): a model talks with the player from what the solver found
// on their board. A suggested question's first answer for a puzzle and a board signature is kept,
// and reused for every later player at the same point.
//
// Three guards, all here:
//   limits   a player gets PER_HOUR replies an hour; the model writes at most the day's limit of
//            replies for everyone (TUTOR_DAILY_REPLIES, default DAILY). Past the day's limit the
//            tutor still answers, plainly, from the solver's read alone (plainReply).
//   checks   a model's reply that names squares by coordinates or runs long (replyProblems) is asked
//            for once more with the reason; a second failure gives the plain reply instead.
//   a record every reply is kept in tutor_turns: what the limits count, and what to study later.
import { and, eq, gte, isNotNull, sql } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { schema, type Db } from "../db";
import type { GridSpec } from "~site/engine/types.ts";
import { type Ask, ASKS, type BoardRead, cacheKey, type ChatTurn, plainReply, replyProblems, tutorSystem } from "~site/lib/tutor";
import { newId } from "./names.server";

/** The tutor's model. Opus for now, while we judge the replies; a cheaper one may do once they're good.
 *  `version`: bump it when the instructions change, so kept answers from older ones aren't reused. */
export const TUTOR = { model: "claude-opus-5-5", effort: "low", version: 1 } as const;

/** A player's replies an hour, and the model's replies a day for everyone (TUTOR_DAILY_REPLIES overrides). */
export const PER_HOUR = 30, DAILY = 400;

const Reply = z.object({ text: z.string(), move: z.number().int(), mistake: z.boolean() });
export type TutorReply = z.infer<typeof Reply> & { by: "model" | "kept" | "plain" };

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

export const isAsk = (x: unknown): x is Ask => typeof x === "string" && Object.hasOwn(ASKS, x);

/** The day's limit on the model's replies: the setting if it's a whole number, else DAILY. */
export function dailyLimit(env: { TUTOR_DAILY_REPLIES?: string }): number {
  const n = Number(env.TUTOR_DAILY_REPLIES);
  return Number.isInteger(n) && n >= 0 ? n : DAILY;
}

/** What the limits allow, from the counts: "wait" (this player has had the hour's replies),
 *  "plain" (the model has written the day's: answer without it), or "model". */
export function allowed(counts: { mineThisHour: number; modelToday: number }, daily: number): "wait" | "plain" | "model" {
  if (counts.mineThisHour >= PER_HOUR) return "wait";
  return counts.modelToday >= daily ? "plain" : "model";
}

async function countsFor(db: Db, creatorId: string, now: number) {
  const [mine] = await db.select({ n: sql<number>`count(*)` }).from(schema.tutorTurns)
    .where(and(eq(schema.tutorTurns.creatorId, creatorId), gte(schema.tutorTurns.createdAt, new Date(now - 3600e3))));
  const [model] = await db.select({ n: sql<number>`count(*)` }).from(schema.tutorTurns)
    .where(and(isNotNull(schema.tutorTurns.inputTokens), gte(schema.tutorTurns.createdAt, new Date(now - 86400e3))));
  return { mineThisHour: mine?.n ?? 0, modelToday: model?.n ?? 0 };
}

type Made = { reply: z.infer<typeof Reply>; usage: { input: number; output: number } };

/** One model reply to the chat (the last of `turns` is the player's). `again`: why its last try was dropped. */
async function ask(client: Anthropic, spec: GridSpec, read: BoardRead, turns: ChatTurn[], again?: { text: string; problems: string[] }): Promise<Made | null> {
  // the chat as the model sees it: the player's turns as the user's, its own as the assistant's
  const messages = turns.map((t) => ({ role: t.role === "player" ? "user" as const : "assistant" as const, content: t.text }));
  if (again) messages.push({ role: "assistant", content: again.text }, { role: "user", content: `(From the site, not the player: that reply ${again.problems.join(" and ")}. Say it again without that. Describe places by what's there, never by row and column numbers.)` });
  const res = await client.beta.messages.parse({
    model: TUTOR.model, max_tokens: 4000, thinking: { type: "adaptive" },
    output_config: { effort: TUTOR.effort, format: betaZodOutputFormat(Reply) },
    system: tutorSystem(spec, read), messages,
  });
  const out = res.parsed_output;
  return out ? { reply: out, usage: { input: res.usage.input_tokens, output: res.usage.output_tokens } } : null;
}

export type TutorOutcome = { ok: true; reply: TutorReply } | { ok: false; status: number; error: string };

/** Reply to the player's latest turn (the last of `turns`), and keep a record of it. `askKey`: the
 *  suggested question it is, if it is one (a chat's first is reused from, or kept as, a kept answer). */
export async function tutorReply(env: Env, db: Db, who: { id: string }, game: { id: string; sketchHash: string }, spec: GridSpec, read: BoardRead, turns: ChatTurn[], askKey: Ask | null): Promise<TutorOutcome> {
  const t0 = Date.now();
  const limit = allowed(await countsFor(db, who.id, t0), dailyLimit(env));
  if (limit === "wait") return { ok: false, status: 429, error: "That's a lot of questions this hour. Have a go on your own for a bit, then ask again." };

  const first = read.moves[0];
  const record = async (reply: TutorReply, extra: { problems?: string[]; usage?: { input: number; output: number } } = {}) => {
    await db.insert(schema.tutorTurns).values({
      id: newId(), gameId: game.id, creatorId: who.id, ask: askKey, turn: turns.filter((t) => t.role === "player").length,
      by: reply.by, reply: reply.text, move: reply.move, mistake: reply.mistake,
      wrong: read.mistakes.length, target: first ? first.facts.map((f) => `${f.mark}=${f.value}`) : [], cost: first?.cost ?? null,
      problems: extra.problems?.length ? extra.problems : null, model: reply.by === "kept" || extra.usage ? TUTOR.model : null, version: TUTOR.version,
      inputTokens: extra.usage?.input ?? null, outputTokens: extra.usage?.output ?? null, ms: Date.now() - t0,
    });
    return { ok: true as const, reply };
  };

  const key = askKey && turns.length === 1 ? `${game.sketchHash}|v${TUTOR.version}|${cacheKey(askKey, read)}` : null;
  if (key) {
    const had = await db.query.tutorAnswers.findFirst({ where: and(eq(schema.tutorAnswers.gameId, game.id), eq(schema.tutorAnswers.key, key)) });
    const parsed = had && Reply.safeParse(had.answer);
    if (parsed?.success) return record({ ...parsed.data, by: "kept" });
  }
  if (limit === "plain" || !env.ANTHROPIC_API_KEY) return record({ ...plainReply(read), by: "plain" });

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const usage = { input: 0, output: 0 };
  const tidy = (r: z.infer<typeof Reply>) => ({ text: r.text.trim(), move: r.move >= 1 && r.move <= read.moves.length ? r.move : 0, mistake: r.mistake && read.mistakes.length > 0 });
  let made = await ask(client, spec, read, turns), problems: string[] = [];
  if (made) { usage.input += made.usage.input; usage.output += made.usage.output; problems = replyProblems(made.reply.text); }
  if (made && problems.length) {
    const again = await ask(client, spec, read, turns, { text: made.reply.text, problems });
    if (again) { usage.input += again.usage.input; usage.output += again.usage.output; }
    made = again && !replyProblems(again.reply.text).length ? again : null;
  }
  // (a dropped reply is recorded with its tokens, so it still counts toward the day's limit: it was paid for)
  if (!made) return record({ ...plainReply(read), by: "plain" }, { problems: problems.length ? problems : ["no reply"], usage });
  const reply = tidy(made.reply);
  if (key) await db.insert(schema.tutorAnswers).values({ gameId: game.id, key, answer: reply, model: TUTOR.model }).onConflictDoNothing();
  return record({ ...reply, by: "model" }, { problems, usage });
}
