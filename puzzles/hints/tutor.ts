// What the tutor (app/components/TutorPanel.tsx) knows about a player's board when they ask: the
// marks that are wrong, and the moves open from where they are, cheapest first, as the deduction
// solver finds them. The tutor's model words these; it never decides what's true itself.
import type { GridSpec } from "../../src/engine/types.ts";
import { makePuzzle } from "../../src/engine/puzzle.ts";
import { type BoardLike, type BoardRead, cellsOfMark, focusOf, type KeyMark, LAYERS, type Mistake, type TutorMove } from "../../src/lib/tutor.ts";
import { deduce, type Fact } from "../difficulty/deduce.ts";

export type { BoardRead, Mistake, TutorMove } from "../../src/lib/tutor.ts";

/** at most this many moves go to the tutor */
const MAX_MOVES = 6;

/** A fact as a mark on the player's board, at its value; null for what the board can't show. */
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

/** A board's mark as the solver names it (shaded(3), line(12), digit(4,2), …). */
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

/** The marks on a board, as [layer, index, value]. */
export function marksOn(board: BoardLike): KeyMark[] {
  const out: KeyMark[] = [];
  for (const layer of LAYERS) {
    const a = board[layer] as ArrayLike<number> | undefined;
    if (a && typeof a.length === "number") for (let i = 0; i < a.length; i++) if (Number.isInteger(a[i]) && a[i] > 0) out.push([layer, i, a[i]]);
  }
  return out;
}

const rc = (cols: number) => (c: number) => `r${Math.floor(c / cols) + 1}c${(c % cols) + 1}`;

/** A wrong mark, said plainly (for the model: it names the cells, the player never sees this). */
function mistakeText([layer, , v]: KeyMark, cells: string[]): string {
  const at = cells.join(" and ");
  if (layer === "loop") return v === 1 ? `a line between ${at} that isn't in the answer` : `a cross between ${at}, but the line does run there`;
  if (layer === "fence") return v === 1 ? `a wall between ${at} that isn't in the answer` : `a cross between ${at}, but there is a wall there`;
  if (layer === "shade") return v === 1 ? `${at} shaded, but it isn't` : `${at} marked unshaded, but it is shaded`;
  if (layer === "digit") return `${v} in ${at}, which is wrong`;
  if (layer === "color") return `colour ${v} in ${at}, which is wrong`;
  return `a cut between ${at} that isn't in the answer`;
}

/** Read a player's board: what's wrong on it, and the cheapest moves open from its right marks
 *  (a case split when nothing simpler is). */
export async function readBoard(spec: GridSpec, board: BoardLike, { budgetMs = 30_000 } = {}): Promise<BoardRead> {
  const cols = spec.size[1], rows = spec.size[0], cell = rc(cols);
  const placed = marksOn(board).map((m) => ({ m, name: markOfBoard(spec, m[0], m[1], m[2]) })).filter((x): x is { m: KeyMark; name: string } => !!x.name);
  let r = await deduce(spec, { menus: [placed.map((x) => x.name)], structure: true, budgetMs });
  const answer = new Set(r.answer ?? []);
  const yes = (l: string, v: number) => l === "digit" || l === "color" || l === "cut" || v === 1;
  const wrong = placed.filter(({ m, name }) => yes(m[0], m[2]) !== answer.has(name));
  const right = placed.filter((x) => !wrong.includes(x)).map((x) => x.name);
  // with wrong marks: what's open from the right ones alone (the first read took every mark at
  // its true value), which also tells a guess from a mark the board already rules out
  if (wrong.length) r = await deduce(spec, { menus: [right], structure: true, budgetMs, answer: r.answer });
  const menu = r.menus?.[0] ?? [];
  const mistakes: Mistake[] = wrong.map(({ m, name }) => {
    const cells = cellsOfMark(spec, name), against = menu.filter((s) => s.facts.some((f) => f.mark === name)).sort((a, b) => a.cost - b.cost)[0];
    return { mark: name, cells, text: mistakeText(m, cells.map(cell)), ruledOut: !!against, ...(against ? { why: against.because?.clues ?? [] } : {}) };
  });
  const groups = new Map((r.structure?.groups ?? []).map((g) => [`${g.kind} (${g.label})`, g.cells]));
  const moveOf = (s: { where: string; cells: number[]; facts: Fact[]; cost: number; tier: number; because?: { clues: string[] } }): TutorMove => {
    const clues = s.because?.clues ?? [];
        return {
      where: s.where, cells: s.cells, facts: s.facts, cost: s.cost, tier: s.tier, clues,
      clueCells: [...new Set(clues.flatMap((c) => groups.get(c) ?? []))],
      focus: focusOf(spec, s, rows, cols), marks: s.facts.map((f) => boardMark(spec, f)).filter((x): x is KeyMark => !!x),
    };
  };
  // each move once (several windows can find the same facts: the cheapest stays)
  const seen = new Set<string>();
  let moves = menu.slice().sort((a, b) => a.cost - b.cost)
    .filter((s) => { const k = s.facts.map((f) => `${f.mark}=${f.value}`).sort().join(" "); return !seen.has(k) && (seen.add(k), true); })
    .slice(0, MAX_MOVES).map(moveOf);
  let done = false;
  if (!moves.length) {
    // nothing simple is open: the solver's next step from here (a case split), or the end
    const on = await deduce(spec, { from: right, finish: true, budgetMs, answer: r.answer });
    const first = on.path.find((s) => !s.choice);
    if (first) moves = [moveOf(first)];
    else done = on.profile.solved;
  }
  return { mistakes, moves, done };
}
