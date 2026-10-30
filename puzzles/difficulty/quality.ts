// What makes a puzzle bad, read off the deduction solver's path (docs/research-review-2026-10-24.md,
// idea 5). Logic Masters' critical comments (lmd-faults.ts) cost beauty for, in order: dull (a rule
// or clue that does nothing) 23 points, not unique 16, guessing 12, rating off 11, grind 8. The
// solver can see three of them:
//
//   dull      a clue that does nothing: removing it leaves one solution (`redundant`, from
//             assess.ts), or a kind of clue or an added rule that does nothing: removing all of
//             it leaves one solution (`idle`). Both by uniqueness, not by the path: the solver's
//             record of which kinds a step used misses clues it reads at grounding
//   guessing  case splits on the path (tier 2 and 3 steps). In the types where the solver lacks
//             the techniques people use (SPLIT_GAP: most of people's moves there need a split
//             from the solver), or a solve that's mostly splits (SOLVER_GAP_SHARE), a split is
//             the solver's gap, not the puzzle's: logged, not counted
//   grind     a long run of easy steps that make up most of the solve
//
// Each sets a flag and takes something off a 0..1 score. The weights follow the order above but are
// provisional: they aren't fitted to likes or beauty yet. What counts is measured against human-made
// puzzles of the type (./quality-norms.json, from ./quality-norms.ts): a puzzle loses quality only
// for redundant clues beyond the human median share, and for a split share above the human 75th
// percentile; below that it's what people's puzzles have too, and the flag says so without a cost. The AI creators' generator uses the score
// (scorer.ts, withQualityChecks); every published puzzle's is logged on the site and not shown
// (assess.ts, POST /admin/assessments). Pure, so it's unit-tested (app/tests/unit/quality.test.ts).
import type { GridSpec } from "../../src/engine/types.ts";
import type { Profile, Step } from "./deduce.ts";
import NORMS from "./quality-norms.json" with { type: "json" };

/** Given kinds that are the board, not clues (a black square, a wall): never redundant. */
export const STRUCTURE = new Set(["block", "wall", "gap", "start", "end", "door", "bank", "lengths"]);

/** What human puzzles of a type have (pooled for a type with too few): the median share of clues
 *  that could go one at a time, and the 75th percentile share of solver steps that are splits. */
export function normFor(genre: string | undefined): { redundantShare: number; splitShare: number } {
  return (NORMS.types as Record<string, { redundantShare: number; splitShare: number }>)[genre ?? ""] ?? NORMS.pooled;
}

/** Types whose people's moves the solver mostly can't make without a split (human-misses: Hitori
 *  93%, Hidoku 85%, Numberlink 91%), or where its solves stall (Nurikabe, Spiral Galaxies,
 *  Fillomino): a split there says nothing about guessing. */
export const SPLIT_GAP = new Set(["hitori", "hidoku", "numberlink", "nurikabe", "spiral-galaxies", "fillomino"]);

/** A solve that's mostly splits says the solver can't read the type (on the examples: Sum Blobs,
 *  Panes and Polyomino Packing split on 80–100% of steps), not that the puzzle needs guessing. */
export const SOLVER_GAP_SHARE = 0.75;

/** What each fault takes off the score (provisional). */
export const PENALTY = {
  /** each clue that removing leaves one solution, up to `redundantMax` */
  redundant: 0.15, redundantMax: 0.5,
  /** each kind of clue or added rule that does nothing */
  idleKind: 0.3,
  /** any case split, plus this much more at a split share of 1 */
  split: 0.15, splitShare: 0.35,
  grind: 0.1,
};
/** A run of at least this many easy steps, making up at least `GRIND_SHARE` of the solve, is a grind. */
export const GRIND_RUN = 25, GRIND_SHARE = 0.85;
/** An easy step costs less than this (deduce.ts BANDS: medium from 3). */
export const EASY = 3;

export interface Quality {
  /** 0 (bad) .. 1 (nothing found) */
  score: number;
  /** what was found, one line each: "dull: …", "guessing: …", "grind: …", "unfinished: …" (and,
   *  costing nothing, "redundant: …" and "splits: …" within what human puzzles have) */
  flags: string[];
  measures: {
    /** clues that removing leaves one solution (null: not checked) */
    redundant: number | null;
    idleKinds: number | null;
    /** the share of the puzzle's rule instances the path's explanations cite (deduce.ts) */
    usage: number | null;
    splits: number; splitShare: number;
    easyRun: number; easyShare: number;
    steps: number; entryPoints: number;
  };
}

export interface QualityInput {
  spec: GridSpec;
  path: Step[];
  profile: Pick<Profile, "solved" | "entryPoints" | "notes">;
  usage?: { used: number; of: number };
  /** the clues (as "kind at r,c") that removing leaves one solution; undefined if not checked */
  redundant?: string[];
  /** the kinds of clue ("clue:number") and added rules that removing all of leaves one solution */
  idle?: string[];
}

const round = (x: number, d = 3) => +x.toFixed(d);

export function qualityOf({ spec, path, profile, usage, redundant, idle }: QualityInput): Quality {
  const flags: string[] = [];
  let off = 0;
  const real = path.filter((s) => !s.choice);

  const norm = normFor(spec.genre);

  // ---- dull ----
  if (redundant?.length) {
    // as many as a typical human puzzle of the type has go free
    const clues = (spec.givens ?? []).filter((g) => !STRUCTURE.has(g.kind)).length;
    const excess = redundant.length - Math.round(norm.redundantShare * clues);
    const list = `${redundant.slice(0, 4).join(", ")}${redundant.length > 4 ? ", …" : ""}`;
    if (excess > 0) {
      off += Math.min(PENALTY.redundantMax, PENALTY.redundant * excess);
      flags.push(`dull: ${redundant.length} clue${redundant.length > 1 ? "s" : ""} could go and it'd still have one solution (${list})`);
    } else flags.push(`redundant: ${redundant.length} clue${redundant.length > 1 ? "s" : ""} could go one at a time (${list}), no more than human ${spec.genre} puzzles have; not counted`);
  }
  if (idle?.length) {
    off += PENALTY.idleKind * idle.length;
    flags.push(`dull: ${idle.join(", ")} could all go and it'd still have one solution`);
  }

  // ---- guessing ----
  const splits = real.filter((s) => s.tier >= 2).length, splitShare = real.length ? splits / real.length : 0;
  if (splits) {
    if (SPLIT_GAP.has(spec.genre ?? "") || splitShare >= SOLVER_GAP_SHARE) flags.push(`splits: ${splits} of ${real.length} steps (the solver lacks this type's techniques; not counted)`);
    else if (splitShare <= norm.splitShare) flags.push(`splits: ${splits} of ${real.length} steps, no more than human ${spec.genre} puzzles need (the solver splits where people use a technique it lacks); not counted`);
    else {
      off += PENALTY.split + PENALTY.splitShare * splitShare;
      flags.push(`guessing: ${splits} of ${real.length} steps are case splits`);
    }
  }

  // ---- grind ----
  let run = 0, easyRun = 0;
  for (const s of real) { run = s.cost < EASY ? run + 1 : 0; easyRun = Math.max(easyRun, run); }
  const easyShare = real.length ? real.filter((s) => s.cost < EASY).length / real.length : 0;
  if (easyRun >= GRIND_RUN && easyShare >= GRIND_SHARE) {
    off += PENALTY.grind;
    flags.push(`grind: ${easyRun} easy steps in a row, ${Math.round(easyShare * 100)}% of the solve easy`);
  }

  if (!profile.solved) flags.push(`unfinished: ${profile.notes.find((n) => n.startsWith("out of") || n.startsWith("stuck")) ?? "the solver stopped"}`);

  return {
    score: round(Math.max(0, 1 - off)),
    flags,
    measures: {
      redundant: redundant ? redundant.length : null, idleKinds: idle ? idle.length : null,
      usage: usage?.of ? round(usage.used / usage.of) : null,
      splits, splitShare: round(splitShare), easyRun, easyShare: round(easyShare),
      steps: real.length, entryPoints: profile.entryPoints,
    },
  };
}
