// Where a player gets stuck in a puzzle, for its hint ladder (src/lib/hint-ladder.ts,
// docs/plan-generator-and-hints.md): the deduction solver solves it cheapest step first, and a
// reader who only takes steps up to the genre's easy ceiling stalls at each step that costs more.
// Each stall is a stuck point: its key step (what gets the reader moving again), the easy steps
// that follow it up to the next stall, and the marks those settle (on the player's board: how the
// page tells the player is past it).
import { makePuzzle } from "../../src/engine/puzzle.ts";
import type { GridSpec } from "../../src/engine/types.ts";
import type { KeyMark } from "../../src/lib/hint-ladder.ts";
import { cellsOfMark, type KeyStep, type Stuck, type StuckPoint } from "../../src/lib/hint-words.ts";
import { BANDS, deduce, type Fact } from "../difficulty/deduce.ts";
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

export type { Stuck, StuckPoint } from "../../src/lib/hint-words.ts";

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
export function marksOf(spec: GridSpec, steps: { facts: Fact[] }[]): KeyMark[] {
  const all = steps.flatMap((s) => s.facts).map((f) => boardMark(spec, f)).filter((m): m is KeyMark => !!m);
  const yes = all.filter(([layer, , v]) => layer === "digit" || layer === "color" || layer === "cut" || v === 1);
  return (yes.length ? yes : all).slice(0, MAX_MARKS);
}

/** A board's settled marks as the solver names them (shaded(3), line(12), digit(4,2), …): the
 *  creator's moves, for the solver to take where it can't go on by itself. */
export function markOfBoard(spec: GridSpec, layer: string, i: number, v: number): string | null {
  if (!v) return null;
  if (layer === "shade") return `shaded(${i})`;
  if (layer === "fence") return `fence(${i})`;
  if (layer === "loop") return `line(${i})`;
  if (layer === "digit") return `digit(${i},${v})`;
  if (layer === "color") return `paint(${i},${v})`;
  if (layer === "cut") { const l = makePuzzle(spec).grid.links.findIndex((x) => x.border === i); return l >= 0 ? `cut(${l})` : null; }
  return null;
}

interface PathStep { step: KeyStep; facts: Fact[]; clueCells: number[] }

/** The stuck points of a puzzle, in solve order. `creator`: the creator's moves, in the order they
 *  made them (solver mark names), taken one at a time wherever the solver can't go on by itself. */
export async function stuckPoints(spec: GridSpec, { ceiling = ceilingFor(spec.genre), budgetMs = 120_000, creator = [] as string[], onProgress = (_: number) => {} } = {}): Promise<Stuck> {
  const setup = await deduce(spec, { setupOnly: true, structure: true });
  const st = setup.structure!;
  const groups = new Map(st.groups.map((g) => [`${g.kind} (${g.label})`, g.cells]));
  const names = new Set(st.marks.map((m) => m.name));
  const known = new Set<string>((setup.initial ?? []).map((f) => f.slice(0, f.lastIndexOf("="))));
  const path: PathStep[] = [];
  let solved = false, creatorMoves = 0;
  const stopAt = Date.now() + budgetMs;
  for (;;) {
    const r = await deduce(spec, { finish: true, budgetMs: Math.max(5_000, stopAt - Date.now()), from: [...known] });
    for (const s of r.path) {
      if (s.choice) continue;
      for (const f of s.facts) known.add(f.mark);
      path.push({ step: { where: s.where, cells: s.cells, facts: s.facts, uses: s.uses, clues: s.because?.clues ?? [], tier: s.tier, cost: s.cost },
        facts: s.facts, clueCells: [...new Set((s.because?.clues ?? []).flatMap((c) => groups.get(c) ?? []))] });
    }
    onProgress(known.size / Math.max(1, st.marks.length));
    if (r.profile.solved) { solved = true; break; }
    // stalled, or out of time: the creator's next move the solver doesn't have yet
    const next = creator.find((m) => names.has(m) && !known.has(m));
    if (!next || Date.now() >= stopAt) break;
    creatorMoves++;
    known.add(next);
    const fact = { mark: next, value: true, text: next };
    path.push({ step: { where: "the creator's move", cells: cellsOfMark(spec, next), facts: [fact], uses: [], clues: [], tier: 3, cost: Infinity, by: "creator" }, facts: [fact], clueCells: [] });
  }
  // the reader stalls before every step over the ceiling; a run of them is one stall (what
  // follows the first is still hard, but it's the same place in the solve). A case split, search or
  // the creator's own move is always past the reader (Masyu's difficulty is in case splits:
  // research-masyu-difficulty-2026-10-24.md), whatever it costs
  const hard = (s: KeyStep) => s.cost > ceiling || s.tier >= 2;
  const steps = path.map((p) => p.step);
  let starts = steps.map((s, i) => (hard(s) && !(i > 0 && hard(steps[i - 1])) ? i : -1)).filter((i) => i >= 0);
  if (starts.length < MIN_POINTS) {
    const extra = steps.map((s, i) => [s.cost, i] as const).filter(([, i]) => !starts.includes(i)).sort((a, b) => b[0] - a[0]).slice(0, MIN_POINTS - starts.length).map(([, i]) => i);
    starts = [...starts, ...extra].sort((a, b) => a - b);
  }
  // too many: the creator's moves first (the solver can't word those), then the dearest
  const weight = (i: number) => (steps[i].by === "creator" ? 1e9 : steps[i].cost);
  if (starts.length > MAX_POINTS) starts = [...starts].sort((a, b) => weight(b) - weight(a)).slice(0, MAX_POINTS).sort((a, b) => a - b);
  let settled = 0;
  const before = path.map((p) => { const n = settled; settled += p.facts.length; return n; });
  const points = starts.map((i, k): StuckPoint => {
    const end = k + 1 < starts.length ? starts[k + 1] : path.length;
    const finite = { ...steps[i], cost: Number.isFinite(steps[i].cost) ? steps[i].cost : 99 };
    return { key: finite, progress: settled ? before[i] / settled : 0, marks: marksOf(spec, path.slice(i, end)), clueCells: path[i].clueCells };
  });
  return { solved, points, rows: st.rows, cols: st.cols, ...(creatorMoves ? { creatorMoves } : {}) };
}
