// Where a player gets stuck in a puzzle, for its hint ladder (src/lib/hint-ladder.ts,
// docs/plan-generator-and-hints.md): the deduction solver solves it cheapest step first, and a
// reader who only takes steps up to the genre's easy ceiling stalls at each step that costs more.
// Each stall is a stuck point: its key step (what gets the reader moving again), the easy steps
// that follow it up to the next stall, and the marks those settle (on the player's board: how the
// page tells the player is past it).
import { makePuzzle } from "../../src/engine/puzzle.ts";
import type { GridSpec } from "../../src/engine/types.ts";
import type { KeyMark } from "../../src/lib/hint-ladder.ts";
import { BANDS, deduce, type Fact, type Step } from "../difficulty/deduce.ts";
import CEILINGS from "./ceilings.json" with { type: "json" };

/** the reader's ceiling when a genre has none of its own: the solver's "medium" band */
export const DEFAULT_CEILING = BANDS[1][0];
/** Per type, the reader's ceiling (ceilings.ts): the 0.6 quantile of step costs on the solver's
 *  path, as walkthrough-loop.ts calibrates it, so a hard type's routine steps don't count as stuck. */
export const ceilingFor = (genre: string | undefined): number => (CEILINGS.ceilings as Record<string, number>)[genre ?? ""] ?? DEFAULT_CEILING;
/** at most this many stuck points (the costliest kept, in solve order), and at least this many (the
 *  costliest steps, when the reader stalls less often) */
export const MAX_POINTS = 6, MIN_POINTS = 2;
const MAX_MARKS = 16;

export interface Found {
  /** the key step, and the steps that follow it before the next stuck point */
  key: Step;
  after: Step[];
  /** how far through the solve it comes: the share of the answer's marks settled before it */
  progress: number;
  /** the board marks a player past it has made */
  marks: KeyMark[];
  /** the cells of the rule instances its explanation uses (deduce.ts groups) */
  clueCells: number[];
}

export interface Stuck { solved: boolean; points: Found[]; rows: number; cols: number; marks: number; ceiling: number }

/** A fact as a mark on the player's board, at its value; null for what the board can't show. Dots
 *  and crosses (a "no") count only where nothing positive is settled. */
export function boardMark(spec: GridSpec, f: Fact): KeyMark | null {
  const dm = /^(digit|paint)\((\d+),(\d+)\)$/.exec(f.mark);
  if (dm) return f.value ? [dm[1] === "digit" ? "digit" : "color", Number(dm[2]), Number(dm[3])] : null;
  const m = /^(\w+)\((\d+)\)$/.exec(f.mark);
  if (!m) return null;
  const i = Number(m[2]);
  if (m[1] === "shaded") return ["shade", i, f.value ? 1 : 2];
  if (m[1] === "fence") return ["fence", i, f.value ? 1 : 2];
  if (m[1] === "line") return ["loop", i, f.value ? 1 : 2];
  if (m[1] === "cut") return f.value ? ["cut", makePuzzle(spec).grid.links[i].border, 1] : null;
  return null;
}

/** The marks that tell a player is past a stuck point: what it and the steps after settle, the
 *  "yes" marks first (players often leave the "no"s blank), at most MAX_MARKS. */
export function marksOf(spec: GridSpec, steps: Step[]): KeyMark[] {
  const all = steps.flatMap((s) => s.facts).map((f) => boardMark(spec, f)).filter((m): m is KeyMark => !!m);
  const yes = all.filter(([layer, , v]) => layer === "digit" || layer === "color" || layer === "cut" || v === 1);
  return (yes.length ? yes : all).slice(0, MAX_MARKS);
}

/** The stuck points of a puzzle, in solve order. */
export async function stuckPoints(spec: GridSpec, { ceiling = ceilingFor(spec.genre), budgetMs = 120_000 } = {}): Promise<Stuck> {
  const setup = await deduce(spec, { setupOnly: true, structure: true });
  const st = setup.structure!;
  const groups = new Map(st.groups.map((g) => [`${g.kind} (${g.label})`, g.cells]));
  const r = await deduce(spec, { finish: true, budgetMs });
  const path = r.path.filter((s) => !s.choice);
  // the reader stalls before every step over the ceiling; a run of them is one stall (what
  // follows the first is still hard, but it's the same place in the solve)
  // a case split or search is always past the reader (Masyu's difficulty is in them: research-masyu-
  // difficulty-2026-10-24.md), whatever it costs
  const hard = (s: Step) => s.cost > ceiling || s.tier >= 2;
  let starts = path.map((s, i) => (hard(s) && !(i > 0 && hard(path[i - 1])) ? i : -1)).filter((i) => i >= 0);
  if (starts.length < MIN_POINTS) {
    const extra = path.map((s, i) => [s.cost, i] as const).filter(([, i]) => !starts.includes(i)).sort((a, b) => b[0] - a[0]).slice(0, MIN_POINTS - starts.length).map(([, i]) => i);
    starts = [...starts, ...extra].sort((a, b) => a - b);
  }
  if (starts.length > MAX_POINTS) starts = [...starts].sort((a, b) => path[b].cost - path[a].cost).slice(0, MAX_POINTS).sort((a, b) => a - b);
  let settled = 0;
  const before = path.map((s) => { const n = settled; settled += s.facts.length; return n; });
  const points = starts.map((i, k): Found => {
    const end = k + 1 < starts.length ? starts[k + 1] : path.length;
    const key = path[i], after = path.slice(i + 1, end);
    return {
      key, after, progress: settled ? before[i] / settled : 0, marks: marksOf(spec, [key, ...after]),
      clueCells: [...new Set((key.because?.clues ?? []).flatMap((c) => groups.get(c) ?? []))],
    };
  });
  return { solved: r.profile.solved, points, rows: st.rows, cols: st.cols, marks: st.marks.length, ceiling };
}
