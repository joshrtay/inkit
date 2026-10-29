// Puzzles' hint ladders (src/lib/hint-ladder.ts): which games still need one, for the batch that
// writes them off the Worker (puzzles/hints/write-site.ts, like the assessments' batch), storing
// what it sends back, an author's own edit, and a game's ladder for its page.
import { and, asc, eq, isNotNull, isNull, ne, or } from "drizzle-orm";
import { schema, type Db } from "../db";
import { sha256 } from "../ai/request";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { readLadder, type BoardLike, type Ladder } from "~site/lib/hint-ladder";
import { ladderFromReply, solverLadder, type Stuck, writerPrompt } from "~site/lib/hint-words";
import { check, makePuzzle } from "~site/engine/puzzle.ts";
import { emptyBoard, type GridSpec } from "~site/engine/types.ts";

/** cells a ladder's outlines may name: the page drops any off its own board */
const MAX_CELLS = 10000;

/** Published games, and AI creators' scheduled drafts, with no ladder yet, oldest first: their
 *  sketch and its hash, which the answer must carry back. (Not RYB's figures: the solver can't read
 *  them, and they'd come back every run.) */
export async function pendingLadders(db: Db, limit = 20) {
  const rows = await db.select({ id: schema.games.id, kind: schema.games.kind, sketch: schema.games.sketch, sketchVersion: schema.games.sketchVersion })
    .from(schema.games)
    .leftJoin(schema.hintLadders, eq(schema.hintLadders.gameId, schema.games.id))
    .where(and(isNull(schema.hintLadders.gameId), ne(schema.games.kind, "coats"),
      or(eq(schema.games.state, "published"), and(eq(schema.games.state, "draft"), isNotNull(schema.games.publishAt)))))
    .orderBy(asc(schema.games.createdAt)).limit(limit);
  return Promise.all(rows.map(async (r) => ({ ...r, sketchHash: await sha256(r.sketch) })));
}

export interface LadderResult { id: string; sketchHash: string; ladder: unknown }

/** Store the batch's ladders: each for the sketch it was written for (a game whose sketch has
 *  changed since is skipped), never over one its author has edited. */
export async function storeLadders(db: Db, results: LadderResult[]) {
  const stored: string[] = [], skipped: string[] = [];
  for (const r of results) {
    const ladder = readLadder(r.ladder, MAX_CELLS);
    const game = await db.query.games.findFirst({ where: eq(schema.games.id, r.id), columns: { sketch: true } });
    const had = await db.query.hintLadders.findFirst({ where: eq(schema.hintLadders.gameId, r.id), columns: { source: true } });
    if (!ladder || !game || (await sha256(game.sketch)) !== r.sketchHash || had?.source === "author") { skipped.push(r.id); continue; }
    const row = { gameId: r.id, ladder: { ...ladder, edited: undefined }, source: ladder.version, sketchHash: r.sketchHash };
    await db.insert(schema.hintLadders).values(row).onConflictDoUpdate({ target: schema.hintLadders.gameId, set: { ...row, updatedAt: new Date() } });
    stored.push(r.id);
  }
  return { stored: stored.length, skipped };
}

/** A game's ladder as its author rewrote it (the page's Edit hints); null clears it, and it stays
 *  cleared (an empty ladder of the author's, which the batch leaves alone). The caller checks who
 *  may (permissions.server.ts canEditHints). */
export async function saveAuthorLadder(db: Db, game: { id: string; sketch: string }, ladder: Ladder | null) {
  const kept = ladder ? { ...ladder, edited: true } : { version: "author", edited: true, opening: [], points: [] };
  const row = { gameId: game.id, ladder: kept, source: "author", sketchHash: await sha256(game.sketch) };
  // (how it was verified stays: rewording the hints doesn't change that)
  await db.insert(schema.hintLadders).values(row).onConflictDoUpdate({ target: schema.hintLadders.gameId, set: { ...row, updatedAt: new Date() } });
}

// ---------- written on the publish page ----------
/** The model that words the hints on the publish page, and the ladder version it writes: Opus,
 *  which a blind judge preferred to Sonnet on 17 of 20 examples (2 ties) for about $0.06 a puzzle
 *  against $0.01; Sonnet stated false rules and wrong steps more often
 *  (puzzles/hints/compare-writers.ts, 2026-10-29). */
export const HINT_WRITER = { model: "claude-opus-5-5", effort: "medium", version: "opus-1" } as const;

const Reply = z.object({
  start: z.string(), habit: z.string(),
  points: z.array(z.object({ where: z.string(), rule: z.string(), technique: z.string(), short: z.string(), step: z.string() })),
});

/** A board the page sent (the creator's finished solve), as the engine's. */
function boardFrom(spec: GridSpec, sent: BoardLike) {
  const b = emptyBoard(makePuzzle(spec).grid);
  for (const k of ["shade", "fence", "loop", "cut", "color", "digit"] as const) {
    const v = sent[k];
    if (Array.isArray(v)) v.forEach((x, i) => { if (i < b[k].length && Number.isInteger(x) && x >= 0 && x <= 255) b[k][i] = x; });
  }
  return b;
}

/** How a draft's solve was verified, from what the page found: the solver finished it alone, or
 *  with the creator's moves where it stalled (then the creator's finished board must check out
 *  here). Null when it isn't verified. */
export function verifiedBy(spec: GridSpec, stuck: Stuck, board: BoardLike | null): "solver" | "creator" | null {
  if (!stuck.solved) return null;
  if (!stuck.creatorMoves) return "solver";
  return board && check(makePuzzle(spec), boardFrom(spec, board)).length === 0 ? "creator" : null;
}

/** Word a ladder for the stuck points the page found: Sonnet, rung by rung checked, the solver's
 *  words wherever it falls short (and throughout without an API key, or if the call fails). */
export async function writeLadder(env: Env, spec: GridSpec, stuck: Stuck): Promise<{ ladder: Ladder; problems: string[] }> {
  if (!env.ANTHROPIC_API_KEY) return { ladder: solverLadder(spec, stuck), problems: ["no ANTHROPIC_API_KEY: the solver's words"] };
  try {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const res = await client.beta.messages.parse({
      model: HINT_WRITER.model, max_tokens: 16000, thinking: { type: "adaptive" },
      output_config: { effort: HINT_WRITER.effort, format: betaZodOutputFormat(Reply) },
      messages: [{ role: "user", content: writerPrompt(spec, stuck) }],
    });
    return ladderFromReply(spec, stuck, res.parsed_output ?? null, HINT_WRITER.version);
  } catch (e) {
    return { ladder: solverLadder(spec, stuck), problems: [`the writer failed (${(e as Error).message.slice(0, 120)}): the solver's words`] };
  }
}

/** Keep a draft's ladder and how its solve was verified, for the sketch it was found on. */
export async function storeDraftLadder(db: Db, gameId: string, sketchHash: string, ladder: Ladder, verified: "solver" | "creator") {
  const row = { gameId, ladder, source: ladder.version, sketchHash, verified };
  await db.insert(schema.hintLadders).values(row).onConflictDoUpdate({ target: schema.hintLadders.gameId, set: { ...row, updatedAt: new Date() } });
}

/** A draft's ladder for the sketch about to be published, with how it was verified (the publish
 *  page shows it; publishing needs it). */
export async function draftLadder(db: Db, gameId: string, sketch: string): Promise<{ ladder: Ladder | null; verified: string | null } | null> {
  const row = await db.query.hintLadders.findFirst({ where: eq(schema.hintLadders.gameId, gameId) });
  if (!row || row.sketchHash !== (await sha256(sketch))) return null;
  return { ladder: readLadder(row.ladder, MAX_CELLS), verified: row.verified };
}

/** A game's ladder for its page, if it has one for its current sketch. */
export async function ladderOf(db: Db, game: { id: string; sketch: string }): Promise<Ladder | null> {
  const row = await db.query.hintLadders.findFirst({ where: eq(schema.hintLadders.gameId, game.id) });
  if (!row || row.sketchHash !== (await sha256(game.sketch))) return null;
  return readLadder(row.ladder, MAX_CELLS);
}
