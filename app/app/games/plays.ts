// A batch of a play's events as POST /api/plays takes it (app/lib/play-log.ts makes them): checked
// here, stored by routes/api.plays.ts. Pure, so it's unit-tested (tests/unit/play-log.test.ts).
import { z } from "zod";

const id = z.string().regex(/^[a-z0-9]{8,32}$/);
/** [t, kind, data?]: t in ms since the play began (at most a week), a one-letter kind */
const Event = z.tuple([z.number().int().min(0).max(7 * 86400e3), z.enum(["o", "m", "u", "h", "r", "s", "a", "b"])]).rest(z.unknown());

export const PlayBatch = z.object({
  play: z.object({ id, gameId: z.string().min(1).max(40), playerId: id, startedAt: z.number().int().positive() }),
  seq: z.number().int().min(0).max(5000),
  events: z.array(Event).min(1).max(200),
});
export type PlayBatch = z.infer<typeof PlayBatch>;

/** The most a batch may weigh (a move's changes are small; a cleared Nonogram is the big one). */
export const MAX_BATCH_BYTES = 64 * 1024;

/** A batch, checked, or why not. */
export function checkBatch(body: unknown, bytes: number): { ok: true; batch: PlayBatch } | { ok: false; error: string } {
  if (bytes > MAX_BATCH_BYTES) return { ok: false, error: "Too big." };
  const parsed = PlayBatch.safeParse(body);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ").slice(0, 300) };
  return { ok: true, batch: parsed.data };
}

/** Whether the batch ends the play with a solve. */
export const solvedIn = (b: PlayBatch) => b.events.some((e) => e[1] === "s");
