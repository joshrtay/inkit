// The building blocks (docs/grid-engine.md). Each block does four jobs: check a board,
// encode itself for the solver (answer set programming, see solve.ts for the shared
// predicates it can use), describe itself in plain words, and say which derived
// structures it needs. A puzzle's rules are blocks with settings, e.g. { rule: "size", is: 4 }.
import type { Board, Problem, Puzzle, RuleSpec } from "./types.ts";
import { lineGraph, regionsOf, shadedGroups, shapeKey, type Regions } from "./derive.ts";
import { panelLine, panelSymbols } from "./panel.ts";

/** A nudge for the player: what to look at, and what it gives away. */
export interface Hint { message: string; area: number[]; cells: { cell: number; shade: 0 | 1 }[] }

export interface Block {
  /** plain words for the "How to play" card */
  describe(s: RuleSpec, p: Puzzle): string;
  /** problems on this board (none = the rule holds) */
  check(s: RuleSpec, p: Puzzle, b: Board, r: () => Regions): Problem[];
  /** clingo rules; may use the shared predicates from solve.ts */
  asp(s: RuleSpec, p: Puzzle): string;
  /** which shared encodings it needs */
  needs?: ("regions" | "shapes")[];
  /** the player shades the clue cells themselves (Hitori) */
  shadeClues?: boolean;
  /** an optional logical hint for the current board */
  hint?(s: RuleSpec, p: Puzzle, b: Board): Hint | null;
}

const numberClues = (p: Puzzle) => [...p.cellGivens].flatMap(([i, gs]) =>
  gs.filter((g) => g.kind === "number").map((g) => [i, g.value as number] as [number, number]));
const cornerClues = (p: Puzzle) => [...p.cornerGivens].flatMap(([v, gs]) =>
  gs.filter((g) => g.kind === "count").map((g) => [v, g.value as number] as [number, number]));
/** Each dotted cell with how many dots of each color it has. */
export const dotClues = (p: Puzzle) => [...p.cellGivens].flatMap(([i, gs]) => gs.filter((g) => g.kind === "dots").map((g) => {
  const need = new Map<number, number>();
  for (const c of g.value as number[]) need.set(c, (need.get(c) ?? 0) + 1);
  return [i, need] as [number, Map<number, number>];
}));
const neighbours = (p: Puzzle, i: number) => p.grid.cellLinks[i].map((l) => { const [a, c] = p.grid.links[l].cells; return a === i ? c : a; });
const PAINT_NAMES: Record<string, string> = { "#ef5a6a": "red", "#f7cf3d": "yellow", "#3fb0e6": "blue" };
/** A paint color's name: red / yellow / blue for Three Coats' pots, else "color n". */
export const colorName = (p: Puzzle, c: number) => PAINT_NAMES[(p.style.palette?.[c - 1] ?? ["#ef5a6a", "#f7cf3d", "#3fb0e6"][c - 1] ?? "").toLowerCase()] ?? `color ${c}`;
const colorList = (p: Puzzle) => {
  const names = Array.from({ length: p.style.palette?.length || 3 }, (_, k) => colorName(p, k + 1));
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names.at(-1)}` : names[0];
};
/** color-count's settings: { red, yellow, blue } for Three Coats' pots, or { c1, c2, ... }. */
const countsOf = (s: RuleSpec, p: Puzzle) => Array.from({ length: p.style.palette?.length || 3 }, (_, k) => k + 1)
  .map((c) => [c, s[colorName(p, c)] ?? s[`c${c}`]] as [number, unknown]).filter(([, n]) => typeof n === "number") as [number, number][];
const n = (s: RuleSpec) => (typeof s.n === "number" ? s.n : 1);
const shadedWord = (p: Puzzle, k: number) => (p.style.shaded === "star" ? (k === 1 ? "star" : "stars") : k === 1 ? "shaded cell" : "shaded cells");
/** The cells around a cell, corners included. */
const touching = (p: Puzzle, i: number) => {
  const g = p.grid, [r, c] = g.rc(i), out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++)
    if ((dr || dc) && r + dr >= 0 && c + dc >= 0 && r + dr < g.rows && c + dc < g.cols) out.push(g.cell(r + dr, c + dc));
  return out;
};
const other = (p: Puzzle, l: number, i: number) => { const [a, c] = p.grid.links[l].cells; return a === i ? c : a; };
/** The cells right around a grid point (in half-cell units): 1, 2 or 4 of them. */
export const galaxyCore = (p: Puzzle, [y, x]: [number, number]) => {
  const rs = y % 2 ? [(y - 1) / 2] : [y / 2 - 1, y / 2], cs = x % 2 ? [(x - 1) / 2] : [x / 2 - 1, x / 2];
  return rs.flatMap((r) => cs.map((c) => p.grid.cell(r, c)));
};
/** A cell turned halfway round a point, or -1 if that falls off the grid. */
const mirrorOf = (p: Puzzle, i: number, [y, x]: [number, number]) => {
  const g = p.grid, [r, c] = g.rc(i), r2 = (2 * y - (2 * r + 1) - 1) / 2, c2 = (2 * x - (2 * c + 1) - 1) / 2;
  return r2 >= 0 && c2 >= 0 && r2 < g.rows && c2 < g.cols ? g.cell(r2, c2) : -1;
};
const boxOf = (p: Puzzle, cs: number[]) => {
  const rs = cs.map((i) => p.grid.rc(i)[0]), ks = cs.map((i) => p.grid.rc(i)[1]);
  return [Math.max(...rs) - Math.min(...rs) + 1, Math.max(...ks) - Math.min(...ks) + 1];
};
/** The four links around each inner grid point: [top, bottom, left, right]. */
const quads = (p: Puzzle) => {
  const g = p.grid, out: [number, number, number, number][] = [];
  const link = (a: number, b: number) => g.borders[g.borderBetween(a, b)].link;
  for (let r = 0; r + 1 < g.rows; r++) for (let c = 0; c + 1 < g.cols; c++) {
    const A = g.cell(r, c), B = g.cell(r, c + 1), C = g.cell(r + 1, c), D = g.cell(r + 1, c + 1);
    out.push([link(A, B), link(C, D), link(A, C), link(B, D)]);
  }
  return out;
};
/** Rectangles: around each inner grid point, two cuts meeting at a right angle make a corner that
 *  points into a region: not allowed. (A lone cut is already ruled out: a cut separates two regions.) */
const cornerRule = (p: Puzzle) => `% a line between two holes counts as a border here (it's never cut, but no region crosses it)
rcut(L) :- cut(L).
rcut(L) :- adj(I,J,L), blocked(I), blocked(J).
` + quads(p).flatMap(([top, bottom, left, right]) =>
  [[top, left, bottom, right], [top, right, bottom, left], [bottom, left, top, right], [bottom, right, top, left]]
    .map(([x, y, u, v]) => `:- rcut(${x}), rcut(${y}), not rcut(${u}), not rcut(${v}).`)).join("\n");
const barLen = (s: RuleSpec) => (typeof s.length === "number" ? s.length : 3);
/** Every place a straight block of `len` cells fits (not on clue cells or rocks). */
const barPlacements = (p: Puzzle, len: number) => {
  const g = p.grid, out: number[][] = [], free = (r: number, c: number) => r < g.rows && c < g.cols && !p.cellGivens.has(g.cell(r, c));
  for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) {
    if (Array.from({ length: len }, (_, k) => free(r, c + k)).every(Boolean)) out.push(Array.from({ length: len }, (_, k) => g.cell(r, c + k)));
    if (len > 1 && Array.from({ length: len }, (_, k) => free(r + k, c)).every(Boolean)) out.push(Array.from({ length: len }, (_, k) => g.cell(r + k, c)));
  }
  return out;
};
/** Can these cells be split exactly into straight blocks of `len`? */
const tiles = (p: Puzzle, cells: Set<number>, len: number): boolean => {
  if (!cells.size) return true;
  const g = p.grid, first = Math.min(...cells), [r, c] = g.rc(first);
  for (const [dr, dc] of len > 1 ? [[0, 1], [1, 0]] : [[0, 1]]) {
    const piece = Array.from({ length: len }, (_, k) => [r + dr * k, c + dc * k]);
    if (piece.some(([y, x]) => y >= g.rows || x >= g.cols || !cells.has(g.cell(y, x)))) continue;
    const rest = new Set(cells); for (const [y, x] of piece) rest.delete(g.cell(y, x));
    if (tiles(p, rest, len)) return true;
  }
  return false;
};
/** Pairs of cells in one row or column holding the same number (Hitori). */
const sameLinePairs = (p: Puzzle) => {
  const num = new Map(numberClues(p)), out: [number, number][] = [];
  for (const line of linesOf(p)) for (let a = 0; a < line.length; a++) for (let b = a + 1; b < line.length; b++)
    if (num.has(line[a]) && num.get(line[a]) === num.get(line[b])) out.push([line[a], line[b]]);
  return out;
};
const linesOf = (p: Puzzle) => {
  const g = p.grid;
  return [...Array.from({ length: g.rows }, (_, r) => Array.from({ length: g.cols }, (_, c) => g.cell(r, c))),
    ...Array.from({ length: g.cols }, (_, c) => Array.from({ length: g.rows }, (_, r) => g.cell(r, c)))];
};
/** The cells of a row or column, from the side a clue outside the grid looks in from. */
export const rayIn = (p: Puzzle, cell: number, side: string) => {
  const g = p.grid, [r, c] = g.rc(cell);
  return side === "left" ? Array.from({ length: g.cols }, (_, x) => g.cell(r, x)) : side === "right" ? Array.from({ length: g.cols }, (_, x) => g.cell(r, g.cols - 1 - x))
    : side === "top" ? Array.from({ length: g.rows }, (_, y) => g.cell(y, c)) : Array.from({ length: g.rows }, (_, y) => g.cell(g.rows - 1 - y, c));
};
export const symbolOf = (p: Puzzle, d: number) => p.style.symbols?.[d - 1] ?? String(d);
const symbolList = (p: Puzzle) => { const all = Array.from({ length: p.digits }, (_, k) => symbolOf(p, k + 1)); return `${all.slice(0, -1).join(", ")} and ${all.at(-1)}`; };
/** The cells a cell sees along its row and column, up to a blocked cell or the edge. */
const sees = (p: Puzzle, i: number) => {
  const g = p.grid, [r, c] = g.rc(i), out: number[] = [];
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    for (let y = r + dr, x = c + dc; y >= 0 && x >= 0 && y < g.rows && x < g.cols; y += dr, x += dc) {
      const j = g.cell(y, x);
      if (p.blocked.has(j)) break;
      out.push(j);
    }
  }
  return out;
};
/** Where water in cell i must also be: the cells of its tank (outlined area, or the whole grid)
 *  reachable from it through cells at its level or lower. */
const floods = (p: Puzzle, i: number) => {
  const g = p.grid, level = g.rc(i)[0], tank = (j: number) => (p.areas ? p.areas.of[j] : 0);
  const seen = new Set([i]), stack = [i];
  while (stack.length) for (const l of g.cellLinks[stack.pop()!]) {
    const [a, c] = g.links[l].cells;
    for (const j of [a, c]) if (!seen.has(j) && tank(j) === tank(i) && g.rc(j)[0] >= level && !p.blocked.has(j)) { seen.add(j); stack.push(j); }
  }
  seen.delete(i);
  return [...seen];
};
/** Groups of cells (side by side) that pass a test. */
const groups = (p: Puzzle, ok: (i: number) => boolean) => {
  const g = p.grid, seen = new Set<number>(), out: number[][] = [];
  for (let s = 0; s < g.cellCount; s++) {
    if (!ok(s) || seen.has(s)) continue;
    const part = [s]; seen.add(s);
    for (let k = 0; k < part.length; k++) for (const l of g.cellLinks[part[k]]) { const j = other(p, l, part[k]); if (ok(j) && !seen.has(j)) { seen.add(j); part.push(j); } }
    out.push(part);
  }
  return out;
};
/** The cells out from a cell in each of the four directions, nearest first (up to a rock). */
const rays = (p: Puzzle, i: number) => {
  const g = p.grid, [r, c] = g.rc(i);
  return [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([dr, dc]) => {
    const ray: number[] = [];
    for (let y = r + dr, x = c + dc; y >= 0 && x >= 0 && y < g.rows && x < g.cols && !p.blocked.has(g.cell(y, x)); y += dr, x += dc) ray.push(g.cell(y, x));
    return ray;
  });
};
const lineKind = (s: RuleSpec): "fence" | "loop" => (s.of === "loop" ? "loop" : "fence");

export const blocks = {
  // ---- lines ----
  loop: {
    describe: (s, p) => s.cover
      ? `Draw one closed loop through the center of every ${p.blocked.size ? "white " : ""}cell. It goes straight or turns, never branches or crosses itself${p.blocked.size || p.walls.size ? ", and can't enter the dark cells or cross the thick walls" : ""}.`
      : "Draw one closed loop along the grid lines. It never branches or crosses itself.",
    check: (s, p, b) => checkLoop(p, b, lineKind(s), !!s.cover),
    asp: (s) => {
      const on = lineKind(s) === "fence" ? "fence" : "line", inc = lineKind(s) === "fence" ? "vb" : "lc";
      const node = lineKind(s) === "fence" ? "corner" : "cell";
      return `
ldeg(V,N) :- ${node}(V), N = #count{E: ${on}(E), ${inc}(V,E)}.
:- ldeg(V,N), N != 0, N != 2.
:- #count{E: ${on}(E)} = 0.
llit(V) :- ${on}(E), ${inc}(V,E).
llower(V) :- llit(V), llit(W), W < V.
lreach(V) :- llit(V), not llower(V).
lreach(W) :- lreach(V), ${on}(E), ${inc}(V,E), ${inc}(W,E).
:- llit(V), not lreach(V).
${s.cover ? ":- cell(I), not blocked(I), ldeg(I,N), N != 2." : ""}`;
    },
  },
  path: {
    describe: (s, p) => `Draw one path from the way in to the way out${s.cover ? ` through every ${p.blocked.size ? "white " : ""}cell` : ""}. It goes straight or turns, never branches or crosses itself${p.blocked.size || p.walls.size ? ", and can't enter the dark cells or cross the thick walls" : ""}.`,
    check: (s, p, b) => checkPath(p, b, !!s.cover),
    asp(s, p) {
      const ends = pathEnds(p);
      return `${ends.map((i) => `pend(${i}).`).join(" ")}
pdeg(I,N) :- cell(I), N = #count{L: line(L), lc(I,L)}.
:- pend(I), pdeg(I,N), N != 1.
:- cell(I), not pend(I), pdeg(I,N), N != 0, N != 2.
preach(${ends[0]}).
preach(J) :- preach(I), line(L), lc(I,L), lc(J,L).
:- pdeg(I,N), N > 0, not preach(I).
${s.cover ? ":- cell(I), not blocked(I), not preach(I)." : ""}`;
    },
  },
  links: {
    describe: (s) => `Join each pair of matching numbers with a line through the cells. Lines go straight or turn, and never branch, cross or touch another number${s.cover ? ". Every cell is used" : ""}.`,
    check: (s, p, b) => checkLinks(p, b, !!s.cover),
    asp(s, p) {
      const nums = numberClues(p);
      return `${nums.map(([i, v]) => `lend(${i},${v}).`).join(" ")}
kdeg(I,N) :- cell(I), N = #count{L: line(L), lc(I,L)}.
:- lend(I,_), kdeg(I,N), N != 1.
:- cell(I), not lend(I,_), kdeg(I,N), N != 0, N != 2.
lab(I,V) :- lend(I,V).
lab(J,V) :- lab(I,V), line(L), lc(I,L), lc(J,L).
:- lab(I,V), lab(I,W), V < W.
:- kdeg(I,N), N > 0, not lab(I,_).
${s.cover ? ":- cell(I), not blocked(I), kdeg(I,0)." : ""}`;
    },
  },
  pearls: {
    describe: () => "The loop goes straight through every white pearl and turns in the cell before or after it (or both). It turns at every black pearl and goes straight through the cells on both sides of it.",
    check: (_s, p, b) => checkPearls(p, b),
    asp(_s, p) {
      const g = p.grid, out: string[] = [];
      for (let i = 0; i < g.cellCount; i++) {
        const [r, c] = g.rc(i);
        for (const [d, dr, dc] of [["n", -1, 0], ["e", 0, 1], ["s", 1, 0], ["w", 0, -1]] as const) {
          if (r + dr < 0 || c + dc < 0 || r + dr >= g.rows || c + dc >= g.cols) continue;
          const j = g.cell(r + dr, c + dc);
          out.push(`nb(${i},${d},${j},${g.links[g.borders[g.borderBetween(i, j)].link].id}).`);
        }
      }
      for (const [i, colour] of pearlClues(p)) out.push(`${colour}(${i}).`);
      out.push(`go(I,D) :- nb(I,D,_,L), line(L).
straight(I) :- go(I,n), go(I,s).
straight(I) :- go(I,e), go(I,w).
onl(I) :- go(I,_).
:- black(I), not onl(I).
:- black(I), straight(I).
:- black(I), go(I,D), nb(I,D,J,_), not go(J,D).
:- white(I), not straight(I).
:- white(I), go(I,D), nb(I,D,J,_), go(I,E), nb(I,E,K,_), D < E, straight(J), straight(K).`);
      return out.join("\n");
    },
  },
  sides: {
    describe: () => "A number in a cell says how many of its four sides the loop runs along.",
    check(_s, p, b) {
      return numberClues(p).filter(([i, n]) => p.grid.cellBorders[i].filter((e) => b.fence[e] === 1).length !== n)
        .map(([i, n]) => ({ message: `This ${n} needs exactly ${n} side${n === 1 ? "" : "s"} of the loop.`, cells: [i] }));
    },
    asp: (_s, p) => numberClues(p).map(([i, n]) => `:- ${n} != #count{B: fence(B), cb(${i},B)}.`).join("\n"),
  },

  // ---- mazes ----
  "corner-count": {
    describe: () => "A number on a corner says how many walls touch it. The outside edge counts.",
    check(_s, p, b) {
      return cornerClues(p).filter(([v, n]) => p.grid.cornerBorders[v].filter((e) => b.fence[e] === 1).length !== n)
        .map(([v, n]) => ({ message: `This ${n} needs exactly ${n} wall${n === 1 ? "" : "s"} touching it.`, borders: p.grid.cornerBorders[v] }));
    },
    asp: (_s, p) => cornerClues(p).map(([v, n]) => `:- ${n} != #count{B: fence(B), vb(${v},B)}.`).join("\n"),
  },
  "perfect-maze": {
    describe: () => "Draw the walls of a maze. The outside edge is walled except the way in and the way out. Walls never close into a loop, and every wall joins the edge, so every square can be reached and there's only one way between any two.",
    check(_s, p, b) {
      const g = p.grid;
      const edge = g.borders.filter((e) => e.link < 0 && (b.fence[e.id] === 1) === p.doors.has(e.id)).map((e) => e.id);
      if (edge.length) return [{ message: "The outside edge is walled, except the way in and the way out.", borders: edge }];
      const given = [...p.walls].map((l) => g.links[l].border).filter((e) => b.fence[e] !== 1);
      if (given.length) return [{ message: "Keep the walls that were given.", borders: given }];
      // every square reachable: the open passages join all the cells
      const reached = new Set([0]), stack = [0];
      while (stack.length) {
        const i = stack.pop()!;
        for (const l of g.cellLinks[i]) {
          const { cells, border } = g.links[l], j = cells[0] === i ? cells[1] : cells[0];
          if (b.fence[border] !== 1 && !reached.has(j)) { reached.add(j); stack.push(j); }
        }
      }
      if (reached.size < g.cellCount) {
        const shut = Array.from({ length: g.cellCount }, (_, i) => i).filter((i) => !reached.has(i));
        return [{ message: "Walls close in some squares: every square must be reachable.", cells: reached.size * 2 < g.cellCount ? [...reached] : shut }];
      }
      // no loop of passages: every wall is joined to the edge
      const root = Array.from({ length: g.cornerCount }, (_, v) => v);
      const find = (v: number): number => (root[v] === v ? v : (root[v] = find(root[v])));
      for (const e of g.borders) if (b.fence[e.id] === 1) root[find(e.corners[0])] = find(e.corners[1]);
      const onEdge = new Set(g.borders.filter((e) => e.link < 0).flatMap((e) => e.corners.map(find)));
      const loose = g.borders.filter((e) => b.fence[e.id] === 1 && !onEdge.has(find(e.corners[0]))).map((e) => e.id);
      if (loose.length) return [{ message: "Every wall must join the outside edge: these stand on their own, so there's more than one way around them.", borders: loose }];
      // a corner with no walls at all: the passages circle it
      const bare = Array.from({ length: g.cornerCount }, (_, v) => v).filter((v) => !onEdge.has(find(v)));
      if (bare.length) {
        const around = (v: number) => { const [r, c] = g.cornerRC(v); return [g.cell(r - 1, c - 1), g.cell(r - 1, c), g.cell(r, c - 1), g.cell(r, c)]; };
        return [{ message: "There's a way around this point: a wall must run from it to the edge.", cells: around(bare[0]) }];
      }
      return [];
    },
    asp(_s, p) {
      const g = p.grid, out: string[] = [];
      for (const e of g.borders) if (e.link < 0) out.push(p.doors.has(e.id) ? `:- fence(${e.id}).` : `:- not fence(${e.id}).`);
      for (const l of p.walls) out.push(`:- not fence(${g.links[l].border}).`);
      for (const l of g.links) out.push(`mlb(${l.id},${l.border}).`);
      out.push(`
mopen(L) :- mlb(L,B), not fence(B).
mreach(0).
mreach(J) :- mreach(I), adj(I,J,L), mopen(L).
:- cell(I), not mreach(I).
:- #count{L: mopen(L)} != ${g.cellCount - 1}.`);
      return out.join("\n");
    },
  },

  // ---- painting (Three Coats) ----
  painted: {
    describe: (_s, p) => `Paint every ${p.figure ? "piece" : "cell"} ${colorList(p)}.`,
    check(_s, p, b) {
      const bare = Array.from({ length: p.grid.cellCount }, (_, i) => i).filter((i) => !b.color[i]);
      return bare.length ? [{ message: `Paint every ${p.figure ? "piece" : "cell"}.`, cells: bare }] : [];
    },
    asp: () => "",   // the paint choice already gives every cell exactly one color
  },
  "neighbor-dots": {
    describe: (_s, p) => `Each colored dot in a ${p.figure ? "piece" : "cell"} asks for a neighbour of that color: two ${colorName(p, 1)} dots mean at least two ${colorName(p, 1)} neighbours. Neighbours share an edge; touching at a corner doesn't count.`,
    check(_s, p, b) {
      return dotClues(p).flatMap(([i, need]) => {
        const short = [...need].filter(([c, k]) => neighbours(p, i).filter((j) => b.color[j] === c).length < k);
        return short.length ? [{ message: `This piece needs more ${short.map(([c]) => colorName(p, c)).join(" and ")} neighbours.`, cells: [i] }] : [];
      });
    },
    asp: (_s, p) => dotClues(p).flatMap(([i, need]) =>
      [...need].map(([c, k]) => `:- #count{J: adj(${i},J,_), paint(J,${c})} < ${k}.`)).join("\n"),
  },
  "color-count": {
    describe: (s, p) => `Paint exactly ${countsOf(s, p).map(([c, n]) => `${n} ${colorName(p, c)}`).join(", ")}.`,
    check(s, p, b) {
      const off = countsOf(s, p).filter(([c, n]) => [...b.color].filter((x) => x === c).length !== n);
      return off.length ? [{ message: `Paint exactly ${off.map(([c, n]) => `${n} ${colorName(p, c)}`).join(" and ")}.` }] : [];
    },
    asp: (s, p) => countsOf(s, p).map(([c, n]) => `:- #count{I: paint(I,${c})} != ${n}.`).join("\n"),
  },

  // ---- nonograms ----
  runs: {
    describe: () => "The numbers beside each row and above each column are the runs of shaded cells in that line, in order: \u201c3 1\u201d means a run of 3, a gap, then a run of 1.",
    check(_s, p, b) {
      const out: Problem[] = [];
      for (const [kind, map] of [["row", p.rowRuns], ["col", p.colRuns]] as const) for (const [i, clue] of map) {
        const cells = lineCells(p, kind, i);
        if (!sameRuns(runsOf(cells.map((c) => b.shade[c] === 1)), clue)) out.push({ message: `${kind === "row" ? "Row" : "Column"} ${i + 1} doesn't match its numbers.`, cells });
      }
      return out;
    },
    asp(_s, p) {
      const out: string[] = [];
      let line = 0;
      for (const [kind, map] of [["row", p.rowRuns], ["col", p.colRuns]] as const) for (const [i, clue] of map) {
        const cells = lineCells(p, kind, i), L = line++, n = cells.length;
        cells.forEach((c, pos) => out.push(`lcell(${L},${pos},${c}).`));
        const blocks = clue.filter((x) => x > 0);
        if (!blocks.length) { out.push(`:- lcell(${L},_,I), shaded(I).`); continue; }
        let lo = 0;
        const total = blocks.reduce((a, x) => a + x, 0) + blocks.length - 1;
        blocks.forEach((len, k) => {
          const hi = n - (total - lo);
          out.push(`blen(${L},${k},${len}). 1 { st(${L},${k},S) : S = ${lo}..${hi} } 1.`);
          if (k > 0) out.push(`:- st(${L},${k - 1},S), st(${L},${k},T), T < S + ${blocks[k - 1]} + 1.`);
          lo += len + 1;
        });
      }
      out.push("cov(L,P) :- st(L,K,S), blen(L,K,N), P = S..S+N-1.");
      out.push(":- lcell(L,P,I), shaded(I), not cov(L,P).\n:- lcell(L,P,I), cov(L,P), not shaded(I).");
      return out.join("\n");
    },
    hint(_s, p, b) {
      // the first line whose clue alone gives away cells the player hasn't marked yet
      for (const [kind, map] of [["row", p.rowRuns], ["col", p.colRuns]] as const) for (const [i, clue] of map) {
        const cells = lineCells(p, kind, i);
        const known = cells.map((c) => (b.shade[c] === 1 ? 1 : b.shade[c] === 2 ? 0 : -1));
        const res = solveLine(clue, known);
        if (!res) continue;
        const fresh = res.flatMap((v, j) => (v !== -1 && known[j] === -1 ? [{ cell: cells[j], shade: v as 0 | 1 }] : []));
        if (fresh.length) return { message: `${kind === "row" ? "Row" : "Column"} ${i + 1}: its numbers give these cells away.`, area: cells, cells: fresh };
      }
      return null;
    },
  },

  // ---- digits ----
  letters: {
    describe: (s, p) => `Each row and each column has each of ${symbolList(p)} exactly once; the other cells stay empty.`,
    check(s, p, b) {
      const g = p.grid, out: Problem[] = [];
      for (const line of linesOf(p)) for (let d = 1; d <= p.digits; d++) {
        if (line.filter((i) => b.digit[i] === d).length !== 1) { out.push({ message: `Each row and column has each of ${symbolList(p)} exactly once.`, cells: line }); break; }
      }
      void g; void s;
      return out;
    },
    asp: (_s, p) => linesOf(p).map((line, k) => `:- d(D), #count{I: digit(I,D), lin(${k},I)} != 1.\n${line.map((i) => `lin(${k},${i}).`).join(" ")}`).join("\n"),
  },
  "first-seen": {
    describe: (_s, p) => `A ${p.style.symbols ? "letter" : "number"} outside the grid is the first one met looking in from that side.`,
    check(_s, p, b) {
      return p.edgeClues.filter((c) => c.kind === "first").flatMap((c) => {
        const ray = rayIn(p, c.cell, c.side), first = ray.find((i) => b.digit[i]);
        return first === undefined || b.digit[first] !== c.value ? [{ message: `Looking in from here, the first ${p.style.symbols ? "letter" : "number"} must be ${symbolOf(p, c.value)}.`, cells: ray }] : [];
      });
    },
    asp: (_s, p) => p.edgeClues.filter((c) => c.kind === "first").map((c) => {
      const ray = rayIn(p, c.cell, c.side);
      return ray.map((i, k) => `:- digit(${i},D), D != ${c.value}${ray.slice(0, k).map((j) => `, not filled(${j})`).join("")}.`).join("\n")
        + `\n:- ${ray.map((i) => `not filled(${i})`).join(", ")}.`;
    }).join("\n") + "\nfilled(I) :- digit(I,_).",
  },
  skyscrapers: {
    describe: () => "Digits are building heights. A number outside the grid counts the buildings you'd see looking in from there: taller ones hide shorter ones behind them.",
    check(_s, p, b) {
      return p.edgeClues.filter((c) => c.kind === "skyscraper").flatMap((c) => {
        const ray = rayIn(p, c.cell, c.side);
        let top = 0, seen = 0;
        for (const i of ray) if (b.digit[i] > top) { top = b.digit[i]; seen++; }
        return seen !== c.value ? [{ message: `From here you must see exactly ${c.value} building${c.value === 1 ? "" : "s"}.`, cells: ray }] : [];
      });
    },
    asp: (_s, p) => p.edgeClues.filter((c) => c.kind === "skyscraper").map((c, q) => {
      const ray = rayIn(p, c.cell, c.side);
      return ray.map((i, k) => ray.slice(0, k).map((j) => `hid(${q},${i}) :- digit(${i},D), digit(${j},E), E > D.`).join("\n")).filter(Boolean).join("\n")
        + `\n:- #count{I: digit(I,_), sky(${q},I), not hid(${q},I)} != ${c.value}.\n${ray.map((i) => `sky(${q},${i}).`).join(" ")}`;
    }).join("\n"),
  },
  thermo: {
    describe: () => "Along a thermometer, digits increase from the bulb to the tip.",
    check(_s, p, b) {
      return p.thermos.filter((t) => t.some((i, k) => k > 0 && b.digit[i] && b.digit[t[k - 1]] && b.digit[i] <= b.digit[t[k - 1]]))
        .map((t) => ({ message: "Digits must rise along a thermometer, from the bulb up.", cells: t }));
    },
    asp: (_s, p) => p.thermos.flatMap((t) => t.slice(1).map((i, k) => `:- digit(${t[k]},X), digit(${i},Y), Y <= X.`)).join("\n"),
  },
  latin: {
    describe: (_s, p) => `Fill every cell with a digit from 1 to ${p.digits}. Each row and each column has every digit once.`,
    check(_s, p, b) {
      const g = p.grid, out: Problem[] = [];
      const empty = Array.from({ length: g.cellCount }, (_, i) => i).filter((i) => !b.digit[i]);
      if (empty.length) out.push({ message: "Fill every cell.", cells: empty });
      for (const [kind, count] of [["row", g.rows], ["col", g.cols]] as const) for (let i = 0; i < count; i++) {
        const dup = duplicates(lineCells(p, kind, i), b);
        if (dup.length) out.push({ message: `A digit repeats in ${kind === "row" ? "row" : "column"} ${i + 1}.`, cells: dup });
      }
      return out;
    },
    asp: () => ":- digit(I,D), digit(J,D), row(I,R), row(J,R), I < J.\n:- digit(I,D), digit(J,D), col(I,C), col(J,C), I < J.",
  },
  boxes: {
    describe: (s, p) => { if (p.areas) return "Each outlined area has every digit once."; const [h, w] = boxSize(s, p); return `Each ${h}×${w} box (heavy lines) has every digit once.`; },
    check(s, p, b) {
      return boxesOf(s, p).map((cells) => duplicates(cells, b)).filter((d) => d.length)
        .map((cells) => ({ message: `A digit repeats in ${p.areas ? "an area" : "a box"}.`, cells }));
    },
    asp: (s, p) => boxesOf(s, p).map((cells, k) => cells.map((i) => `box(${i},${k}).`).join(" ")).join("\n")
      + "\n:- digit(I,D), digit(J,D), box(I,B), box(J,B), I < J.",
  },

  // ---- shading ----
  "shaded-per-line": {
    describe: (s, p) => `Every row and every column has exactly ${n(s)} ${shadedWord(p, n(s))}.`,
    check(s, p, b) {
      const g = p.grid, out: Problem[] = [];
      for (let r = 0; r < g.rows; r++) { const cs = Array.from({ length: g.cols }, (_, c) => g.cell(r, c)); if (cs.filter((i) => b.shade[i] === 1).length !== n(s)) out.push({ message: `Each row needs ${n(s)} ${shadedWord(p, n(s))}.`, cells: cs }); }
      for (let c = 0; c < g.cols; c++) { const cs = Array.from({ length: g.rows }, (_, r) => g.cell(r, c)); if (cs.filter((i) => b.shade[i] === 1).length !== n(s)) out.push({ message: `Each column needs ${n(s)} ${shadedWord(p, n(s))}.`, cells: cs }); }
      return out;
    },
    asp: (s, p) => `:- row(_,R), #count{I: shaded(I), row(I,R)} != ${n(s)}.\n:- col(_,C), #count{I: shaded(I), col(I,C)} != ${n(s)}.`,
  },
  "shaded-per-area": {
    describe: (s, p) => `Every outlined area has exactly ${n(s)} ${shadedWord(p, n(s))}.`,
    check(s, p, b) {
      return (p.areas?.cells ?? []).filter((cs) => cs.filter((i) => b.shade[i] === 1).length !== n(s))
        .map((cs) => ({ message: `Each area needs ${n(s)} ${shadedWord(p, n(s))}.`, cells: cs }));
    },
    asp: (s, p) => (p.areas ? `:- inarea(_,A), #count{I: shaded(I), inarea(I,A)} != ${n(s)}.` : ""),
  },
  "no-touch": {
    describe: (_s, p) => `${p.style.shaded === "star" ? "Stars" : "Shaded cells"} never touch, not even at a corner.`,
    check(_s, p, b) {
      const g = p.grid, bad = new Set<number>();
      for (let i = 0; i < g.cellCount; i++) if (b.shade[i] === 1) for (const j of touching(p, i)) if (b.shade[j] === 1) { bad.add(i); bad.add(j); }
      return bad.size ? [{ message: `${p.style.shaded === "star" ? "Stars" : "Shaded cells"} can't touch, not even at a corner.`, cells: [...bad] }] : [];
    },
    asp: (_s, p) => Array.from({ length: p.grid.cellCount }, (_, i) => touching(p, i).filter((j) => j > i).map((j) => `:- shaded(${i}), shaded(${j}).`).join("\n")).filter(Boolean).join("\n"),
  },
  lit: {
    describe: (_s, p) => `Put light bulbs in white cells. A bulb lights its row and column up to a ${p.blocked.size ? "black cell" : "wall"}. Every white cell is lit, and no bulb shines on another.`,
    check(_s, p, b) {
      const g = p.grid, lit = new Set<number>(), clash = new Set<number>();
      for (let i = 0; i < g.cellCount; i++) if (b.shade[i] === 1) {
        lit.add(i);
        for (const j of sees(p, i)) { lit.add(j); if (b.shade[j] === 1) { clash.add(i); clash.add(j); } }
      }
      if (clash.size) return [{ message: "Two bulbs shine on each other.", cells: [...clash] }];
      const dark = Array.from({ length: g.cellCount }, (_, i) => i).filter((i) => !p.blocked.has(i) && !lit.has(i));
      return dark.length ? [{ message: "Every white cell must be lit.", cells: dark }] : [];
    },
    asp: (_s, p) => [
      ...Array.from({ length: p.grid.cellCount }, (_, i) => (p.blocked.has(i) ? [] : sees(p, i).map((j) => `sees(${i},${j}).`))).flat(),
      "lit(I) :- shaded(I).", "lit(J) :- shaded(I), sees(I,J).",
      ":- cell(I), not blocked(I), not lit(I).", ":- shaded(I), shaded(J), sees(I,J), I < J.",
    ].join("\n"),
  },
  "adjacent-count": {
    describe: (_s, p) => `A number on a ${p.blocked.size ? "black cell" : "cell"} counts the ${p.style.shaded === "bulb" ? "bulbs" : "shaded cells"} right beside it (not diagonally).`,
    check(_s, p, b) {
      return numberClues(p).filter(([i, k]) => p.grid.cellLinks[i].filter((l) => b.shade[other(p, l, i)] === 1).length !== k)
        .map(([i, k]) => ({ message: `This ${k} needs exactly ${k} ${p.style.shaded === "bulb" ? (k === 1 ? "bulb" : "bulbs") : "shaded"} beside it.`, cells: [i] }));
    },
    asp: (_s, p) => numberClues(p).map(([i, k]) => `:- #count{J: adj(${i},J,_), shaded(J)} != ${k}.`).join("\n"),
  },
  bars: {
    describe: (s) => `Shaded cells are blocks of ${barLen(s)} in a straight line (side by side or one above another). Blocks may touch.`,
    check(s, p, b) {
      const cells = Array.from({ length: p.grid.cellCount }, (_, i) => i).filter((i) => b.shade[i] === 1);
      return tiles(p, new Set(cells), barLen(s)) ? [] : [{ message: `The shaded cells must split into straight blocks of ${barLen(s)}.`, cells }];
    },
    asp(s, p) {
      const out: string[] = [];
      barPlacements(p, barLen(s)).forEach((cs, k) => out.push(`barp(${k}). ${cs.map((i) => `inbar(${k},${i}).`).join(" ")}`));
      out.push("{bar(K)} :- barp(K).", ":- bar(K), inbar(K,I), not shaded(I).", ":- shaded(I), #count{K: bar(K), inbar(K,I)} != 1.");
      return out.join("\n");
    },
  },
  "no-adjacent": {
    describe: () => "Shaded cells never touch side to side (corners are fine).",
    check(_s, p, b) {
      const bad = p.grid.links.filter((l) => b.shade[l.cells[0]] === 1 && b.shade[l.cells[1]] === 1).flatMap((l) => l.cells);
      return bad.length ? [{ message: "Shaded cells can't share a side.", cells: bad }] : [];
    },
    asp: () => ":- shaded(I), shaded(J), adj(I,J,_).",
  },
  "unique-unshaded": {
    describe: () => "In every row and column, the numbers left unshaded are all different.",
    shadeClues: true,
    check(_s, p, b) {
      const bad = new Set<number>();
      for (const [i, j] of sameLinePairs(p)) if (b.shade[i] !== 1 && b.shade[j] !== 1) { bad.add(i); bad.add(j); }
      return bad.size ? [{ message: "A number repeats in a row or column: shade one of them.", cells: [...bad] }] : [];
    },
    asp: (_s, p) => sameLinePairs(p).map(([i, j]) => `:- not shaded(${i}), not shaded(${j}).`).join("\n"),
  },
  "mine-count": {
    describe: (_s, p) => `A number counts the ${p.style.shaded === "mine" ? "mines" : "shaded cells"} in the eight cells around it, diagonals included.`,
    check(_s, p, b) {
      return numberClues(p).filter(([i, k]) => touching(p, i).filter((j) => b.shade[j] === 1).length !== k)
        .map(([i, k]) => ({ message: `This ${k} needs exactly ${k} ${p.style.shaded === "mine" ? (k === 1 ? "mine" : "mines") : "shaded"} around it.`, cells: [i] }));
    },
    asp: (_s, p) => numberClues(p).map(([i, k]) => `:- #count{${touching(p, i).map((j) => `${j}: shaded(${j})`).join("; ")}} != ${k}.`).join("\n"),
  },
  "unshaded-connected": {
    describe: () => "All the white (unshaded) cells form one connected group.",
    check(_s, p, b) {
      const parts = groups(p, (i) => b.shade[i] !== 1 && !p.blocked.has(i));
      return parts.length > 1 ? [{ message: "The white cells must all connect.", cells: parts.slice(1).flat() }] : [];
    },
    asp: () => `uo(I) :- cell(I), not shaded(I), not blocked(I).
ulow(I) :- uo(I), uo(J), J < I.
ureach(I) :- uo(I), not ulow(I).
ureach(J) :- ureach(I), adj(I,J,_), uo(J).
:- uo(I), not ureach(I).`,
  },
  "shaded-to-edge": {
    describe: () => "Every group of shaded cells touches the edge of the grid.",
    check(_s, p, b) {
      const g = p.grid, onEdge = (i: number) => { const [r, c] = g.rc(i); return r === 0 || c === 0 || r === g.rows - 1 || c === g.cols - 1; };
      const shut = groups(p, (i) => b.shade[i] === 1).filter((cs) => !cs.some(onEdge));
      return shut.length ? [{ message: "Shaded cells can't be closed in: every shaded group reaches the edge.", cells: shut.flat() }] : [];
    },
    asp: (_s, p) => {
      const g = p.grid, edge = Array.from({ length: g.cellCount }, (_, i) => i).filter((i) => { const [r, c] = g.rc(i); return r === 0 || c === 0 || r === g.rows - 1 || c === g.cols - 1; });
      return `${edge.map((i) => `edgecell(${i}).`).join(" ")}
sreach(I) :- shaded(I), edgecell(I).
sreach(J) :- sreach(I), adj(I,J,_), shaded(J).
:- shaded(I), not sreach(I).`;
    },
  },
  sight: {
    describe: () => "A number counts the white cells it can see along its row and column, itself included. Shaded cells block the view.",
    check(_s, p, b) {
      return numberClues(p).filter(([i, k]) => 1 + rays(p, i).reduce((n, ray) => { let m = 0; for (const j of ray) { if (b.shade[j] === 1 || p.blocked.has(j)) break; m++; } return n + m; }, 0) !== k)
        .map(([i, k]) => ({ message: `This ${k} must see exactly ${k} white cell${k === 1 ? "" : "s"}, itself included.`, cells: [i] }));
    },
    asp: (_s, p) => numberClues(p).map(([i, k]) => {
      const lines = rays(p, i).flatMap((ray) => ray.map((j, d) => `see(${i},${j}) :- ${ray.slice(0, d + 1).map((x) => `not shaded(${x})`).join(", ")}.`));
      return `${lines.join("\n")}\n:- #count{J: see(${i},J)} != ${k - 1}.`;
    }).join("\n"),
  },
  water: {
    describe: () => "Shaded cells are water in the outlined tanks. Water settles: if a cell holds water, so does every cell of its tank it could flow to at that level or below (each body of water has one flat surface).",
    check(_s, p, b) {
      const bad = new Set<number>();
      for (let i = 0; i < p.grid.cellCount; i++) if (b.shade[i] === 1) for (const j of floods(p, i)) if (b.shade[j] !== 1) bad.add(j);
      return bad.size ? [{ message: "Water flows down and sideways to an even level: these cells must fill too.", cells: [...bad] }] : [];
    },
    asp: (_s, p) => Array.from({ length: p.grid.cellCount }, (_, i) => floods(p, i).map((j) => `:- shaded(${i}), not shaded(${j}).`).join("\n")).filter(Boolean).join("\n"),
  },
  "line-totals": {
    describe: () => "A number beside a row or above a column counts its shaded cells.",
    check(_s, p, b) {
      const g = p.grid, out: Problem[] = [];
      for (const [r, k] of p.rowTotals) { const cs = Array.from({ length: g.cols }, (_, c) => g.cell(r, c)); if (cs.filter((i) => b.shade[i] === 1).length !== k) out.push({ message: `This row needs ${k} shaded.`, cells: cs }); }
      for (const [c, k] of p.colTotals) { const cs = Array.from({ length: g.rows }, (_, r) => g.cell(r, c)); if (cs.filter((i) => b.shade[i] === 1).length !== k) out.push({ message: `This column needs ${k} shaded.`, cells: cs }); }
      return out;
    },
    asp: (_s, p) => [...[...p.rowTotals].map(([r, k]) => `:- #count{I: shaded(I), row(I,${r})} != ${k}.`), ...[...p.colTotals].map(([c, k]) => `:- #count{I: shaded(I), col(I,${c})} != ${k}.`)].join("\n"),
  },
  connected: {
    describe: () => "All the shaded cells connect into one group (side to side, not at corners).",
    check(_s, p, b) {
      const groups = shadedGroups(p.grid, b);
      return groups.length > 1 ? [{ message: "The shaded cells must all connect.", cells: groups.slice(1).flat() }] : [];
    },
    asp: () => `
slower(I) :- shaded(I), shaded(J), J < I.
sreach(I) :- shaded(I), not slower(I).
sreach(J) :- sreach(I), adj(I,J,_), shaded(J).
:- shaded(I), not sreach(I).`,
  },
  "no-pool": {
    describe: () => "No 2×2 block of cells is all shaded.",
    check(_s, p, b) {
      const g = p.grid, out: Problem[] = [];
      for (let r = 0; r + 1 < g.rows; r++) for (let c = 0; c + 1 < g.cols; c++) {
        const q = [g.cell(r, c), g.cell(r, c + 1), g.cell(r + 1, c), g.cell(r + 1, c + 1)];
        if (q.every((i) => b.shade[i] === 1)) out.push({ message: "No 2×2 block can be all shaded.", cells: q });
      }
      return out;
    },
    asp: () => `:- quad(A,B,C,D), shaded(A), shaded(B), shaded(C), shaded(D).`,
  },

  // ---- regions (or a shading puzzle's islands) ----
  size: {
    describe: (s) => s.is !== undefined ? `Every region has exactly ${s.is} cells.`
      : s.min !== undefined && s.max !== undefined ? `Every region has ${s.min} to ${s.max} cells.`
      : s.min !== undefined ? `Every region has at least ${s.min} cells.` : `Every region has at most ${s.max} cells.`,
    check(s, p, _b, r): Problem[] {
      return r().cells.filter((cs) => !sizeOk(cs.length, s)).map((cs) => ({ message: blocks.size.describe(s), cells: cs }));
    },
    asp: (s) => [
      s.is !== undefined && `:- size(R,N), N != ${s.is}.`,
      s.min !== undefined && `:- size(R,N), N < ${s.min}.`,
      s.max !== undefined && `:- size(R,N), N > ${s.max}.`,
    ].filter(Boolean).join("\n"),
    needs: ["regions"],
  },
  "size-clue": {
    describe: (_s, p) => p.marks.includes("shade")
      ? "Each number sits in an island of unshaded cells with that many cells."
      : "A number tells how many cells its region has.",
    check(_s, p, _b, r) {
      const reg = r();
      return numberClues(p).filter(([i, n]) => reg.of[i] < 0 || reg.cells[reg.of[i]].length !== n)
        .map(([i, n]) => ({ message: `This ${n} needs a group of exactly ${n} cell${n === 1 ? "" : "s"}.`, cells: reg.of[i] < 0 ? [i] : reg.cells[reg.of[i]] }));
    },
    asp: (_s, p) => numberClues(p).map(([i, n]) => `:- member(R,${i}), size(R,M), M != ${n}.\n:- not open(${i}).`).join("\n"),
    needs: ["regions"],
  },
  "one-each": {
    describe: (s) => `Every ${s.of === "symbol" ? "region holds exactly one symbol" : "group holds exactly one number"}.`,
    check(s, p, _b, r) {
      const kind = (s.of as string) ?? "number";
      return r().cells.filter((cs) => cs.filter((i) => p.cellGivens.get(i)?.some((g) => g.kind === kind)).length !== 1)
        .map((cs) => ({ message: kind === "number" ? "Each group needs exactly one number." : "Each region needs exactly one symbol.", cells: cs }));
    },
    asp: (s, p) => {
      const kind = (s.of as string) ?? "number";
      const facts = [...p.cellGivens].filter(([, gs]) => gs.some((g) => g.kind === kind)).map(([i]) => `kclue(${i}).`).join(" ");
      return `${facts}\n:- root(R), #count{I: member(R,I), kclue(I)} != 1.`;
    },
    needs: ["regions"],
  },
  twins: {
    describe: () => "The two regions touching a ◆ are different regions with the same shape (turned or flipped is fine).",
    check: (_s, p, _b, r) => pairCheck(p, r(), "twins", true),
    asp: (_s, p) => pairFacts(p, "twins", "tw") + `
cmp(R1,R2) :- tw(R1,R2).
:- tw(R,R).
:- tw(R1,R2), not same(R1,R2).`,
    needs: ["regions", "shapes"],
  },
  opposites: {
    describe: () => "The two regions touching a ◇ are different regions with different shapes.",
    check: (_s, p, _b, r) => pairCheck(p, r(), "opposites", false),
    asp: (_s, p) => pairFacts(p, "opposites", "op") + `
cmp(R1,R2) :- op(R1,R2).
:- op(R,R).
:- op(R1,R2), same(R1,R2).`,
    needs: ["regions", "shapes"],
  },
  squares: {
    describe: () => "Every region is a square.",
    needs: ["regions"],
    check(_s, p, _b, r) {
      return r().cells.filter((cs) => { const [h, w] = boxOf(p, cs); return h !== w || h * w !== cs.length; })
        .map((cs) => ({ message: "Every region must be a square.", cells: cs }));
    },
    asp: (_s, p) => `${cornerRule(p)}
sqr0(R,X) :- root(R), X = #min{Y: member(R,I), row(I,Y)}.
sqr1(R,X) :- root(R), X = #max{Y: member(R,I), row(I,Y)}.
sqc0(R,X) :- root(R), X = #min{Y: member(R,I), col(I,Y)}.
sqc1(R,X) :- root(R), X = #max{Y: member(R,I), col(I,Y)}.
:- sqr0(R,A), sqr1(R,B), sqc0(R,C), sqc1(R,D), B-A != D-C.`,
  },
  "no-four-corners": {
    describe: () => "Four regions never meet at a point.",
    needs: ["regions"],
    check(_s, p, _b, r) {
      const g = p.grid, of = r().of, bad: number[] = [];
      for (let y = 0; y + 1 < g.rows; y++) for (let x = 0; x + 1 < g.cols; x++) {
        const [A, B, C, D] = [g.cell(y, x), g.cell(y, x + 1), g.cell(y + 1, x), g.cell(y + 1, x + 1)];
        if (of[A] !== of[B] && of[C] !== of[D] && of[A] !== of[C] && of[B] !== of[D]) bad.push(A, B, C, D);
      }
      return bad.length ? [{ message: "Four regions can't meet at one point.", cells: bad }] : [];
    },
    asp: (_s, p) => quads(p).map(([t, b, l, r]) => `:- cut(${t}), cut(${b}), cut(${l}), cut(${r}).`).join("\n"),
  },
  "side-clue": {
    describe: () => "A number gives the side length of the square it's in.",
    needs: ["regions"],
    check(_s, p, _b, r) {
      const reg = r();
      return numberClues(p).filter(([i, k]) => reg.of[i] < 0 || reg.cells[reg.of[i]].length !== k * k)
        .map(([i, k]) => ({ message: `This ${k} sits in a ${k}×${k} square.`, cells: [i] }));
    },
    asp: (_s, p) => numberClues(p).map(([i, k]) => `:- member(R,${i}), size(R,N), N != ${k * k}.\n:- not open(${i}).`).join("\n"),
  },
  rectangles: {
    describe: () => "Every region is a rectangle (or a square).",
    needs: ["regions"],
    check(_s, p, _b, r) {
      const g = p.grid;
      return r().cells.filter((cs) => {
        const rs = cs.map((i) => g.rc(i)[0]), ks = cs.map((i) => g.rc(i)[1]);
        return (Math.max(...rs) - Math.min(...rs) + 1) * (Math.max(...ks) - Math.min(...ks) + 1) !== cs.length;
      }).map((cs) => ({ message: "Every region must be a rectangle.", cells: cs }));
    },
    asp: (_s, p) => cornerRule(p),
  },
  galaxies: {
    describe: () => "Split the grid into regions, one around each circle. Each region is symmetric about its circle: turn it halfway round the circle and it looks the same.",
    check(_s, p, b) {
      const reg = regionsOf(p, b), out: number[][] = [];
      const inAny = new Set<number>();
      reg.cells.forEach((cs) => {
        const set = new Set(cs), inside = p.galaxies.map((_, k) => k).filter((k) => galaxyCore(p, p.galaxies[k]).every((i) => set.has(i)));
        inside.forEach((k) => inAny.add(k));
        if (inside.length !== 1 || cs.some((i) => !set.has(mirrorOf(p, i, p.galaxies[inside[0]])))) out.push(cs);
      });
      // every circle is the centre of a region (one on a hole can't be, and doesn't count)
      const split = p.galaxies.filter((gx, k) => !inAny.has(k) && !galaxyCore(p, gx).some((i) => p.blocked.has(i)));
      if (split.length) out.push(split.flatMap((gx) => galaxyCore(p, gx)));
      return out.length ? [{ message: "Each region holds one circle and is symmetric about it.", cells: out.flat() }] : [];
    },
    asp(_s, p) {
      const g = p.grid, out: string[] = [];
      p.galaxies.forEach((gx, k) => {
        if (galaxyCore(p, gx).some((i) => p.blocked.has(i))) return;   // a circle on a hole centres nothing
        out.push(`galaxy(${k}). ${galaxyCore(p, gx).map((i) => `gal(${i},${k}).`).join(" ")}`);
        for (let i = 0; i < g.cellCount; i++) { const j = mirrorOf(p, i, gx); out.push(j < 0 ? `nomir(${i},${k}).` : `mir(${i},${k},${j}).`); }
        out.push(galaxyCore(p, gx).map((i) => `greach(${i},${k}).`).join(" "));
      });
      out.push(`1 { gal(I,G) : galaxy(G) } 1 :- cell(I), not blocked(I).
:- gal(I,G), nomir(I,G).
:- gal(I,G), mir(I,G,J), not gal(J,G).
greach(J,G) :- greach(I,G), adj(I,J,_), gal(J,G).
:- gal(I,G), not greach(I,G).
:- adj(I,J,L), gal(I,G), gal(J,G), cut(L).
:- adj(I,J,L), gal(I,G), not gal(J,G), not cut(L).`);
      return out.join("\n");
    },
  },
  "all-different": {
    describe: () => "No two regions have the same shape (turned or flipped counts as the same).",
    check(_s, p, _b, r) {
      const seen = new Map<string, number[]>(), out: Problem[] = [];
      for (const cs of r().cells) {
        const k = shapeKey(p.grid, cs);
        if (seen.has(k)) out.push({ message: "Two regions have the same shape.", cells: [...seen.get(k)!, ...cs] });
        else seen.set(k, cs);
      }
      return out;
    },
    asp: () => `
ad(R1,R2) :- root(R1), root(R2), R1 < R2.
cmp(R1,R2) :- ad(R1,R2).
:- ad(R1,R2), same(R1,R2).`,
    needs: ["regions", "shapes"],
  },
  compass: {
    describe: () => "A compass counts the cells of its own region that lie north, east, south and west of it.",
    check(_s, p, _b, r) {
      const reg = r(), g = p.grid, out: Problem[] = [];
      for (const [i, gs] of p.cellGivens) for (const giv of gs) {
        if (giv.kind !== "compass") continue;
        if (reg.of[i] < 0) { out.push({ message: "A compass can't sit in a hole.", cells: [i] }); continue; }
        const cs = reg.cells[reg.of[i]], [r0, c0] = g.rc(i);
        const count = { n: 0, e: 0, s: 0, w: 0 };
        for (const j of cs) { const [r1, c1] = g.rc(j); if (r1 < r0) count.n++; if (r1 > r0) count.s++; if (c1 > c0) count.e++; if (c1 < c0) count.w++; }
        const v = giv.value as Record<string, number | undefined>;
        if ((["n", "e", "s", "w"] as const).some((d) => v[d] !== undefined && v[d] !== count[d]))
          out.push({ message: "This compass doesn't match its region.", cells: cs });
      }
      return out;
    },
    asp(_s, p) {
      const lines: string[] = [];
      for (const [i, gs] of p.cellGivens) for (const giv of gs) {
        if (giv.kind !== "compass") continue;
        if (p.blocked.has(i)) { lines.push(`:- blocked(${i}).   % a compass in a hole`); continue; }
        const v = giv.value as Record<string, number | undefined>;
        const cmpd = { n: "RJ < RI", s: "RJ > RI", e: "CJ > CI", w: "CJ < CI" } as const;
        for (const d of ["n", "e", "s", "w"] as const) if (v[d] !== undefined)
          lines.push(`:- member(R,${i}), row(${i},RI), col(${i},CI), ${v[d]} != #count{J: member(R,J), row(J,RJ), col(J,CJ), ${cmpd[d]}}.`);
      }
      return lines.join("\n");
    },
    needs: ["regions"],
  },
  "neighbors-differ": {
    describe: () => "Regions that share a border have different shapes (turned or flipped counts as the same).",
    check(_s, p, _b, r) {
      const reg = r(), out: Problem[] = [], seen = new Set<string>();
      for (const l of p.grid.links) {
        const [x, y] = l.cells.map((i) => reg.of[i]);
        if (x < 0 || y < 0 || x === y || seen.has(`${Math.min(x, y)} ${Math.max(x, y)}`)) continue;
        seen.add(`${Math.min(x, y)} ${Math.max(x, y)}`);
        if (shapeKey(p.grid, reg.cells[x]) === shapeKey(p.grid, reg.cells[y]))
          out.push({ message: "Two regions side by side have the same shape.", cells: [...reg.cells[x], ...reg.cells[y]] });
      }
      return out;
    },
    asp: () => `
nbr(R1,R2) :- member(R1,I), member(R2,J), adj(I,J,_), R1 < R2.
cmp(R1,R2) :- nbr(R1,R2).
:- nbr(R1,R2), same(R1,R2).`,
    needs: ["regions", "shapes"],
  },
  "one-of-each": {
    describe: () => "Every region holds exactly one symbol of each kind (one of every color).",
    check(_s, p, _b, r) {
      const kinds = symbolKinds(p);
      return r().cells.filter((cs) => [...kinds.keys()].some((v) => cs.filter((i) => p.cellGivens.get(i)?.some((g) => g.kind === "symbol" && g.value === v)).length !== 1))
        .map((cs) => ({ message: "Each region needs exactly one symbol of each kind.", cells: cs }));
    },
    asp: (_s, p) => [...symbolKinds(p).values()].map((cells, k) => `oev(${k}). ${cells.map((i) => `oe(${i},${k}).`).join(" ")}`).join("\n") +
      "\n:- root(R), oev(K), #count{I: member(R,I), oe(I,K)} != 1.",
    needs: ["regions"],
  },
  "cell-borders": {
    describe: () => "A palisade mark shows how many of its cell's sides are region borders, and how they sit (turned any way): two at a corner or two opposite. The grid's edge and holes count as borders.",
    check(_s, p, _b, r) {
      const reg = r();
      return palisades(p).filter(({ cell, value, opposite }) => {
        const on = cellSides(p, cell).map((j) => j < 0 || p.blocked.has(j) || reg.of[j] !== reg.of[cell]);
        return !palisadeFits(on, value, opposite);
      }).map(({ cell }) => ({ message: "This palisade mark doesn't match its cell's borders.", cells: [cell] }));
    },
    asp(_s, p) {
      const g = p.grid, out: string[] = [];
      palisades(p).forEach(({ cell, value, opposite }, k) => {
        cellSides(p, cell).forEach((j, d) => out.push(j < 0 || p.blocked.has(j) ? `pal(${k},${d}).` : `pal(${k},${d}) :- cut(${g.borders[g.borderBetween(cell, j)].link}).`));
        out.push(`:- #count{D: pal(${k},D)} != ${value}.`);
        if (value === 2) out.push(opposite ? `palo(${k}) :- pal(${k},0), pal(${k},2).\npalo(${k}) :- pal(${k},1), pal(${k},3).\n:- not palo(${k}).`
          : `:- pal(${k},0), pal(${k},2).\n:- pal(${k},1), pal(${k},3).`);
      });
      return out.join("\n");
    },
    needs: ["regions"],
  },

  // ---- panels (line puzzles in the style of The Witness: panel.ts) ----
  "panel-line": panelLine,
  "panel-symbols": panelSymbols,
} satisfies Record<string, Block>;

/** Every rule block's name. The visual editor (app/app/components/BoardEditor.tsx) and the sketch
 *  reader list them all, so the build fails if a new block isn't added there too. */
export type RuleName = keyof typeof blocks;
export const RULE_NAMES = Object.keys(blocks) as RuleName[];

/** the cells of row / column i, in order */
const lineCells = (p: Puzzle, kind: "row" | "col", i: number) =>
  kind === "row" ? Array.from({ length: p.grid.cols }, (_, c) => p.grid.cell(i, c)) : Array.from({ length: p.grid.rows }, (_, r) => p.grid.cell(r, i));
export const runsOf = (line: boolean[]) => { const out: number[] = []; let n = 0; for (const x of [...line, false]) { if (x) n++; else if (n) { out.push(n); n = 0; } } return out.length ? out : [0]; };
const sameRuns = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Every cell a line's clue forces (1 shaded, 0 empty, -1 open), given what's known; null if impossible. */
export function solveLine(clue: number[], known: number[]): number[] | null {
  const blocks = clue.filter((x) => x > 0), n = known.length;
  let acc: number[] | null = null;
  const place = (k: number, from: number, line: number[]) => {
    if (k === blocks.length) {
      for (let j = from; j < n; j++) if (known[j] === 1) return;
      const full = line.slice(); for (let j = from; j < n; j++) full[j] = 0;
      acc = acc ? acc.map((v, j) => (v === full[j] ? v : -1)) : full;
      return;
    }
    for (let s = from; s + blocks[k] <= n; s++) {
      if (known[s - 1] === 1 && s > from) break;   // can't skip a known shaded cell
      let ok = true;
      for (let j = from; j < s; j++) if (known[j] === 1) ok = false;
      for (let j = s; j < s + blocks[k]; j++) if (known[j] === 0) ok = false;
      if (s + blocks[k] < n && known[s + blocks[k]] === 1) ok = false;
      if (!ok) continue;
      const next = line.slice();
      for (let j = from; j < s; j++) next[j] = 0;
      for (let j = s; j < s + blocks[k]; j++) next[j] = 1;
      if (s + blocks[k] < n) next[s + blocks[k]] = 0;
      place(k + 1, s + blocks[k] + 1, next);
    }
  };
  place(0, 0, new Array(n).fill(0));
  return acc;
}

/** cells holding a digit that also appears elsewhere in the group */
function duplicates(cells: number[], b: Board) {
  return cells.filter((i) => b.digit[i] && cells.some((j) => j !== i && b.digit[j] === b.digit[i]));
}
const boxSize = (s: RuleSpec, p: Puzzle): [number, number] => {
  if (Array.isArray(s.box)) return s.box as [number, number];
  // the squarest boxes: 9 -> 3x3, 6 -> 2x3, 4 -> 2x2, 16 -> 4x4, 12 -> 3x4, 25 -> 5x5
  const n = p.digits, h = Array.from({ length: Math.floor(Math.sqrt(n)) }, (_, k) => Math.floor(Math.sqrt(n)) - k).find((x) => n % x === 0) ?? 1;
  return [h, n / h];
};
function boxesOf(s: RuleSpec, p: Puzzle): number[][] {
  if (p.areas) return p.areas.cells;   // irregular: the outlined areas are the boxes
  const [h, w] = boxSize(s, p), g = p.grid, out: number[][] = [];
  for (let br = 0; br < g.rows; br += h) for (let bc = 0; bc < g.cols; bc += w) {
    const cells: number[] = [];
    for (let r = br; r < br + h && r < g.rows; r++) for (let c = bc; c < bc + w && c < g.cols; c++) cells.push(g.cell(r, c));
    out.push(cells);
  }
  return out;
}
export const boxLines = (s: RuleSpec, p: Puzzle) => boxSize(s, p);

function sizeOk(n: number, s: RuleSpec) {
  return (s.is === undefined || n === s.is) && (s.min === undefined || n >= (s.min as number)) && (s.max === undefined || n <= (s.max as number));
}

/** Each kind of symbol on the puzzle (its value) and the cells holding one. */
const symbolKinds = (p: Puzzle) => {
  const out = new Map<string, number[]>();
  for (const [i, gs] of p.cellGivens) for (const g of gs) if (g.kind === "symbol" && !out.get(g.value)?.includes(i)) out.set(g.value, [...(out.get(g.value) ?? []), i]);
  return out;
};
/** The palisade marks: a cell, how many of its sides are borders, and whether two are opposite. */
const palisades = (p: Puzzle) => [...p.cellGivens].flatMap(([cell, gs]) => gs.flatMap((g) => g.kind === "palisade" ? [{ cell, value: g.value, opposite: !!g.opposite }] : []));
/** A cell's four neighbours, clockwise from the top (-1 off the grid). */
const cellSides = (p: Puzzle, i: number) => {
  const g = p.grid, [r, c] = g.rc(i);
  return [[-1, 0], [0, 1], [1, 0], [0, -1]].map(([dr, dc]) => (r + dr >= 0 && c + dc >= 0 && r + dr < g.rows && c + dc < g.cols ? g.cell(r + dr, c + dc) : -1));
};
/** Do a cell's borders (clockwise from the top) match a palisade mark? */
export const palisadeFits = (on: boolean[], value: number, opposite: boolean) => {
  if (on.filter(Boolean).length !== value) return false;
  if (value !== 2) return true;
  return opposite === ((on[0] && on[2]) || (on[1] && on[3]));
};

/** twins / opposites: the regions on the two sides of each marked border */
function pairCheck(p: Puzzle, reg: Regions, kind: "twins" | "opposites", same: boolean): Problem[] {
  const out: Problem[] = [];
  for (const [e, gs] of p.borderGivens) {
    if (!gs.some((g) => g.kind === kind)) continue;
    const [a, c] = p.grid.borders[e].cells, ra = reg.of[a], rc = reg.of[c];
    // beside a hole (a rock) there's no region on that side
    const bad = ra < 0 || rc < 0 || ra === rc || (shapeKey(p.grid, reg.cells[ra]) === shapeKey(p.grid, reg.cells[rc])) !== same;
    if (bad) out.push({ message: same ? "The regions at a ◆ must be different regions with the same shape." : "The regions at a ◇ must be different regions with different shapes.", borders: [e], cells: [...(reg.cells[ra] ?? [a]), ...(ra === rc ? [] : reg.cells[rc] ?? [c])] });
  }
  return out;
}

function pairFacts(p: Puzzle, kind: string, pred: string) {
  const out: string[] = [];
  for (const [e, gs] of p.borderGivens) {
    if (!gs.some((g) => g.kind === kind)) continue;
    const [a, c] = p.grid.borders[e].cells;
    out.push(`${pred}(R1,R2) :- member(R1,${a}), member(R2,${c}).`);
    for (const x of [a, c]) if (p.blocked.has(x)) out.push(`:- blocked(${x}).   % no region beside a hole`);
  }
  return out.join("\n");
}

/** The cells beside a path's two doors (way in first). */
export const pathEnds = (p: Puzzle) => ["in", "out"].map((role) => {
  const e = [...p.doors].find(([, r]) => r === role)![0], [a, c] = p.grid.borders[e].cells;
  return a < 0 ? c : a;
});

function checkPath(p: Puzzle, b: Board, cover: boolean): Problem[] {
  const { edges, deg } = lineGraph(p, b, "loop");
  const ends = pathEnds(p);
  const bad = edges.filter(([a, c, id]) => p.walls.has(id) || p.blocked.has(a) || p.blocked.has(c)).map(([, , id]) => id);
  if (bad.length) return [{ message: "The path can't cross a wall or enter a dark cell.", links: bad }];
  const branch = deg.map((d, v) => [d, v]).filter(([d, v]) => d > (ends.includes(v) ? 1 : 2)).map(([, v]) => v);
  if (branch.length) return [{ message: "The path can't branch: it goes in one side of a cell and out another.", cells: branch }];
  // follow the path from the way in
  const seen = new Set([ends[0]]);
  let at = ends[0], from = -1;
  for (;;) {
    const next = edges.find(([a, c]) => (a === at && c !== from) || (c === at && a !== from));
    if (!next) break;
    const to = next[0] === at ? next[1] : next[0];
    if (seen.has(to)) break;
    seen.add(to); from = at; at = to;
  }
  if (at !== ends[1]) return [{ message: "Draw one path from the arrow in to the arrow out.", cells: [at] }];
  const stray = edges.filter(([a]) => !seen.has(a)).map(([, , id]) => id);
  if (stray.length) return [{ message: "Make one path, with no extra pieces of line.", links: stray }];
  if (cover) {
    const missing = Array.from({ length: p.grid.cellCount }, (_, i) => i).filter((i) => !p.blocked.has(i) && !seen.has(i));
    if (missing.length) return [{ message: "The path must pass through every open cell.", cells: missing }];
  }
  return [];
}

const pearlClues = (p: Puzzle) => [...p.cellGivens].flatMap(([i, gs]) => gs.filter((g) => g.kind === "pearl").map((g) => [i, g.value as "white" | "black"] as [number, "white" | "black"]));

function checkLinks(p: Puzzle, b: Board, cover: boolean): Problem[] {
  const { edges, deg } = lineGraph(p, b, "loop"), g = p.grid;
  const value = new Map(numberClues(p));
  const bad = deg.map((_, v) => v).filter((v) => (value.has(v) ? deg[v] > 1 : deg[v] > 2));
  if (bad.length) return [{ message: "Lines can't branch, and a number has just one line.", cells: bad }];
  const adj = new Map<number, number[]>();
  for (const [a, c] of edges) { adj.set(a, [...(adj.get(a) ?? []), c]); adj.set(c, [...(adj.get(c) ?? []), a]); }
  const seen = new Set<number>(), out: Problem[] = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const part = [start]; seen.add(start);
    for (let k = 0; k < part.length; k++) for (const n of adj.get(part[k]) ?? []) if (!seen.has(n)) { seen.add(n); part.push(n); }
    const nums = part.filter((v) => value.has(v));
    if (nums.length !== 2 || value.get(nums[0]) !== value.get(nums[1])) out.push({ message: nums.length === 2 ? "A line must join two matching numbers." : "Every line runs from a number to its matching number.", cells: part });
  }
  if (out.length) return out.slice(0, 1);
  const loose = [...value.keys()].filter((v) => deg[v] !== 1);
  if (loose.length) return [{ message: "Join every number to its match.", cells: loose }];
  if (cover) {
    const empty = Array.from({ length: g.cellCount }, (_, i) => i).filter((i) => !p.blocked.has(i) && !deg[i]);
    if (empty.length) return [{ message: "Every cell must be used by a line.", cells: empty }];
  }
  return [];
}

function checkPearls(p: Puzzle, b: Board): Problem[] {
  const g = p.grid;
  const go = (i: number) => {
    const [r, c] = g.rc(i), dirs: [number, number][] = [];
    for (const [dr, dc] of [[-1, 0], [0, 1], [1, 0], [0, -1]]) {
      if (r + dr < 0 || c + dc < 0 || r + dr >= g.rows || c + dc >= g.cols) continue;
      if (b.loop[g.links[g.borders[g.borderBetween(i, g.cell(r + dr, c + dc))].link].id] === 1) dirs.push([dr, dc]);
    }
    return dirs;
  };
  const straight = (i: number) => { const d = go(i); return d.length === 2 && d[0][0] === -d[1][0] && d[0][1] === -d[1][1]; };
  const step = (i: number, [dr, dc]: [number, number]) => { const [r, c] = g.rc(i); return g.cell(r + dr, c + dc); };
  const bad: number[] = [];
  for (const [i, colour] of pearlClues(p)) {
    const d = go(i);
    if (d.length !== 2) { bad.push(i); continue; }
    if (colour === "black" && (straight(i) || d.some((x) => !go(step(i, x)).some((y) => y[0] === x[0] && y[1] === x[1])))) bad.push(i);
    if (colour === "white" && (!straight(i) || d.every((x) => straight(step(i, x))))) bad.push(i);
  }
  return bad.length ? [{ message: "A pearl's rule is broken: straight through white (turning next to it), turning on black (straight on both sides).", cells: bad }] : [];
}

function checkLoop(p: Puzzle, b: Board, kind: "fence" | "loop", cover: boolean): Problem[] {
  const { edges, deg } = lineGraph(p, b, kind);
  const key = kind === "fence" ? "borders" : "links";
  if (!edges.length) return [{ message: "Draw the loop." }];
  if (kind === "loop") {
    const bad = edges.filter(([a, c, id]) => p.walls.has(id) || p.blocked.has(a) || p.blocked.has(c)).map(([, , id]) => id);
    if (bad.length) return [{ message: "The loop can't cross a wall or enter a dark cell.", links: bad }];
  }
  const branch = deg.map((d, v) => [d, v]).filter(([d]) => d !== 0 && d !== 2).map(([, v]) => v);
  if (branch.length) {
    const bad = edges.filter(([a, c]) => branch.includes(a) || branch.includes(c)).map(([, , id]) => id);
    return [{ message: "The loop can't branch or stop: every point on it joins exactly two lines.", [key]: bad }];
  }
  // one loop, not several
  const adj = new Map<number, number[]>();
  for (const [a, c] of edges) { adj.set(a, [...(adj.get(a) ?? []), c]); adj.set(c, [...(adj.get(c) ?? []), a]); }
  const start = edges[0][0], seen = new Set([start]), stack = [start];
  while (stack.length) for (const n of adj.get(stack.pop()!) ?? []) if (!seen.has(n)) { seen.add(n); stack.push(n); }
  if (seen.size !== adj.size) return [{ message: "Make one loop, not several.", [key]: edges.filter(([a]) => !seen.has(a)).map(([, , id]) => id) }];
  if (cover) {
    const missing = Array.from({ length: p.grid.cellCount }, (_, i) => i).filter((i) => !p.blocked.has(i) && deg[i] !== 2);
    if (missing.length) return [{ message: "The loop must pass through every open cell.", cells: missing }];
  }
  return [];
}

export const blockFor = (s: RuleSpec): Block => {
  const block = (blocks as Record<string, Block>)[s.rule];
  if (!block) throw new Error(`unknown rule "${s.rule}"`);
  return block;
};
