// The deduction solver's assessments of published puzzles (app/games/assessment.ts): which games
// still need one, for the batch that runs the solver off the Worker (puzzles/difficulty/
// assess-site.ts, hourly in GitHub Actions), and storing what it sends back. A finished solve's
// difficulty becomes the game's; the quality is only logged.
import { and, asc, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { schema, type Db } from "../db";
import { estimateColumns } from "./estimates.server";
import { assessmentRow, type Assessment } from "../games/assessment";
import { sha256 } from "../ai/request";

/** Published games, and AI creators' scheduled drafts (they won't change either), with no assessment
 *  at `version` yet, oldest first: their sketch and its hash, which the answer must carry back. The
 *  generator's own assessment counts only if its solve finished: its budget is the smaller one. */
export async function pendingAssessments(db: Db, version: number, limit = 20) {
  const rows = await db.select({ id: schema.games.id, kind: schema.games.kind, sketch: schema.games.sketch, sketchVersion: schema.games.sketchVersion })
    .from(schema.games)
    .leftJoin(schema.assessments, and(eq(schema.assessments.gameId, schema.games.id), eq(schema.assessments.version, version),
      or(eq(schema.assessments.source, "batch"), eq(schema.assessments.solved, true))))
    .where(and(isNull(schema.assessments.gameId),
      or(eq(schema.games.state, "published"), and(eq(schema.games.state, "draft"), isNotNull(schema.games.publishAt)))))
    .orderBy(asc(schema.games.createdAt)).limit(limit);
  return Promise.all(rows.map(async (r) => ({ ...r, sketchHash: await sha256(r.sketch) })));
}

export interface AssessmentResult { id: string; sketchHash: string; assessment: Assessment }

/** Store the batch's assessments: each for the sketch it was made from (a game whose sketch has
 *  changed since is skipped), and the game's difficulty, level and minutes from it when its solve
 *  finished. Returns how many were stored. */
export async function storeAssessments(db: Db, results: AssessmentResult[]) {
  if (!results.length) return { stored: 0, skipped: [] as string[] };
  const games = await db.select({ id: schema.games.id, sketch: schema.games.sketch, sketchVersion: schema.games.sketchVersion })
    .from(schema.games).where(inArray(schema.games.id, results.map((r) => r.id)));
  const byId = new Map(games.map((g) => [g.id, g]));
  const writes = [], skipped: string[] = [];
  for (const r of results) {
    const g = byId.get(r.id);
    if (!g || (await sha256(g.sketch)) !== r.sketchHash) { skipped.push(r.id); continue; }
    const row = assessmentRow(r.id, "batch", r.assessment);
    writes.push(db.insert(schema.assessments).values(row).onConflictDoUpdate({ target: [schema.assessments.gameId, schema.assessments.version], set: { ...row, createdAt: new Date() } }));
    if (r.assessment.solved && r.assessment.estimate != null) {
      const cols = estimateColumns(g.sketch, g.sketchVersion, null, r.assessment);
      if ("difficulty" in cols) writes.push(db.update(schema.games).set(cols).where(eq(schema.games.id, r.id)));
    }
  }
  if (writes.length) await db.batch(writes as [typeof writes[number], ...typeof writes]);
  return { stored: results.length - skipped.length, skipped };
}
