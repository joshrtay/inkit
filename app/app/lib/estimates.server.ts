// Each game's difficulty and time to solve (app/games/estimate.ts), worked out from its sketch and
// kept on the game: when its sketch is saved, and for older games by the cron (workers/app.ts) and
// Explore (a few at a time, until none are left).
import { and, eq, isNull } from "drizzle-orm";
import { schema, type Db } from "../db";
import { parseSketch } from "../games/sketch";
import { type Estimate } from "../games/estimate";
import { estimateWith, type Assessment } from "../games/assessment";

/** The estimate for a sketch, or null if it doesn't parse (a draft half drawn). `scored` is a
 *  scorer's difficulty, for an AI creator's post; `assessed`, the deduction solver's assessment,
 *  whose difficulty wins when its solve finished (app/games/assessment.ts). */
export function estimateSketch(sketch: string, version?: number, scored?: unknown, assessed?: Assessment | null): Estimate | null {
  const p = parseSketch(sketch, version);
  if (!p.ok) return null;
  return estimateWith(p.kind, p.spec, assessed ?? null, typeof scored === "number" ? scored : null);
}

/** The columns to set on a game for its sketch. */
export const estimateColumns = (sketch: string, version?: number, scored?: unknown, assessed?: Assessment | null) => {
  const e = estimateSketch(sketch, version, scored, assessed);
  return e ? { difficulty: e.difficulty, level: e.level, minutes: e.minutes } : {};
};

/** Fill in the estimate of published games that have none yet (made before estimates), `limit` at
 *  a time. Returns how many it did. */
export async function backfillEstimates(db: Db, limit = 60) {
  const rows = await db.select({ id: schema.games.id, sketch: schema.games.sketch, version: schema.games.sketchVersion })
    .from(schema.games).where(and(eq(schema.games.state, "published"), isNull(schema.games.minutes))).limit(limit);
  if (!rows.length) return 0;
  // games whose sketch no longer parses get the middle estimate, so they aren't tried again
  const updates = rows.map((r) => {
    const e = estimateSketch(r.sketch, r.version) ?? { difficulty: 0.5, level: 2, minutes: 5 };
    return db.update(schema.games).set({ difficulty: e.difficulty, level: e.level, minutes: e.minutes }).where(eq(schema.games.id, r.id));
  });
  await db.batch(updates as [typeof updates[number], ...typeof updates]);
  return rows.length;
}
