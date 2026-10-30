// A puzzle's assessment by the deduction solver (puzzles/difficulty/assess.ts), as the site takes
// it: sent with an AI creator's post (`meta.assessment`, POST /admin/ai/schedule and backfill) or
// by the batch that assesses newly published puzzles (POST /admin/assessments). Each is kept in the
// `assessments` table; the quality is logged and never shown. A finished solve's difficulty
// replaces the rough estimate from size and clue density (./estimate.ts), keeping its minutes
// formula and taking its level from the type's SOLVER_CUTS; an unfinished one leaves the rough
// estimate. Pure, so it's unit-tested
// (tests/unit/assessment.test.ts).
import { z } from "zod";
import { estimate, levelOf, minutesOf, SOLVER_CUTS, type Estimate } from "./estimate";
import type { GridSpec } from "~site/engine/types.ts";

export const Assessment = z.object({
  version: z.number().int().min(1),
  solved: z.boolean(),
  estimate: z.number().min(0).max(1).nullable(),
  quality: z.number().min(0).max(1),
  flags: z.array(z.string().max(400)).max(40),
  measures: z.record(z.string(), z.number().nullable()),
  ms: z.number().int().min(0).optional(),
});
export type Assessment = z.infer<typeof Assessment>;

/** An assessment out of a post's `meta`, or null if it has none (or a malformed one). */
export function assessmentOf(meta: Record<string, unknown> | undefined): Assessment | null {
  const parsed = Assessment.safeParse(meta?.assessment);
  return parsed.success ? parsed.data : null;
}

/** The game's difficulty, level and minutes: the solver's difficulty when its solve finished, else
 *  `fallback` (a scorer's difficulty, or none: the rough estimate). */
export function estimateWith(kind: string, spec: Pick<GridSpec, "size" | "givens" | "rules" | "figure">, a: Assessment | null, fallback?: number | null): Estimate {
  if (a?.solved && a.estimate != null) {
    const cells = spec.figure ? spec.figure.pieces.length : spec.size[0] * spec.size[1];
    const d = Math.round(a.estimate * 100) / 100;
    return { difficulty: d, level: levelOf(d, SOLVER_CUTS[kind]), minutes: minutesOf(cells, d) };
  }
  return estimate(kind, spec, fallback);
}

/** The row to store. */
export const assessmentRow = (gameId: string, source: "generator" | "batch", a: Assessment) => ({
  gameId, version: a.version, source, solved: a.solved, estimate: a.estimate, quality: a.quality, flags: a.flags, measures: a.measures, ms: a.ms ?? null,
});
