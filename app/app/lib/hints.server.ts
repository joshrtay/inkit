// Puzzles' hint ladders (src/lib/hint-ladder.ts): which games still need one, for the batch that
// writes them off the Worker (puzzles/hints/write-site.ts, like the assessments' batch), storing
// what it sends back, an author's own edit, and a game's ladder for its page.
import { and, asc, eq, isNotNull, isNull, or } from "drizzle-orm";
import { schema, type Db } from "../db";
import { sha256 } from "../ai/request";
import { readLadder, type Ladder } from "~site/lib/hint-ladder";

/** cells a ladder's outlines may name: the page drops any off its own board */
const MAX_CELLS = 10000;

/** Published games, and AI creators' scheduled drafts, with no ladder yet, oldest first: their
 *  sketch and its hash, which the answer must carry back. */
export async function pendingLadders(db: Db, limit = 20) {
  const rows = await db.select({ id: schema.games.id, kind: schema.games.kind, sketch: schema.games.sketch, sketchVersion: schema.games.sketchVersion })
    .from(schema.games)
    .leftJoin(schema.hintLadders, eq(schema.hintLadders.gameId, schema.games.id))
    .where(and(isNull(schema.hintLadders.gameId),
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
  await db.insert(schema.hintLadders).values(row).onConflictDoUpdate({ target: schema.hintLadders.gameId, set: { ...row, updatedAt: new Date() } });
}

/** A game's ladder for its page, if it has one for its current sketch. */
export async function ladderOf(db: Db, game: { id: string; sketch: string }): Promise<Ladder | null> {
  const row = await db.query.hintLadders.findFirst({ where: eq(schema.hintLadders.gameId, game.id) });
  if (!row || row.sketchHash !== (await sha256(game.sketch))) return null;
  return readLadder(row.ladder, MAX_CELLS);
}
