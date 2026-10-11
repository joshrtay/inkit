// The Sudoku technique solver's loop and profile. Always applies the easiest technique there is
// (singles first), records each step, and sums the solve up: steps by technique, the hardest one
// (SE-style rating = its number), a weighted effort, Pelánek's dependency (how many single moves
// are open at each step) and refutation length (docs/research-sudoku-difficulty.md), and one
// 0..1 estimate. See docs/sudoku-techniques.md.
import { solutions } from "./brute.ts";
import { bit, boardOf, cellName, type Board, type SudokuPuzzle } from "./grid.ts";
import { apply, nextStep, singleMoves, TECHNIQUES, type Context, type Step, type Technique } from "./techniques.ts";

export interface Profile {
  solved: boolean;
  /** exactly one solution (false: none or several; unique rectangles are then off) */
  unique: boolean;
  n: number;
  givens: number;
  steps: number;
  placements: number;
  eliminations: number;
  /** steps per technique, in the order first used */
  byTechnique: Record<string, number>;
  hardest: string;
  /** the hardest step's rating: the SE-style rating of the puzzle */
  se: number;
  /** Σ 2^(se − 1.2) over the steps: a hidden single 1, a naked single about 2, an XY-Wing 8,
   *  a forcing chain 80 or more */
  effort: number;
  /** single moves (full house, hidden or naked single: distinct cells) open before a step: at the
   *  start, and on average over the first DEPENDENCY_STEPS steps. Few means each step depends on
   *  the one before (Pelánek's dependency; harder) */
  dependency: { start: number; mean: number };
  trials: number;
  /** total length of the trial steps' refutations (Pelánek's refutation sum, from our shortest
   *  refutations rather than his random runs) */
  refutation: number;
  ms: number;
  /** 0 (trivial) .. 1 (very hard): see estimateOf */
  estimate: number;
  notes: string[];
}

export interface Options {
  /** throw if a step removes a true candidate or places a wrong digit (tests) */
  check?: boolean;
  techniques?: Technique[];
}

export const DEPENDENCY_STEPS = 25;
/** the techniques that assume a candidate and refute it */
export const TRIALS = new Set(["Forcing chain", "Dynamic forcing chain", "Trial and error"]);
export const stepWeight = (se: number) => 2 ** (se - 1.2);

export function rate(puzzle: SudokuPuzzle, opts: Options = {}): { path: Step[]; profile: Profile; board: Board } {
  const t0 = performance.now();
  const board = boardOf(puzzle.shape, puzzle.givens);
  const found = solutions(board, 2);
  const notes: string[] = [];
  if (!found.length) notes.push("no solution");
  if (found.length > 1) notes.push("more than one solution");
  const ctx: Context = { unique: found.length === 1 };
  const solution = found.length === 1 ? found[0] : null;
  const path: Step[] = [], options: number[] = [];
  const s = puzzle.shape;
  while (found.length && board.value.some((d) => !d)) {
    if (path.length < DEPENDENCY_STEPS) options.push(singleMoves(board).size);
    const st = nextStep(board, ctx, opts.techniques);
    if (!st) { notes.push(`stuck after ${path.length} steps`); break; }
    if (opts.check && solution) {
      for (const [c, d] of st.remove) if (solution[c] === d) throw new Error(`${st.technique} removed ${d} from ${cellName(s, c)}, the answer there: ${st.text}`);
      for (const [c, d] of st.place) if (solution[c] !== d) throw new Error(`${st.technique} placed ${d} in ${cellName(s, c)}, not the answer: ${st.text}`);
    }
    if (!st.place.length && !st.remove.some(([c, d]) => board.cand[c] & bit(d))) throw new Error(`${st.technique} changed nothing: ${st.text}`);
    apply(board, st);
    path.push(st);
  }
  const solved = board.value.every((d) => d) && (!solution || board.value.every((d, c) => d === solution[c]));
  return { path, board, profile: profileOf(puzzle, path, solved, ctx.unique, options, Math.round(performance.now() - t0), notes) };
}

export function profileOf(puzzle: SudokuPuzzle, path: Step[], solved: boolean, unique: boolean, options: number[], ms: number, notes: string[]): Profile {
  const byTechnique: Record<string, number> = {};
  for (const st of path) byTechnique[st.technique] = (byTechnique[st.technique] ?? 0) + 1;
  const top = path.reduce<Step | null>((a, st) => (!a || st.se > a.se ? st : a), null);
  const trials = path.filter((st) => TRIALS.has(st.technique));
  const p: Profile = {
    solved, unique, n: puzzle.shape.n, givens: puzzle.givens.filter((d) => d).length,
    steps: path.length, placements: path.reduce((a, st) => a + st.place.length, 0), eliminations: path.reduce((a, st) => a + st.remove.length, 0),
    byTechnique, hardest: top?.technique ?? "", se: top?.se ?? 0,
    effort: +path.reduce((a, st) => a + stepWeight(st.se), 0).toFixed(1),
    dependency: { start: options[0] ?? 0, mean: options.length ? +(options.reduce((a, x) => a + x, 0) / options.length).toFixed(2) : 0 },
    trials: trials.length, refutation: trials.reduce((a, st) => a + (st.length ?? 0), 0),
    ms, estimate: 0, notes,
  };
  p.estimate = estimateOf(p);
  return p;
}

/** One 0..1 number, to be calibrated against solving times:
 *    0.5 · hardest step  (SE 1.0 → 0, 8.5 and up → 1)
 *  + 0.35 · effort       (log₂(1 + effort): 3 → 0, 11 → 1; a 4 × 4 of singles is near 0, a 9 × 9
 *                         of singles about 0.4)
 *  + 0.15 · dependency   (1 / (1 + mean single moves open): one at a time → 0.5)
 *  An unsolved puzzle counts as at least 0.95. */
export function estimateOf(p: Pick<Profile, "se" | "effort" | "dependency" | "solved">): number {
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  const x = 0.5 * clamp((p.se - 1) / 7.5) + 0.35 * clamp((Math.log2(1 + p.effort) - 3) / 8) + 0.15 / (1 + p.dependency.mean);
  return +clamp(p.solved ? x : Math.max(x, 0.95)).toFixed(3);
}

export { TECHNIQUES };
