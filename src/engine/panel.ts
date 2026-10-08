// Panels: line puzzles in the style of The Witness (docs/grid-engine.md, "Panels"). A line runs
// along the grid lines (fence marks) from a start circle to an end on the outside edge, never
// touching itself or crossing a gap; the cells it cuts apart are regions, and the symbols in them
// say where it can go. With symmetry there are two lines, mirror images of each other.
//
// The rules follow Demaine et al., "Who witnesses The Witness?" (2018), sections 2-8, including
// its reading of erasers (antibodies): an eraser cancels itself and one other symbol (not an
// eraser) in its region, and must be needed: the region must not work with fewer erasers used.
// Two limits keep the one-solution proof exact: at most two erasers in a puzzle, and erasers don't
// share a puzzle with shapes (proving no packing exists is a harder problem than the solver's).
import type { Grid, RC } from "./geometry.ts";
import type { Board, Given, Problem, Puzzle, RuleSpec } from "./types.ts";
import type { Regions } from "./derive.ts";

export type Symmetry = "left-right" | "up-down" | "turn";
export const SYMMETRIES: Symmetry[] = ["left-right", "up-down", "turn"];
const symmetryOf = (s: RuleSpec): Symmetry | null => (SYMMETRIES as unknown[]).includes(s.symmetry) ? s.symmetry as Symmetry : null;

// ---- what's on the panel ----

const cornerOf = (g: Grid, [r, c]: RC) => g.corner(r, c);
export const startsOf = (p: Puzzle) => [...p.cornerGivens].flatMap(([v, gs]) => gs.filter((x) => x.kind === "start").map((x) => ({ v, color: (x as { color?: string }).color })));
export const endsOf = (p: Puzzle) => [...p.cornerGivens].filter(([, gs]) => gs.some((x) => x.kind === "end")).map(([v]) => v);

interface Hexagon { at: "corner" | "line"; v: number; e: number; color?: string }
export function hexagonsOf(p: Puzzle): Hexagon[] {
  const out: Hexagon[] = [];
  for (const [v, gs] of p.cornerGivens) for (const x of gs) if (x.kind === "hexagon") out.push({ at: "corner", v, e: -1, color: x.color });
  for (const [e, gs] of p.lineGivens) for (const x of gs) if (x.kind === "hexagon") out.push({ at: "line", v: -1, e, color: x.color });
  return out;
}

type CellSymbol = Extract<Given, { at: "cell"; kind: "square" | "star" | "triangle" | "shape" | "eraser" }>;
const PANEL_KINDS = new Set(["square", "star", "triangle", "shape", "eraser"]);
export const cellSymbolsOf = (p: Puzzle) => [...p.cellGivens].flatMap(([i, gs]) =>
  gs.filter((x): x is CellSymbol => PANEL_KINDS.has(x.kind)).map((x) => ({ i, x })));

/** The cells around a corner (1 to 4). */
const cornerCells = (g: Grid, v: number) => {
  const [r, c] = g.cornerRC(v), out: number[] = [];
  for (const [y, x] of [[r - 1, c - 1], [r - 1, c], [r, c - 1], [r, c]]) if (y >= 0 && x >= 0 && y < g.rows && x < g.cols) out.push(g.cell(y, x));
  return out;
};

/** A corner's mirror image. */
export function mirrorCorner(g: Grid, v: number, sym: Symmetry) {
  const [r, c] = g.cornerRC(v);
  return sym === "left-right" ? g.corner(r, g.cols - c) : sym === "up-down" ? g.corner(g.rows - r, c) : g.corner(g.rows - r, g.cols - c);
}
/** A stretch of grid line's mirror image. */
export function mirrorBorder(g: Grid, e: number, sym: Symmetry) {
  const [a, b] = g.borders[e].corners.map((v) => mirrorCorner(g, v, sym));
  return g.cornerBorders[a].find((x) => g.borders[x].corners.includes(b))!;
}

// ---- shapes ----

/** A shape's orientations (one, or every quarter turn if it may be turned), each as cells from 0,0. */
export function orientations(cells: RC[], rotate: boolean): RC[][] {
  const norm = (cs: RC[]) => {
    const r0 = Math.min(...cs.map((x) => x[0])), c0 = Math.min(...cs.map((x) => x[1]));
    return cs.map(([r, c]) => [r - r0, c - c0] as RC).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  };
  const out: RC[][] = [], seen = new Set<string>();
  let cur = cells;
  for (let k = 0; k < (rotate ? 4 : 1); k++) {
    const n = norm(cur), key = JSON.stringify(n);
    if (!seen.has(key)) { seen.add(key); out.push(n); }
    cur = cur.map(([r, c]) => [c, -r] as RC);
  }
  return out;
}
/** Every way a shape fits on the grid: the cells it covers. */
export function placements(g: Grid, cells: RC[], rotate: boolean): number[][] {
  const out: number[][] = [];
  for (const o of orientations(cells, rotate)) {
    const h = Math.max(...o.map((x) => x[0])) + 1, w = Math.max(...o.map((x) => x[1])) + 1;
    for (let r = 0; r + h <= g.rows; r++) for (let c = 0; c + w <= g.cols; c++) out.push(o.map(([y, x]) => g.cell(r + y, c + x)));
  }
  return out;
}

/** Can these shapes (positive and hollow) be laid on the grid so that every cell of the region
 *  is covered the same number of times more by positive shapes than hollow ones, 0 or 1 (the same
 *  for all of them), and every cell outside it evenly? */
export function packs(g: Grid, region: number[], shapes: { cells: RC[]; rotate: boolean; negative: boolean }[]): boolean {
  const pos = shapes.filter((s) => !s.negative), neg = shapes.filter((s) => s.negative);
  const area = (ss: typeof shapes) => ss.reduce((n, s) => n + s.cells.length, 0);
  const inRegion = new Set(region);
  for (const i of [1, 0]) {
    if (area(pos) - area(neg) !== i * region.length) continue;
    // lay the hollow shapes first, then cover what each cell needs with the positive ones
    const need = new Array<number>(g.cellCount).fill(0);
    for (const c of inRegion) need[c] = i;
    const negPl = neg.map((s) => placements(g, s.cells, s.rotate));
    const posPl = pos.map((s) => placements(g, s.cells, s.rotate));
    const cover = (left: number[]): boolean => {
      const cell = need.findIndex((n) => n > 0);
      if (cell < 0) return left.length === 0;
      if (need.some((n) => n < 0)) return false;
      for (const k of left) for (const pl of posPl[k]) {
        if (!pl.includes(cell) || pl.some((c) => need[c] <= 0)) continue;
        for (const c of pl) need[c]--;
        const ok = cover(left.filter((x) => x !== k));
        for (const c of pl) need[c]++;
        if (ok) return true;
      }
      return false;
    };
    const layNeg = (k: number): boolean => {
      if (k === negPl.length) return cover(pos.map((_, j) => j));
      for (const pl of negPl[k]) {
        for (const c of pl) need[c]++;
        const ok = layNeg(k + 1);
        for (const c of pl) need[c]--;
        if (ok) return true;
      }
      return false;
    };
    if (layNeg(0)) return true;
  }
  return false;
}

// ---- the line ----

/** Where each corner's line is (for colored dots): corner -> the start it comes from, or -1. */
function linesOf(p: Puzzle, b: Board) {
  const g = p.grid, of = new Array<number>(g.cornerCount).fill(-1);
  for (const { v } of startsOf(p)) {
    if (of[v] >= 0 || !g.cornerBorders[v].some((e) => b.fence[e] === 1)) continue;
    const stack = [v]; of[v] = v;
    while (stack.length) {
      const u = stack.pop()!;
      for (const e of g.cornerBorders[u]) {
        if (b.fence[e] !== 1) continue;
        const w = g.borders[e].corners[0] === u ? g.borders[e].corners[1] : g.borders[e].corners[0];
        if (of[w] < 0) { of[w] = v; stack.push(w); }
      }
    }
  }
  return of;
}

const sideWord: Record<Symmetry, string> = { "left-right": "left to right", "up-down": "top to bottom", turn: "turned halfway round" };

export const panelLine = {
  describe(s: RuleSpec, p: Puzzle) {
    const sym = symmetryOf(s), gaps = p.gaps.size ? ", and never across a gap" : "";
    const colored = hexagonsOf(p).some((h) => h.color);
    return sym
      ? `Draw two lines at once along the grid lines, mirror images of each other (${sideWord[sym]}), each from a start circle to an end on the edge. They never touch each other or themselves${gaps}.${colored ? " The blue line passes the blue dots, the yellow line the yellow ones." : ""}`
      : `Draw one line along the grid lines from a start circle to an end on the edge. It never crosses or touches itself${gaps}.`;
  },
  check(s: RuleSpec, p: Puzzle, b: Board): Problem[] {
    const g = p.grid, sym = symmetryOf(s), want = sym ? 2 : 1;
    const used = g.borders.filter((e) => b.fence[e.id] === 1).map((e) => e.id);
    if (!used.length) return [{ message: `Draw ${want === 2 ? "the lines" : "a line"} from ${want === 2 ? "the start circles" : "a start circle"} to ${want === 2 ? "the ends" : "an end"}.` }];
    const gapped = used.filter((e) => p.gaps.has(e));
    if (gapped.length) return [{ message: "The line can't cross a gap.", borders: gapped }];
    const deg = new Array<number>(g.cornerCount).fill(0);
    for (const e of used) for (const v of g.borders[e].corners) deg[v]++;
    const branch = deg.map((d, v) => [d, v]).filter(([d]) => d > 2).map(([, v]) => v);
    if (branch.length) return [{ message: "A line never branches or crosses itself.", borders: g.cornerBorders[branch[0]].filter((e) => b.fence[e] === 1) }];
    if (sym) {
      const odd = used.filter((e) => b.fence[mirrorBorder(g, e, sym)] !== 1);
      if (odd.length) return [{ message: `The two lines are mirror images (${sideWord[sym]}).`, borders: odd }];
    }
    // the parts of the drawing: each must be a path from a start to an end
    const root = Array.from({ length: g.cornerCount }, (_, v) => v);
    const find = (v: number): number => (root[v] === v ? v : (root[v] = find(root[v])));
    for (const e of used) root[find(g.borders[e].corners[0])] = find(g.borders[e].corners[1]);
    const parts = new Map<number, { corners: number[]; edges: number }>();
    for (let v = 0; v < g.cornerCount; v++) if (deg[v]) { const k = find(v); const x = parts.get(k) ?? { corners: [], edges: 0 }; x.corners.push(v); parts.set(k, x); }
    for (const e of used) parts.get(find(g.borders[e].corners[0]))!.edges++;
    if (parts.size !== want) return [{ message: want === 2 ? "Draw two separate lines, one from each start." : "Draw one unbroken line.", borders: used }];
    const starts = new Set(startsOf(p).map((x) => x.v)), ends = new Set(endsOf(p));
    for (const { corners, edges } of parts.values()) {
      const tips = corners.filter((v) => deg[v] === 1);
      const mine = used.filter((e) => corners.includes(g.borders[e].corners[0]));
      if (edges !== corners.length - 1 || tips.length !== 2) return [{ message: "A line never closes into a loop.", borders: mine }];
      const [a, z] = tips;
      if (!((starts.has(a) && ends.has(z)) || (starts.has(z) && ends.has(a))))
        return [{ message: "A line runs from a start circle to an end on the edge.", borders: mine }];
      if (sym && corners.some((v) => corners.includes(mirrorCorner(g, v, sym)))) return [{ message: "The two lines would meet.", borders: mine }];
    }
    // colored dots: on the line of their color
    if (sym) {
      const of = linesOf(p, b), color = new Map(startsOf(p).map((x) => [x.v, x.color]));
      for (const h of hexagonsOf(p)) {
        if (!h.color) continue;
        const v = h.at === "corner" ? h.v : g.borders[h.e].corners[0];
        const on = h.at === "corner" ? deg[v] > 0 : b.fence[h.e] === 1;
        if (on && color.get(of[v]) !== h.color) return [{ message: `A ${h.color} dot is passed by the ${h.color} line.`, borders: h.at === "line" ? [h.e] : g.cornerBorders[v] }];
      }
    }
    return [];
  },
  asp(s: RuleSpec, p: Puzzle) {
    const g = p.grid, sym = symmetryOf(s), k = sym ? 2 : 1, out: string[] = [];
    const starts = startsOf(p), ends = endsOf(p);
    for (const { v, color } of starts) out.push(`pstart(${v}).${color ? ` scol(${v},${color}).` : ""}`);
    for (const v of ends) out.push(`pend(${v}).`);
    for (const e of p.gaps) out.push(`:- fence(${e}).`);
    out.push(`
pdeg(V,N) :- corner(V), N = #count{B: fence(B), vb(V,B)}.
${k} { ustart(V): pstart(V) } ${k}.
${k} { uend(V): pend(V) } ${k}.
:- ustart(V), uend(V).
:- ustart(V), pdeg(V,N), N != 1.
:- uend(V), pdeg(V,N), N != 1.
:- corner(V), not ustart(V), not uend(V), pdeg(V,N), N != 0, N != 2.
on(S,S) :- ustart(S).
on(S,W) :- on(S,V), fence(B), vb(V,B), vb(W,B).
:- on(S1,V), on(S2,V), S1 < S2.
:- pdeg(V,N), N > 0, not on(_,V).`);
    if (sym) {
      for (const e of g.borders) out.push(`mb(${e.id},${mirrorBorder(g, e.id, sym)}).`);
      for (let v = 0; v < g.cornerCount; v++) out.push(`mv(${v},${mirrorCorner(g, v, sym)}).`);
      out.push(`:- fence(B), mb(B,B2), not fence(B2).
:- on(S,V), mv(V,W), on(S,W).   % a line and its mirror image are two lines`);
      for (const h of hexagonsOf(p)) if (h.color) {
        if (h.at === "corner") out.push(`:- pdeg(${h.v},N), N > 0, on(S,${h.v}), not scol(S,${h.color}).`);
        else out.push(`:- fence(${h.e}), on(S,${g.borders[h.e].corners[0]}), not scol(S,${h.color}).`);
      }
    }
    return out.join("\n");
  },
};

// ---- the symbols ----

interface Sym { id: number; kind: "hexagon" | CellSymbol["kind"]; cell: number; x?: CellSymbol; hex?: Hexagon }

/** Every symbol that can sit in a region, with an id: cell symbols, then the dots. */
function symbolsOf(p: Puzzle): Sym[] {
  const cells = cellSymbolsOf(p).map(({ i, x }, id) => ({ id, kind: x.kind, cell: i, x }) as Sym);
  return [...cells, ...hexagonsOf(p).map((hex, k) => ({ id: cells.length + k, kind: "hexagon" as const, cell: -1, hex }))];
}

const colorOf = (x: Sym) => (x.x && (x.x.kind === "square" || x.x.kind === "star") ? x.x.color : null);

/** What's wrong in a region with these symbols left (erasers and erased ones taken out). */
function regionProblems(p: Puzzle, b: Board, region: number[], live: Sym[]): Problem[] {
  const g = p.grid, out: Problem[] = [];
  const squares = live.filter((x) => x.kind === "square");
  if (new Set(squares.map(colorOf)).size > 1) out.push({ message: "Squares of different colors must be kept apart.", cells: squares.map((x) => x.cell) });
  for (const st of live.filter((x) => x.kind === "star")) {
    const n = live.filter((x) => (x.kind === "square" || x.kind === "star") && colorOf(x) === colorOf(st)).length;
    if (n !== 2) out.push({ message: `A star needs exactly one partner of its color in its region (a star or a square): ${n === 1 ? "this one has none" : "this one has too many"}.`, cells: [st.cell] });
  }
  for (const t of live.filter((x) => x.kind === "triangle")) {
    const want = t.x!.kind === "triangle" ? t.x!.value : 0, have = g.cellBorders[t.cell].filter((e) => b.fence[e] === 1).length;
    if (have !== want) out.push({ message: `The line runs along exactly ${want} of this square's sides.`, cells: [t.cell] });
  }
  const dots = live.filter((x) => x.kind === "hexagon");
  if (dots.length) out.push({ message: "The line passes through every dot.", borders: dots.flatMap((x) => (x.hex!.at === "line" ? [x.hex!.e] : g.cornerBorders[x.hex!.v])) });
  const shapes = live.filter((x) => x.kind === "shape").map((x) => x.x as Extract<CellSymbol, { kind: "shape" }>);
  if (shapes.length && !packs(g, region, shapes.map((x) => ({ cells: x.value, rotate: !!x.rotate, negative: !!x.negative }))))
    out.push({ message: "A region with shapes is exactly those shapes fitted together.", cells: region });
  return out;
}

const combinations = <T,>(xs: T[], k: number): T[][] =>
  k === 0 ? [[]] : xs.flatMap((x, i) => combinations(xs.slice(i + 1), k - 1).map((rest) => [x, ...rest]));

export const panelSymbols = {
  describe(_s: RuleSpec, p: Puzzle) {
    const kinds = new Set(symbolsOf(p).map((x) => x.kind)), out: string[] = [];
    if (kinds.has("hexagon")) out.push("The line passes through every dot.");
    if (kinds.has("square")) out.push("The line keeps squares of different colors apart: no region holds two colors.");
    if (kinds.has("star")) out.push("Each star shares its region with exactly one other star or square of its color.");
    if (kinds.has("triangle")) out.push("The line runs along as many sides of a square as it has triangles.");
    if (kinds.has("shape")) {
      const sh = cellSymbolsOf(p).map(({ x }) => x).filter((x) => x.kind === "shape") as Extract<CellSymbol, { kind: "shape" }>[];
      out.push(`A region holding shapes is exactly its shapes fitted together, as drawn${sh.some((x) => x.rotate) ? " (tilted shapes can be turned)" : ""}.${sh.some((x) => x.negative) ? " Hollow shapes take away: each cancels cells of the others." : ""}`);
    }
    if (kinds.has("eraser")) out.push("An eraser cancels itself and one other symbol in its region, and only when it's needed: the region mustn't work without it.");
    return out.join(" ");
  },
  check(_s: RuleSpec, p: Puzzle, b: Board, r: () => Regions): Problem[] {
    const g = p.grid, reg = r(), syms = symbolsOf(p), out: Problem[] = [];
    if (!syms.length) return [];
    // a dot on the line is in no region; one off it is in the region around it
    const visited = (v: number) => g.cornerBorders[v].some((e) => b.fence[e] === 1);
    const regionOf = (x: Sym) => {
      if (x.kind !== "hexagon") return reg.of[x.cell];
      const h = x.hex!;
      if (h.at === "corner") return visited(h.v) ? -1 : reg.of[cornerCells(g, h.v)[0]];
      return b.fence[h.e] === 1 ? -1 : reg.of[g.borders[h.e].cells.find((c) => c >= 0)!];
    };
    const byRegion = new Map<number, Sym[]>();
    for (const x of syms) { const k = regionOf(x); if (k >= 0) byRegion.set(k, [...(byRegion.get(k) ?? []), x]); }
    for (const [k, inside] of byRegion) {
      const erasers = inside.filter((x) => x.kind === "eraser"), others = inside.filter((x) => x.kind !== "eraser");
      const region = reg.cells[k];
      const works = (gone: Sym[]) => !regionProblems(p, b, region, others.filter((x) => !gone.includes(x))).length;
      if (!erasers.length) { out.push(...regionProblems(p, b, region, others)); continue; }
      if (others.length < erasers.length) { out.push({ message: "An eraser needs another symbol in its region to cancel.", cells: erasers.map((x) => x.cell) }); continue; }
      const unneeded = { message: "An eraser only cancels a symbol that would otherwise be wrong: this region works without it.", cells: erasers.map((x) => x.cell) };
      if (!combinations(others, erasers.length).some(works)) {
        const left = regionProblems(p, b, region, others);
        out.push(...(left.length ? left : [unneeded]));
        continue;
      }
      for (let j = 0; j < erasers.length; j++) if (combinations(others, j).some(works)) { out.push(unneeded); break; }
    }
    return out;
  },
  asp(_s: RuleSpec, p: Puzzle) {
    const g = p.grid, syms = symbolsOf(p), out: string[] = [];
    if (!syms.length) return "";
    const erasers = syms.filter((x) => x.kind === "eraser").length, shapes = syms.filter((x) => x.kind === "shape");
    if (erasers > 2) throw new Error("a panel can have at most two erasers");
    if (erasers && shapes.length) throw new Error("erasers and shapes don't go in the same panel (yet)");
    for (const x of syms) {
      out.push(`sym(${x.id}).`);
      if (x.kind === "hexagon") out.push(x.hex!.at === "corner" ? `hexv(${x.id},${x.hex!.v}).` : `hexb(${x.id},${x.hex!.e}).`);
      else out.push(`scell(${x.id},${x.cell}).`);
      if (x.kind === "square") out.push(`sq(${x.id},${colorOf(x)}). colored(${x.id},${colorOf(x)}).`);
      if (x.kind === "star") out.push(`st(${x.id},${colorOf(x)}). colored(${x.id},${colorOf(x)}).`);
      if (x.kind === "triangle" && x.x!.kind === "triangle") out.push(`tri(${x.id},${x.x!.value}).`);
      if (x.kind === "eraser") out.push(`er(${x.id}).`);
    }
    for (const x of syms) if (x.kind === "hexagon" && x.hex!.at === "corner") for (const c of cornerCells(g, x.hex!.v)) out.push(`vcell(${x.hex!.v},${c}).`);
    out.push(`
vis(V) :- fence(B), vb(V,B).
inreg(X,R) :- scell(X,I), member(R,I).
inreg(X,R) :- hexv(X,V), not vis(V), vcell(V,I), member(R,I).
inreg(X,R) :- hexb(X,B), not fence(B), cb(I,B), member(R,I).`);
    out.push(erasers ? `
1 { erase(E,X): inreg(X,R), not er(X) } 1 :- er(E), inreg(E,R).
:- erase(E1,X), erase(E2,X), E1 < E2.
gone(X) :- erase(_,X).
live(X) :- inreg(X,_), not er(X), not gone(X).` : "live(X) :- inreg(X,_).");
    out.push(`
:- live(X), live(Y), sq(X,C), sq(Y,D), C != D, inreg(X,R), inreg(Y,R).
:- live(X), st(X,C), inreg(X,R), #count{Y: live(Y), colored(Y,C), inreg(Y,R)} != 2.
:- live(X), tri(X,N), scell(X,I), N != #count{B: fence(B), cb(I,B)}.
:- live(X), hexv(X,_).
:- live(X), hexb(X,_).`);
    if (shapes.length) {
      const negative = shapes.some((x) => x.x!.kind === "shape" && x.x!.negative);
      for (const x of shapes) {
        const sh = x.x as Extract<CellSymbol, { kind: "shape" }>;
        out.push(`shp(${x.id}). ${sh.negative ? "neg" : "pos"}(${x.id}).`);
        placements(g, sh.value, !!sh.rotate).forEach((pl, k) => out.push(`pl(${x.id},${k}).${pl.map((c) => ` pc(${x.id},${k},${c}).`).join("")}`));
      }
      out.push(`
1 { place(X,P): pl(X,P) } 1 :- live(X), shp(X).
hasshape(R) :- live(X), shp(X), inreg(X,R).`);
      out.push(negative ? `
1 { iv(R,0); iv(R,1) } 1 :- hasshape(R).
net(R,C,N) :- hasshape(R), cell(C), N = #sum{ 1,X: place(X,P), pc(X,P,C), inreg(X,R), pos(X); -1,X: place(X,P), pc(X,P,C), inreg(X,R), neg(X) }.
:- net(R,C,N), member(R,C), iv(R,K), N != K.
:- net(R,C,N), not member(R,C), N != 0.` : `
:- place(X,P), pc(X,P,C), inreg(X,R), not member(R,C).
:- hasshape(R), member(R,C), #count{X: place(X,P), pc(X,P,C), inreg(X,R)} != 1.`);
    }
    if (erasers) out.push(`
% an eraser must be needed: the region doesn't work with nothing erased...
kreg(R,K) :- root(R), K = #count{E: er(E), inreg(E,R)}, K > 0.
cand(R,X) :- inreg(X,R), not er(X).
v0(R) :- cand(R,X), cand(R,Y), sq(X,C), sq(Y,D), C != D.
v0(R) :- cand(R,X), st(X,C), #count{Y: cand(R,Y), colored(Y,C)} != 2.
v0(R) :- cand(R,X), tri(X,N), scell(X,I), N != #count{B: fence(B), cb(I,B)}.
v0(R) :- cand(R,X), hexv(X,_).
v0(R) :- cand(R,X), hexb(X,_).
:- kreg(R,_), not v0(R).
% ...and with two erasers, no single symbol taken out makes it work
v1(R,Z) :- kreg(R,2), cand(R,Z), cand(R,X), cand(R,Y), X != Z, Y != Z, sq(X,C), sq(Y,D), C != D.
v1(R,Z) :- kreg(R,2), cand(R,Z), cand(R,X), X != Z, st(X,C), #count{Y: cand(R,Y), colored(Y,C), Y != Z} != 2.
v1(R,Z) :- kreg(R,2), cand(R,Z), cand(R,X), X != Z, tri(X,N), scell(X,I), N != #count{B: fence(B), cb(I,B)}.
v1(R,Z) :- kreg(R,2), cand(R,Z), cand(R,X), X != Z, hexv(X,_).
v1(R,Z) :- kreg(R,2), cand(R,Z), cand(R,X), X != Z, hexb(X,_).
:- kreg(R,2), cand(R,Z), not v1(R,Z).`);
    return out.join("\n");
  },
  needs: ["regions"] as ("regions" | "shapes")[],
};

export { cornerOf };
