// Checking a scheduled post sent by the weekly batch (POST /admin/ai/schedule), or a backdated one
// sent by the backfill (POST /admin/ai/backfill, puzzles/ai/backfill.ts): who it's for, the
// puzzle, its words, when it goes up, and the batch's proof that it has one solution (the Worker
// can't run clingo, so the batch proves it and the proof is bound to this exact sketch by its
// hash). Pure, so it's unit-tested (tests/unit/ai-schedule.test.ts, ai-backfill.test.ts).
import { z } from "zod";
import { parseSketch } from "../games/sketch";
import { personaByHandle, type Persona } from "./personas.ts";
import { slotKey, slotsBetween } from "./schedule.ts";

export const ScheduleRequest = z.object({
  persona: z.string(),
  sketch: z.string().min(1).max(200_000),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).default(""),
  /** ISO time */
  publishAt: z.string(),
  proof: z.object({ solutions: z.number().int().min(0), sketchHash: z.string(), solver: z.string() }),
  /** what the batch knows about it (difficulty, scores, tokens): logged; `difficulty` (0..1) is kept
   *  as the game's difficulty (app/games/estimate.ts) */
  meta: z.record(z.string(), z.unknown()).optional(),
});
export type ScheduleRequest = z.infer<typeof ScheduleRequest>;

export async function sha256(text: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** How far ahead a post may be scheduled, and how late one may arrive (it then goes up at once). */
const AHEAD = 21 * 86400e3, LATE = 3600e3;

export type Checked =
  | { ok: true; persona: Persona; kind: string; publishAt: Date; req: ScheduleRequest }
  | { ok: false; status: number; error: string };

export async function checkScheduleRequest(body: unknown, now: Date): Promise<Checked> {
  const parsed = ScheduleRequest.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, error: issues(parsed.error) };
  const req = parsed.data;
  const persona = personaByHandle(req.persona);
  if (!persona) return notAi(req.persona);
  const publishAt = new Date(req.publishAt);
  if (Number.isNaN(publishAt.getTime())) return { ok: false, status: 400, error: "publishAt isn't a time." };
  if (publishAt.getTime() < now.getTime() - LATE) return { ok: false, status: 400, error: "publishAt is in the past." };
  if (publishAt.getTime() > now.getTime() + AHEAD) return { ok: false, status: 400, error: "publishAt is more than three weeks away." };
  const puzzle = await checkPuzzle(persona, req.sketch, req.proof);
  if (!puzzle.ok) return puzzle;
  return { ok: true, persona, kind: puzzle.kind, publishAt, req: { ...req, sketch: puzzle.sketch } };
}

const issues = (e: z.ZodError) => e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
const notAi = (handle: string) => ({ ok: false as const, status: 404, error: `"${handle}" isn't an AI creator (app/app/ai/personas.ts).` });

/** The puzzle itself, the same for a scheduled post and a backfilled one: it parses, the persona
 *  makes its genre, and the batch's proof of one solution (a panel: at least one) is for it. */
async function checkPuzzle(persona: Persona, raw: string, proof: ScheduleRequest["proof"]): Promise<{ ok: true; kind: string; sketch: string } | { ok: false; status: number; error: string }> {
  const sketch = raw.replace(/\r\n/g, "\n");
  const p = parseSketch(sketch);
  if (!p.ok) return { ok: false, status: 400, error: `The sketch doesn't parse: ${p.errors.join(" ")}` };
  if (!persona.genres.some((g) => g.genre === p.kind)) return { ok: false, status: 400, error: `${persona.name} doesn't make ${p.kind} puzzles.` };
  if (proof.sketchHash !== (await sha256(sketch))) return { ok: false, status: 400, error: "The proof is for a different sketch." };
  // a panel needs a line; every other puzzle exactly one solution
  const proved = p.kind === "panel" ? proof.solutions >= 1 : proof.solutions === 1;
  if (!proved) return { ok: false, status: 400, error: `The proof found ${proof.solutions} solutions; it needs exactly one.` };
  return { ok: true, kind: p.kind, sketch };
}

// ---- backfilling: posts dated in the past (puzzles/ai/backfill.ts, POST /admin/ai/backfill) ----

/** One backfilled post: a scheduled post's fields, with the time it was (as if) published. */
export const BackfillPost = ScheduleRequest.omit({ publishAt: true }).extend({ publishedAt: z.string() });
export type BackfillPost = z.infer<typeof BackfillPost>;
export const BackfillRequest = z.object({
  posts: z.array(z.unknown()).min(1).max(50),
  /** check everything and say what would happen, writing nothing */
  dryRun: z.boolean().optional(),
});

/** How far back a post may be dated. */
const BACK = 800 * 86400e3;

export type CheckedBackfill =
  | { ok: true; persona: Persona; kind: string; publishedAt: Date; key: string; req: BackfillPost }
  | { ok: false; status: number; error: string; key?: string };

/** A backfilled post: for an AI creator only, at one of its own slots (the instant its schedule
 *  gives for that day), in the past, with the same puzzle checks as a scheduled post. */
export async function checkBackfillPost(body: unknown, now: Date): Promise<CheckedBackfill> {
  const parsed = BackfillPost.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, error: issues(parsed.error) };
  const req = parsed.data;
  const persona = personaByHandle(req.persona);
  if (!persona) return notAi(req.persona);
  const publishedAt = new Date(req.publishedAt);
  if (Number.isNaN(publishedAt.getTime())) return { ok: false, status: 400, error: "publishedAt isn't a time." };
  const key = slotKey(persona.handle, publishedAt);
  if (publishedAt.getTime() >= now.getTime()) return { ok: false, status: 400, key, error: "publishedAt isn't in the past: schedule it instead (POST /admin/ai/schedule)." };
  if (publishedAt.getTime() < now.getTime() - BACK) return { ok: false, status: 400, key, error: "publishedAt is more than 800 days ago." };
  const slot = slotsBetween(persona, new Date(publishedAt.getTime() - 60e3), new Date(publishedAt.getTime() + 60e3)).find((s) => s.at.getTime() === publishedAt.getTime());
  if (!slot) return { ok: false, status: 400, key, error: `${publishedAt.toISOString()} isn't one of ${persona.name}'s posting times.` };
  const puzzle = await checkPuzzle(persona, req.sketch, req.proof);
  if (!puzzle.ok) return { ...puzzle, key };
  return { ok: true, persona, kind: puzzle.kind, publishedAt, key, req: { ...req, sketch: puzzle.sketch } };
}

/** What to do with a checked backfilled post, given the persona's games that share its slot or its
 *  sketch: a game at the same instant (queued, published, or since deleted) means it was sent
 *  before, so it's skipped; the same puzzle at another time is a repeat, refused. Pure, so the
 *  idempotency is unit-tested. */
export function backfillAction(existing: { id: string; state: string; publishedAt: Date | null; publishAt: Date | null; sketch: string }[], at: Date, sketch: string):
  { do: "insert" } | { do: "skip"; id: string } | { do: "repeat"; id: string } {
  const same = existing.find((g) => g.publishedAt?.getTime() === at.getTime() || g.publishAt?.getTime() === at.getTime());
  if (same) return { do: "skip", id: same.id };
  const repeat = existing.find((g) => g.state !== "deleted" && g.sketch === sketch);
  if (repeat) return { do: "repeat", id: repeat.id };
  return { do: "insert" };
}
