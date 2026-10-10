// How hard a puzzle is and roughly how long it takes: Explore's three dots and "~N min".
//
// A cheap estimate from the puzzle alone, worked out on the server whenever a sketch is saved
// (games.server.ts, ai.server.ts) and kept in `games.difficulty`, `level` and `minutes`:
//
//   difficulty d (0..1) = 0.12 + 0.45 · size + 0.25 · sparseness + 0.06 · (rules beyond the first) + the type's lean
//     size        how big the board is: 0 at 4×4 (16 cells), 1 at 10×10 (100 cells) and above
//     sparseness  how few clues it gives, against what's usual for its type: 0 at the usual
//                 density or more, 1 with none (types whose clues aren't givens count as 0.5)
//     lean        a small nudge per type, for types that are harder or easier than their size says
//   level   1 below 0.4, 2 below 0.62, 3 above (easy, medium, hard)
//   minutes cells · (0.06 + 0.5 · d²), at least 1 and at most 90
//
// An AI creator's post brings its scorer's difficulty (puzzles/ai/score.ts, the `meta` of
// POST /admin/ai/schedule), which is used instead of the estimate's d. It's rough, and the
// cards say "~": the deduction solver (puzzles/difficulty, `estimateDifficulty`) can replace
// `estimate` here later, keeping the same output, and real solve times can tune the minutes.
// Pure, so it's unit-tested (tests/unit/explore-rank.test.ts).
import type { GridSpec } from "~site/engine/types.ts";

export interface Estimate {
  /** 0 (a warm-up) to 1 */
  difficulty: number;
  /** 1 easy, 2 medium, 3 hard */
  level: 1 | 2 | 3;
  /** a rough time to solve, in minutes */
  minutes: number;
}

/** Clues per cell that's usual for a type (most givens are clues); anything not listed is 0.3. */
const USUAL_DENSITY: Record<string, number> = {
  sudoku: 0.38, "thermo-sudoku": 0.2, "irregular-sudoku": 0.35, akari: 0.25, masyu: 0.22, slitherlink: 0.45, nurikabe: 0.18,
  "star-battle": 0.02, hitori: 1, skyscrapers: 0.3, kakuro: 0.3, "spiral-galaxies": 0.15, numberlink: 0.2, shikaku: 0.15,
  hidoku: 0.3, fillomino: 0.4, minesweeper: 0.3, cave: 0.2, aquarium: 0.25, panel: 0.25,
};
/** Types whose puzzle isn't its givens (a picture, areas, a figure): sparseness can't be read. */
const NO_GIVENS = new Set(["nonogram", "star-battle", "aquarium", "abstract-art", "binary-puzzle", "coats"]);
/** A small nudge for types harder or easier than their size says. */
const LEAN: Record<string, number> = {
  "star-battle": 0.1, "spiral-galaxies": 0.06, slitherlink: 0.05, nurikabe: 0.05, "wittgenstein-briquet": 0.06, "irregular-sudoku": 0.04,
  "simple-loop": -0.1, "simple-path": -0.1, maze: -0.15, panel: -0.05, panes: -0.05, "pythagorean-paths": -0.05, "connect-the-critters": -0.05,
};
/** Givens that are structure rather than clues. */
const STRUCTURE = new Set(["start", "end", "block", "wall", "gap", "door", "bank", "lengths"]);

const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const round2 = (x: number) => Math.round(x * 100) / 100;

export const levelOf = (d: number): 1 | 2 | 3 => (d < 0.4 ? 1 : d < 0.62 ? 2 : 3);
export const minutesOf = (cells: number, d: number) => Math.min(90, Math.max(1, Math.round(cells * (0.06 + 0.5 * d * d))));

/** The estimate for a puzzle of type `kind`; `scored` is a scorer's difficulty (0..1), if it has one. */
export function estimate(kind: string, spec: Pick<GridSpec, "size" | "givens" | "rules" | "figure">, scored?: number | null): Estimate {
  const cells = spec.figure ? spec.figure.pieces.length : spec.size[0] * spec.size[1];
  let d: number;
  if (typeof scored === "number" && Number.isFinite(scored)) d = clamp(scored);
  else {
    const size = clamp((cells - 16) / (100 - 16));
    const clues = (spec.givens ?? []).filter((g) => !STRUCTURE.has(g.kind)).length;
    const sparse = NO_GIVENS.has(kind) || !clues ? 0.5 : clamp(1 - clues / cells / (USUAL_DENSITY[kind] ?? 0.3));
    const rules = Math.max(0, (spec.rules ?? []).length - 1);
    d = clamp(0.12 + 0.45 * size + 0.25 * sparse + 0.06 * Math.min(rules, 3) + (LEAN[kind] ?? 0));
  }
  return { difficulty: round2(d), level: levelOf(d), minutes: minutesOf(cells, d) };
}
