// The failure flash, after The Witness: when the player has clearly finished but the puzzle is
// wrong, what breaks the rules pulses in a red wash for a moment and fades, and nothing is said.
// The player learns the rule from the flash, not from a message. This module is the logic, pure
// and unit-tested (tests/unit/flash.test.ts); the players (game.ts, shaped.ts, figure.ts) draw it.
//
//   familyOf(p)              which kind of "finished" a puzzle has
//   isDone(p, b, family)     has the player finished? (never for shading puzzles: no moment to
//                            trust, and a count would give the answer away)
//   flashTargets(p, b, ps)   the problems as data-flash tokens: the elements that carry them pulse
//   flashStep(state, now)    fire once per "done" moment, never mid-gesture or once solved
//
// Tokens (each board element names what it draws in a `data-flash` attribute, space separated):
//   cell:i     a cell's clue, symbol, digit or piece, and the cell itself (washed)
//   border:e   a stretch of grid line: a drawn line or wall, a sign on it
//   link:l     a segment between two cell centres (a loop's river, a lattice's path)
//   corner:v   a clue on a corner: a maze's number, a watchtower, a panel's dot
//   dot:e      a panel's dot on a stretch of grid line
//   edge:k     a clue outside the grid (p.edgeClues[k])
import { regionsOf } from "../../engine/derive.ts";
import { endsOf, startsOf } from "../../engine/panel.ts";
import { blockFor } from "../../engine/rules.ts";
import type { Board, Problem, Puzzle } from "../../engine/types.ts";

/** How long a flash lasts, in ms (styles.css's --flash-time is the same). */
export const FLASH_MS = 1500;

export type Family = "line" | "loop" | "fill" | "regions" | "figure" | "shade";

const has = (p: Puzzle, rule: string) => p.rules.some((s) => s.rule === rule);

/** Which kind of "done" a puzzle has. */
export function familyOf(p: Puzzle): Family {
  if (p.figure) return "figure";
  if (has(p, "panel-line") || has(p, "path") || has(p, "perfect-maze") || has(p, "distance-path")) return "line";
  if (has(p, "loop") || has(p, "links")) return "loop";
  if (p.marks.includes("digit") || p.marks.includes("paint")) return "fill";
  if (p.marks.includes("regions") || has(p, "shaded-per-line")) return "regions";
  return "shade";
}

const cellsOf = (p: Puzzle) => Array.from({ length: p.grid.cellCount }, (_, i) => i);
const open = (p: Puzzle) => cellsOf(p).filter((i) => !p.blocked.has(i));

/** Has the player finished, so that a wrong board deserves a flash? */
export function isDone(p: Puzzle, b: Board, family: Family = familyOf(p)): boolean {
  switch (family) {
    case "line": return lineDone(p, b);
    case "loop": return loopDone(p, b);
    case "fill": return fillDone(p, b);
    case "regions": return regionsDone(p, b);
    case "figure": return b.color.every((c) => c > 0);
    default: return false;
  }
}

/** Line types: the line has reached its end (a panel's end, a path's way out), a maze's numbers
 *  all have their walls, a lattice's path joins every dot. */
function lineDone(p: Puzzle, b: Board): boolean {
  const g = p.grid;
  const panel = p.rules.find((s) => s.rule === "panel-line");
  if (panel) {
    const ends = new Set(endsOf(p)), want = panel.symmetry ? 2 : 1;
    let reached = 0;
    for (const { v } of startsOf(p)) {
      const path = [v];
      for (;;) {
        const u = path[path.length - 1];
        const next = g.cornerBorders[u].filter((e) => b.fence[e] === 1).map((e) => g.borders[e].corners.find((w) => w !== u)!).find((w) => !path.includes(w));
        if (next === undefined) break;
        path.push(next);
      }
      if (path.length > 1 && ends.has(path[path.length - 1])) reached++;
    }
    return reached >= want;
  }
  if (has(p, "path")) {
    const door = (role: string) => { const e = [...p.doors].find(([, r]) => r === role)?.[0]; return e === undefined ? -1 : g.borders[e].cells.find((c) => c >= 0) ?? -1; };
    const from = door("in"), to = door("out");
    if (from < 0 || to < 0) return false;
    const seen = new Set([from]), stack = [from];
    while (stack.length) for (const l of g.cellLinks[stack.pop()!]) if (b.loop[l] === 1) for (const c of g.links[l].cells) if (!seen.has(c)) { seen.add(c); stack.push(c); }
    return seen.has(to);
  }
  if (has(p, "perfect-maze")) {
    const counts = [...p.cornerGivens].flatMap(([v, gs]) => gs.filter((x) => x.kind === "count").map((x) => [v, (x as { value: number }).value] as const));
    return counts.length > 0 && counts.every(([v, n]) => g.cornerBorders[v].filter((e) => b.fence[e] === 1).length === n);
  }
  if (has(p, "distance-path")) {
    const drawn = g.links.filter((l) => b.loop[l.id] === 1);
    const touched = new Set(drawn.flatMap((l) => l.cells));
    return p.pegs.length > 1 && drawn.length === p.pegs.length - 1 && p.pegs.every((i) => touched.has(i));
  }
  return false;
}

/** Loops: the drawn line is one closed loop (every point on it joins two lines). Numberlink: every
 *  number has its one line and no line stops short. */
function loopDone(p: Puzzle, b: Board): boolean {
  const g = p.grid;
  if (has(p, "links")) {
    const nums = new Set([...p.cellGivens].filter(([, gs]) => gs.some((x) => x.kind === "number")).map(([i]) => i));
    const deg = (i: number) => g.cellLinks[i].filter((l) => b.loop[l] === 1).length;
    return nums.size > 0 && cellsOf(p).every((i) => (nums.has(i) ? deg(i) === 1 : deg(i) === 0 || deg(i) === 2));
  }
  const rule = p.rules.find((s) => s.rule === "loop");
  // the drawn segments as pairs of points: corners for a fence, cells for a loop through centres
  const edges: [number, number][] = rule?.of === "fence"
    ? g.borders.filter((e) => b.fence[e.id] === 1 && !p.doors.has(e.id)).map((e) => e.corners as [number, number])
    : g.links.filter((l) => b.loop[l.id] === 1).map((l) => l.cells as [number, number]);
  if (edges.length < 3) return false;
  const adj = new Map<number, number[]>();
  for (const [a, c] of edges) { adj.set(a, [...(adj.get(a) ?? []), c]); adj.set(c, [...(adj.get(c) ?? []), a]); }
  if ([...adj.values()].some((n) => n.length !== 2)) return false;
  const first = edges[0][0], seen = new Set([first]), stack = [first];
  while (stack.length) for (const n of adj.get(stack.pop()!)!) if (!seen.has(n)) { seen.add(n); stack.push(n); }
  return seen.size === adj.size;
}

/** Number fills and paint grids: every square that takes a value has one. */
function fillDone(p: Puzzle, b: Board): boolean {
  if (p.marks.includes("paint")) return open(p).every((i) => b.color[i] > 0);
  const letters = p.rules.find((s) => s.rule === "letters");
  // Easy as ABC: some squares stay empty; each row has its letters, so the count is the rules'
  if (letters) return b.digit.filter((d) => d > 0).length === p.digits * p.grid.rows;
  return open(p).every((i) => b.digit[i] > 0);
}

/** How many regions the rules ask for, where they say (null where they don't). */
export function expectedRegions(p: Puzzle): number | null {
  for (const s of p.rules) {
    if (s.rule === "region-count") return typeof s.is === "number" ? s.is : 2;
    if (s.rule === "shape-bank" && s.once) return p.bank.length;
    if (s.rule === "galaxies") return p.galaxies.length;
    if (s.rule === "one-each" && (s.of ?? "number") === "number") return [...p.cellGivens.values()].filter((gs) => gs.some((x) => x.kind === "number")).length;
    if (s.rule === "region-sum") {
      const target = typeof s.is === "number" ? s.is : 10;
      const total = [...p.cellGivens.values()].flat().reduce((a, x) => a + (x.kind === "number" ? x.value : 0), 0);
      if (total % target === 0) return total / target;
    }
  }
  return null;
}

/** Region types: every square painted; or every cut closed off and as many regions as the rules
 *  ask for (where they don't say, every region holding a number). Star Battle: every star placed. */
function regionsDone(p: Puzzle, b: Board): boolean {
  const g = p.grid;
  const stars = p.rules.find((s) => s.rule === "shaded-per-line");
  if (stars) return b.shade.filter((x) => x === 1).length === (Number(stars.n) || 1) * g.rows;
  const cells = open(p);
  if (cells.length && cells.every((i) => b.color[i] > 0)) return true;
  if (!b.cut.includes(1) && !b.color.some((c) => c > 0)) return false;   // rocks alone don't count
  const reg = regionsOf(p, b);
  if (reg.cells.length < 2) return false;
  // a cut that doesn't close anything off is still being drawn
  if (g.borders.some((e) => b.cut[e.id] === 1 && e.link >= 0 && reg.of[e.cells[0]] === reg.of[e.cells[1]] && reg.of[e.cells[0]] >= 0)) return false;
  const want = expectedRegions(p);
  if (want !== null) return reg.cells.length === want;
  return reg.cells.every((cs) => cs.some((i) => p.cellGivens.get(i)?.some((x) => x.kind === "number")));
}

/** The problems as data-flash tokens (see the top of this file). A cell's token flashes its clue
 *  or symbol and washes the cell; borders that are exactly a corner clue's (a maze's number, a
 *  panel's dots) flash that clue instead; clues outside the grid flash when their own check fails. */
export function flashTargets(p: Puzzle, b: Board, problems: Problem[]): string[] {
  const g = p.grid, out = new Set<string>();
  if (!problems.length) return [];
  const cornerClues = [...p.cornerGivens].filter(([, gs]) => gs.some((x) => x.kind === "count" || x.kind === "hexagon")).map(([v]) => v);
  const lineDots = [...p.lineGivens].filter(([, gs]) => gs.some((x) => x.kind === "hexagon")).map(([e]) => e);
  const towers = [...p.cornerGivens].filter(([, gs]) => gs.some((x) => x.kind === "watchtower")).map(([v]) => v);
  const around = (v: number) => {
    const [r, c] = g.cornerRC(v), cs: number[] = [];
    for (const [y, x] of [[r - 1, c - 1], [r - 1, c], [r, c - 1], [r, c]]) if (y >= 0 && x >= 0 && y < g.rows && x < g.cols) cs.push(g.cell(y, x));
    return cs;
  };
  const sameSet = (a: number[], c: number[]) => { const s = new Set(a); return s.size === new Set(c).size && c.every((x) => s.has(x)); };
  for (const pr of problems) {
    for (const i of pr.cells ?? []) out.add(`cell:${i}`);
    for (const l of pr.links ?? []) out.add(`link:${l}`);
    if (pr.cells?.length && g.kind === "square") for (const v of towers) if (sameSet(pr.cells, around(v))) out.add(`corner:${v}`);
    if (pr.borders?.length) {
      const set = new Set(pr.borders);
      const corners = g.kind === "square" ? cornerClues.filter((v) => g.cornerBorders[v].every((e) => set.has(e))) : [];
      const dots = lineDots.filter((e) => set.has(e));
      const covered = new Set([...corners.flatMap((v) => g.cornerBorders[v]), ...dots]);
      if (corners.length + dots.length && pr.borders.every((e) => covered.has(e))) {
        for (const v of corners) out.add(`corner:${v}`);
        for (const e of dots) out.add(`dot:${e}`);
      } else for (const e of pr.borders) out.add(`border:${e}`);
    }
  }
  // clues outside the grid: each one checked on its own
  const outside = p.rules.filter((s) => s.rule === "first-seen" || s.rule === "skyscrapers");
  if (outside.length) {
    const regions = () => regionsOf(p, b);
    p.edgeClues.forEach((c, k) => {
      const alone = { ...p, edgeClues: [c] };
      if (outside.some((s) => blockFor(s).check(s, alone, b, regions).length)) out.add(`edge:${k}`);
    });
  }
  return [...out];
}

/** The tokens an element carries, from its data-flash attribute. */
export const tokensOf = (attr: string | null | undefined) => (attr ? attr.split(/\s+/).filter(Boolean) : []);

/** Does an element carrying `attr` flash for these targets? */
export const flashes = (attr: string | null | undefined, targets: ReadonlySet<string>) => tokensOf(attr).some((t) => targets.has(t));

/** The board as a string, to tell one "done" board from another (pencil notes don't count). */
export const boardKey = (b: Board) => [b.shade, b.fence, b.loop, b.cut, b.color, b.digit].map((a) => a.join(",")).join("|");

export interface FlashState { last: string | null }
export interface FlashMoment { done: boolean; solved: boolean; busy: boolean; key: string }
export const flashStart = (now?: FlashMoment): FlashState => ({ last: now && now.done && !now.solved ? now.key : null });

/** Fire once per "done" moment: when a change reaches a done board that hasn't flashed yet. A
 *  gesture still in progress waits; a board that isn't done (or is solved) arms it again. */
export function flashStep(state: FlashState, now: FlashMoment): { state: FlashState; fire: boolean } {
  if (now.busy) return { state, fire: false };
  if (!now.done || now.solved) return { state: { last: null }, fire: false };
  if (state.last === now.key) return { state, fire: false };
  return { state: { last: now.key }, fire: true };
}
