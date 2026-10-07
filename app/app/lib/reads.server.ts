// The record of reads: every time Claude read a drawing on the site (an upload or a re-read), what
// it read, how long it took and what it cost, and (once the puzzle is first published) how far
// the published puzzle is from the reading. It measures how well drawings are read, and the
// published ones (photo + the puzzle the creator settled on) are the makings of a training set.
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { schema, type Db } from "../db";
import { newId } from "./names.server";
import { diffSketches } from "../games/diff";
import type { Attempt } from "./read-sketch.server";

export interface ReadRecord {
  gameId: string | null;
  creatorId: string;
  kind: "upload" | "reread";
  imageKey: string | null;
  feedback?: string;
  chosenKind?: string;
  attempts: Attempt[];
  /** what came back (absent when the read failed) */
  result?: { reading: unknown; sketch: string; puzzleKind: string; model: string };
  error?: string;
}

/** Keep a read. Never stops the page that did the reading: a failure here is only logged. */
export async function recordRead(db: Db, r: ReadRecord) {
  try {
    await db.insert(schema.reads).values({
      id: newId(), gameId: r.gameId, creatorId: r.creatorId, kind: r.kind, imageKey: r.imageKey,
      feedback: r.feedback || null, chosenKind: r.chosenKind || null, attempts: r.attempts,
      model: r.result?.model ?? null, reading: r.result?.reading ?? null, sketch: r.result?.sketch ?? null,
      puzzleKind: r.result?.puzzleKind ?? null, error: r.error ?? null,
    });
  } catch (e) {
    console.error("couldn't record a read", e);
  }
}

/** A game was published for the first time: note the published puzzle, and its difference
 *  from the last reading the creator started from, on that read. */
export async function notePublished(db: Db, gameId: string, sketch: string) {
  try {
    const read = await db.query.reads.findFirst({
      where: and(eq(schema.reads.gameId, gameId), isNotNull(schema.reads.sketch), isNull(schema.reads.publishedAt)),
      orderBy: desc(schema.reads.createdAt),
    });
    if (!read?.sketch) return;
    await db.update(schema.reads).set({ publishedSketch: sketch, publishedAt: new Date(), diff: diffSketches(read.sketch, sketch) })
      .where(eq(schema.reads.id, read.id));
  } catch (e) {
    console.error("couldn't note a published read", e);
  }
}

export type ReadRow = typeof schema.reads.$inferSelect;
type Diff = ReturnType<typeof diffSketches>;
const attemptsOf = (r: ReadRow) => (r.attempts ?? []) as Attempt[];

/** Every read, newest first, with who made it (for the admin page and the export). */
export const allReads = (db: Db) => db.select({ read: schema.reads, handle: schema.creators.handle })
  .from(schema.reads).innerJoin(schema.creators, eq(schema.reads.creatorId, schema.creators.id))
  .orderBy(desc(schema.reads.createdAt));

/** How well drawings are being read: overall, by puzzle type, and what it costs. */
export function readStats(rows: ReadRow[]) {
  const ok = rows.filter((r) => !r.error), published = ok.filter((r) => r.diff);
  const diffs = published.map((r) => r.diff as NonNullable<Diff>);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const share = (n: number, of: number) => (of ? n / of : null);
  const attempts = rows.flatMap(attemptsOf);
  const byModel = new Map<string, { looks: number; ms: number[]; input: number; output: number }>();
  for (const a of attempts) {
    const m = byModel.get(a.model) ?? { looks: 0, ms: [], input: 0, output: 0 };
    m.looks++; m.ms.push(a.ms); m.input += a.inputTokens ?? 0; m.output += a.outputTokens ?? 0;
    byModel.set(a.model, m);
  }
  const kinds = new Map<string, { reads: number; published: number; exact: number; scores: number[] }>();
  for (const r of ok) {
    const k = kinds.get(r.puzzleKind ?? "?") ?? { reads: 0, published: 0, exact: 0, scores: [] };
    k.reads++;
    if (r.diff) { const d = r.diff as NonNullable<Diff>; k.published++; k.scores.push(d.score); if (d.exact) k.exact++; }
    kinds.set(r.puzzleKind ?? "?", k);
  }
  const games = new Set(ok.map((r) => r.gameId).filter(Boolean));
  return {
    reads: rows.length,
    failed: rows.length - ok.length,
    uploads: rows.filter((r) => r.kind === "upload").length,
    rereads: rows.filter((r) => r.kind === "reread").length,
    /** drafts that needed at least one re-read */
    rereadRate: share(new Set(ok.filter((r) => r.kind === "reread").map((r) => r.gameId)).size, games.size),
    /** the careful reader took over from the quick one */
    escalated: share(rows.filter((r) => attemptsOf(r).some((a) => a.trouble?.length)).length, rows.length),
    published: published.length,
    exact: share(diffs.filter((d) => d.exact).length, diffs.length),
    meanScore: mean(diffs.map((d) => d.score)),
    kindRight: share(diffs.filter((d) => d.sameKind).length, diffs.length),
    sizeRight: share(diffs.filter((d) => d.sameSize).length, diffs.length),
    models: [...byModel].map(([model, m]) => ({ model, looks: m.looks, medianMs: m.ms.sort((a, b) => a - b)[Math.floor(m.ms.length / 2)] ?? 0, input: m.input, output: m.output })),
    kinds: [...kinds].map(([kind, k]) => ({ kind, reads: k.reads, published: k.published, exact: share(k.exact, k.published), meanScore: mean(k.scores) }))
      .sort((a, b) => b.reads - a.reads),
  };
}
