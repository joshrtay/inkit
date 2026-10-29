// One puzzle measured the way the generator plan's baseline compares makers (docs/plan-generator-and-
// hints.md, "G0"): our AI creators' posts, human-made puzzles, the old fleet and the Opus designer
// (./opus-design.ts) all go through here, so the comparison is like for like.
//
//   unique     clingo finds exactly one solution (panels: at least one)
//   assess     the site's assessment (difficulty estimate, quality score and flags: dull, guessing,
//              grind; puzzles/difficulty/assess.ts)
//   stuck      the hint ladder's stuck points (puzzles/hints/stuck.ts): how many, where the first
//              falls in the solve (0 = at the very start: no way in), how many distinct rules their
//              key steps use (one repeated = samey; the solver's rule names, a coarse stand-in for
//              techniques), and whether the solve finished
//   looks      clue density and symmetry (puzzles/difficulty/looks.ts)
//
// The human-likeness score needs the human-gap classifier, which is Python
// (puzzles/difficulty/human_gap.py score); gen-baseline.ts writes the records it reads.
import { makePuzzle, needsOneSolution } from "../../src/engine/puzzle.ts";
import { solve } from "../../src/engine/solve.ts";
import type { GridSpec } from "../../src/engine/types.ts";
import { assess, type Assessment } from "../difficulty/assess.ts";
import { looksOf, type Looks } from "../difficulty/looks.ts";
import { stuckPoints } from "../hints/stuck.ts";

export interface StuckShape { solved: boolean; points: number; firstAt: number | null; techniques: number; uses: string[] }
export interface Evaluation { unique: boolean; solutions: number; assess: Assessment | null; stuck: StuckShape | null; looks: Looks; ms: number }

/** How many solutions (up to 2), as the site's check counts them. */
export async function solutionsOf(spec: GridSpec): Promise<number> {
  return (await solve(makePuzzle(spec), 2)).length;
}
export const wantsOne = (spec: GridSpec) => needsOneSolution(spec.genre);

/** The stuck points' shape: the parts of a hint ladder that say something about the puzzle. */
export async function stuckShape(spec: GridSpec, budgetMs = 60_000): Promise<StuckShape> {
  const s = await stuckPoints(spec, { budgetMs });
  const uses = s.points.map((p) => p.key.uses[0] ?? (p.key.tier >= 2 ? "case split" : p.key.where));
  return { solved: s.solved, points: s.points.length, firstAt: s.points.length ? +s.points[0].progress.toFixed(2) : null, techniques: new Set(uses).size, uses };
}

export async function evaluate(spec: GridSpec, { stuckMs = 60_000 } = {}): Promise<Evaluation> {
  const t0 = Date.now();
  const solutions = await solutionsOf(spec);
  const unique = wantsOne(spec) ? solutions === 1 : solutions >= 1;
  if (!unique) return { unique, solutions, assess: null, stuck: null, looks: looksOf(spec), ms: Date.now() - t0 };
  const a = await assess(spec, { budgetMs: 30_000, capMs: 90_000, redundancy: true }).catch(() => null);
  const stuck = await stuckShape(spec, stuckMs).catch(() => null);
  return { unique, solutions, assess: a, stuck, looks: looksOf(spec), ms: Date.now() - t0 };
}
