// What the on-puzzle editor does to a puzzle, as plain functions: each takes a puzzle description
// and returns the changed one (the same object when nothing changes). BoardEditor works out what
// was touched and calls these; tests call them directly (tests/unit/ops.test.ts).
import { genres, type GenreName } from "~site/engine/puzzle.ts";
import type { Symmetry } from "~site/engine/panel.ts";
import { runsOf } from "~site/engine/rules.ts";
import type { Given, GridSpec, LineColor, RuleSpec, Side, SymbolColor } from "~site/engine/types.ts";

export type RC = [number, number];
type Spec = GridSpec;

export const same = (a: RC, b: RC) => a[0] === b[0] && a[1] === b[1];
const at = (cell: RC) => (g: Given) => g.at === "cell" && same(g.cell, cell);
export const onBorder = (g: Given, a: RC, b: RC) => g.at === "border" && ((same(g.cells[0], a) && same(g.cells[1], b)) || (same(g.cells[0], b) && same(g.cells[1], a)));
const givensOf = (s: Spec) => s.givens ?? [];
const withGivens = (s: Spec, givens: Given[]): Spec => (JSON.stringify(givens) === JSON.stringify(givensOf(s)) ? s : { ...s, givens });

/** Types where a number sits on a black square (the square stays black). */
const NUMBERS_ON_BLOCKS = new Set(["akari", "panes"]);

/** A square's number, or none (null). In Akari a number makes its square black. */
export function setNumber(s: Spec, cell: RC, value: number | null): Spec {
  const keepsBlock = NUMBERS_ON_BLOCKS.has(s.genre ?? "");
  const rest = givensOf(s).filter((g) => !(at(cell)(g) && (g.kind !== "block" || !keepsBlock)));
  let next: Given[] = value === null ? rest : [...rest, { at: "cell", cell, kind: "number", value }];
  if (s.genre === "akari" && value !== null && !rest.some((g) => at(cell)(g) && g.kind === "block")) next = [...next, { at: "cell", cell, kind: "block" }];
  return withGivens(s, next);
}

/** A rock (black square) on or off. It replaces what was in the square, except a number on a
 *  black square (Akari, Panes). */
export function setBlock(s: Spec, cell: RC, on: boolean): Spec {
  const gs = givensOf(s);
  if (gs.some((g) => at(cell)(g) && g.kind === "block") === on) return s;
  const keepsNumber = NUMBERS_ON_BLOCKS.has(s.genre ?? "") && on;
  const rest = gs.filter((g) => !(at(cell)(g) && (g.kind === "block" || !(keepsNumber && g.kind === "number"))));
  return withGivens(s, on ? [...rest, { at: "cell", cell, kind: "block" }] : rest);
}

export const hasBlock = (s: Spec, cell: RC) => givensOf(s).some((g) => at(cell)(g) && g.kind === "block");

/** A symbol in a square, on or off (Panes). */
export function toggleSymbol(s: Spec, cell: RC): Spec {
  const gs = givensOf(s), has = gs.some((g) => at(cell)(g) && g.kind === "symbol");
  return withGivens(s, [...gs.filter((g) => !(at(cell)(g) && g.kind === "symbol")), ...(has ? [] : [{ at: "cell", cell, kind: "symbol", value: "★" } as Given])]);
}

/** A square's pearl: none, white, black, none (Masyu). */
export function cyclePearl(s: Spec, cell: RC): Spec {
  const gs = givensOf(s), had = gs.find((g) => at(cell)(g) && g.kind === "pearl");
  const color = !had ? "white" : had.kind === "pearl" && had.value === "white" ? "black" : null;
  return withGivens(s, [...gs.filter((g) => !at(cell)(g)), ...(color ? [{ at: "cell", cell, kind: "pearl", value: color } as Given] : [])]);
}

/** A square's compass numbers (Panes), or none. */
export function setCompass(s: Spec, cell: RC, value: { n?: number; e?: number; s?: number; w?: number } | null): Spec {
  const rest = givensOf(s).filter((g) => !(at(cell)(g) && g.kind === "compass"));
  return withGivens(s, value && Object.keys(value).length ? [...rest, { at: "cell", cell, kind: "compass", value }] : rest);
}

/** The line between two squares: a wall on or off; or ◆ same shape, ◇ different shape, none. */
export function toggleBorder(s: Spec, a: RC, b: RC, tool: "wall" | "diamond"): Spec {
  const gs = givensOf(s), had = gs.find((g) => onBorder(g, a, b)), rest = gs.filter((g) => !onBorder(g, a, b));
  const kind = tool === "wall" ? (had ? null : "wall") : !had ? "twins" : had.kind === "twins" ? "opposites" : null;
  return withGivens(s, kind ? [...rest, { at: "border", cells: [a, b], kind } as Given] : rest);
}

/** A galaxy circle at a point (half-square steps: [2r+1, 2c+1] is a square's centre), on or off. */
export function toggleGalaxy(s: Spec, point: RC): Spec {
  const gs = givensOf(s), here = (g: Given) => g.at === "point" && same(g.point, point);
  return withGivens(s, gs.some(here) ? gs.filter((g) => !here(g)) : [...gs, { at: "point", point, kind: "galaxy" }]);
}

/** A thermometer through these squares, bulb first (two or more, each next to the one before). */
export const addThermo = (s: Spec, cells: RC[]): Spec => (cells.length < 2 ? s : withGivens(s, [...givensOf(s), { at: "cells", cells, kind: "thermo" }]));
/** The thermometer through a square, removed. */
export const removeThermoAt = (s: Spec, cell: RC): Spec => withGivens(s, givensOf(s).filter((g) => !(g.at === "cells" && g.cells.some((x) => same(x, cell)))));

/** The door beside a square on the outside edge: none, way in, way out, none. There's one way in
 *  and one way out, so a new one moves it. */
export function cycleDoor(s: Spec, cell: RC, side: Side): Spec {
  const here = (g: Given) => g.at === "edge" && same(g.cell, cell) && g.side === side;
  const gs = givensOf(s), had = gs.find(here);
  const role = !had ? "in" : had.kind === "door" && had.role === "in" ? "out" : null;
  const rest = gs.filter((g) => !here(g) && !(role && g.kind === "door" && g.role === role));
  return withGivens(s, role ? [...rest, { at: "edge", cell, side, kind: "door", role }] : rest);
}

/** A number (Skyscrapers) or letter (Easy as ABC, 1 = A) just outside the grid, or none. */
export function setOutside(s: Spec, cell: RC, side: Side, kind: "first" | "skyscraper", value: number | null): Spec {
  const rest = givensOf(s).filter((g) => !(g.at === "edge" && same(g.cell, cell) && g.side === side && g.kind !== "door"));
  return withGivens(s, value === null ? rest : [...rest, { at: "edge", cell, side, kind, value }]);
}

/** A number where grid lines meet (Number Line Maze), or none. */
export function setCorner(s: Spec, corner: RC, value: number | null): Spec {
  const rest = givensOf(s).filter((g) => !(g.at === "corner" && same(g.corner, corner)));
  return withGivens(s, value === null ? rest : [...rest, { at: "corner", corner, kind: "count", value }]);
}

/** A row's or column's numbers: a nonogram's runs, or how many are shaded (Aquarium), or none. */
export function setLine(s: Spec, line: "row" | "col", index: number, clue: { kind: "runs"; value: number[] } | { kind: "total"; value: number } | null): Spec {
  const rest = givensOf(s).filter((g) => !(g.at === line && g.index === index));
  return withGivens(s, clue ? [...rest, { at: line, index, ...clue } as Given] : rest);
}

/** A nonogram picture square filled with a color (its letter in `palette`), or cleared ("."); colors
 *  no square uses any more drop out of the palette. */
export function paintSquare(s: Spec, cell: RC, letter: string, palette: Record<string, string>): Spec {
  const pic = s.picture;
  if (!pic || pic.rows[cell[0]]?.[cell[1]] === letter) return s;
  const rows = pic.rows.map((row, y) => (y !== cell[0] ? row : row.slice(0, cell[1]) + letter + row.slice(cell[1] + 1)));
  const used = new Set(rows.join(""));
  return { ...s, picture: { ...pic, rows, palette: Object.fromEntries(Object.entries(palette).filter(([k]) => k === "." || used.has(k))) } };
}

/** A square moved into an outlined area. */
export function paintArea(s: Spec, cell: RC, letter: string): Spec {
  const ar = s.areas;
  if (!ar || ar[cell[0]]?.[cell[1]] === letter) return s;
  return { ...s, areas: ar.map((row, y) => (y !== cell[0] ? row : row.slice(0, cell[1]) + letter + row.slice(cell[1] + 1))) };
}

/** A new size (2 to 30 a side), growing or shrinking at the bottom and right. Clues that fall off
 *  go; clues outside the bottom or right edge move with it; the picture and areas follow. */
export function resize(s: Spec, rows: number, cols: number): Spec {
  const r = Math.max(2, Math.min(30, rows)), c = Math.max(2, Math.min(30, cols));
  const inside = ([y, x]: RC) => y < r && x < c;
  const givens = givensOf(s).flatMap((g): Given[] => {
    if (g.at === "edge" && (g.side === "bottom" || g.side === "right")) {
      const cell: RC = g.side === "bottom" ? [r - 1, g.cell[1]] : [g.cell[0], c - 1];
      return inside(cell) ? [{ ...g, cell }] : [];
    }
    // a panel's ends stay on the bottom / right edge as it moves
    if (g.at === "corner" && g.kind === "end") {
      const corner: RC = [g.corner[0] === s.size[0] ? r : g.corner[0], g.corner[1] === s.size[1] ? c : g.corner[1]];
      return corner[0] <= r && corner[1] <= c ? [{ ...g, corner }] : [];
    }
    const ok = g.at === "cell" ? inside(g.cell) : g.at === "border" ? g.cells.every(inside)
      : g.at === "corner" ? g.corner[0] <= r && g.corner[1] <= c
        : g.at === "line" ? g.corners.every(([y, x]) => y <= r && x <= c)
        : g.at === "edge" ? inside(g.cell)
          : g.at === "cells" ? g.cells.every(inside) : g.at === "point" ? g.point[0] < 2 * r && g.point[1] < 2 * c
            : g.index < (g.at === "row" ? r : c);
    return ok ? [g] : [];
  });
  const pic = s.picture, ar = s.areas;
  return {
    ...s, size: [r, c], givens,
    ...(pic ? { picture: { ...pic, rows: Array.from({ length: r }, (_, y) => (pic.rows[y] ?? "").padEnd(c, ".").slice(0, c)) } } : {}),
    ...(ar ? { areas: Array.from({ length: r }, (_, y) => { const row = ar[Math.min(y, ar.length - 1)]; return row.padEnd(c, row.at(-1)).slice(0, c); }) } : {}),
  };
}

/** A nonogram drawn as a picture (its numbers follow it): an empty one to paint. */
export function toPicture(s: Spec): Spec {
  const [rows, cols] = s.size;
  return { ...s, givens: givensOf(s).filter((g) => g.at !== "row" && g.at !== "col"), picture: { rows: Array.from({ length: rows }, () => ".".repeat(cols)), palette: { ".": "#ffffff" } } };
}

/** A nonogram as numbers only: the picture's numbers, typed out, and no picture. */
export function toNumbers(s: Spec): Spec {
  const cols = s.size[1];
  const on = (s.picture?.rows ?? []).map((row) => [...row].map((ch) => ch !== "."));
  const { picture: _gone, ...rest } = s;
  return { ...rest, givens: [
    ...givensOf(s).filter((g) => g.at !== "row" && g.at !== "col"),
    ...on.map((row, r): Given => ({ at: "row", index: r, kind: "runs", value: runsOf(row) })),
    ...Array.from({ length: cols }, (_, c): Given => ({ at: "col", index: c, kind: "runs", value: runsOf(on.map((row) => row[c] ?? false)) })),
  ] };
}

/** Star Battle: how many stars in each row, column and area (1 is the type's own rule). */
export const starsOf = (s: Spec) => ((s.rules ?? []).find((x) => x.rule === "shaded-per-line")?.n as number | undefined) ?? 1;
export function setStars(s: Spec, n: number): Spec {
  const others = (s.rules ?? []).filter((x) => x.rule !== "shaded-per-line" && x.rule !== "shaded-per-area");
  const rules = n === 1 ? others : [...others, { rule: "shaded-per-line", n }, { rule: "shaded-per-area", n }];
  const { rules: _r, ...rest } = s;
  return rules.length ? { ...rest, rules } : rest;
}

/** Areas added to a puzzle that has none: all one area, to paint the others into. */
export const addAreas = (s: Spec): Spec => ({ ...s, areas: Array.from({ length: s.size[0] }, () => "a".repeat(s.size[1])) });

/** Clues matching `pred`, removed (the same puzzle if none match). */
export const removeGivens = (s: Spec, pred: (g: Given) => boolean): Spec => withGivens(s, givensOf(s).filter((g) => !pred(g)));

// ---- panels (line puzzles in the style of The Witness: src/engine/panel.ts) ----

type CellSymbol = Extract<Given, { at: "cell"; kind: "square" | "star" | "triangle" | "shape" | "eraser" }>;
/** A cell symbol as the editor places it (the cell comes from where it's placed). */
export type PanelSymbol = CellSymbol extends infer G ? (G extends { cell: RC } ? Omit<G, "at" | "cell"> : never) : never;

const presetRule = (s: Spec, rule: string) => ((genres[s.genre as GenreName]?.rules ?? []) as RuleSpec[]).find((x) => x.rule === rule);
/** A panel's symmetry: the puzzle's own panel-line rule, else its type's (null: one line). */
export function symmetryOf(s: Spec): Symmetry | null {
  const own = (s.rules ?? []).find((x) => x.rule === "panel-line");
  const rule = own ?? presetRule(s, "panel-line");
  return (rule?.symmetry as Symmetry | undefined) ?? null;
}
/** A panel's symmetry set (null: one line); the type's own symmetry needs no rule of the puzzle's. */
export function setSymmetry(s: Spec, sym: Symmetry | null): Spec {
  const preset = presetRule(s, "panel-line");
  const others = (s.rules ?? []).filter((x) => x.rule !== "panel-line");
  const rules = (preset?.symmetry ?? null) === sym ? others : [...others, { rule: "panel-line", ...(sym ? { symmetry: sym } : {}) }];
  const { rules: _r, ...rest } = s;
  return rules.length ? { ...rest, rules } : rest;
}

/** A corner's mirror image (corners run 0..rows, 0..cols). */
export function mirrorCorner(size: [number, number], [r, c]: RC, sym: Symmetry): RC {
  const [rows, cols] = size;
  return sym === "left-right" ? [r, cols - c] : sym === "up-down" ? [rows - r, c] : [rows - r, cols - c];
}
export const onEdge = (size: [number, number], [r, c]: RC) => r === 0 || c === 0 || r === size[0] || c === size[1];

const atCorner = (corner: RC, kind: Given["kind"]) => (g: Given) => g.at === "corner" && same(g.corner, corner) && g.kind === kind;
/** A stretch of grid line, whichever way round its corners are given. */
const sameLine = (a: [RC, RC], b: [RC, RC]) => (same(a[0], b[0]) && same(a[1], b[1])) || (same(a[0], b[1]) && same(a[1], b[0]));
export const onLine = (g: Given, line: [RC, RC]) => g.at === "line" && sameLine(g.corners, line);
/** Corners in reading order, so the same stretch is always written the same way. */
const ordered = ([a, b]: [RC, RC]): [RC, RC] => (a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]) ? [a, b] : [b, a]);

/** Starts or ends: a corner's on or off. With symmetry its mirror image comes and goes with it:
 *  a start's mirror is the other color (the tapped one blue, unless it's the mirror of a blue one). */
function toggleCornerPair(s: Spec, corner: RC, kind: "start" | "end"): Spec {
  const gs = givensOf(s), sym = symmetryOf(s), had = gs.find(atCorner(corner, kind));
  const mirror = sym ? mirrorCorner(s.size, corner, sym) : null;
  const pair = mirror && !same(mirror, corner) ? [corner, mirror] : [corner];
  if (had) return withGivens(s, gs.filter((g) => !pair.some((x) => atCorner(x, kind)(g))));
  const rest = gs.filter((g) => !pair.some((x) => atCorner(x, kind)(g)));
  if (kind === "end") return withGivens(s, [...rest, ...pair.map((x): Given => ({ at: "corner", corner: x, kind: "end" }))]);
  if (!sym) return withGivens(s, [...rest, { at: "corner", corner, kind: "start" }]);
  return withGivens(s, [...rest, ...pair.map((x, k): Given => ({ at: "corner", corner: x, kind: "start", color: k === 0 ? "blue" : "yellow" }))]);
}
/** A start circle on a corner, on or off (with symmetry, a blue and a yellow one, mirrored). */
export const toggleStart = (s: Spec, corner: RC): Spec => toggleCornerPair(s, corner, "start");
/** An end on a corner of the outside edge, on or off (mirrored, with symmetry). Not on the edge: no change. */
export const toggleEnd = (s: Spec, corner: RC): Spec => (onEdge(s.size, corner) ? toggleCornerPair(s, corner, "end") : s);

/** A gap in a stretch of grid line, on or off (it takes the place of a dot there). */
export function toggleGap(s: Spec, line: [RC, RC]): Spec {
  const gs = givensOf(s), had = gs.some((g) => onLine(g, line) && g.kind === "gap");
  const rest = gs.filter((g) => !onLine(g, line));
  return withGivens(s, had ? rest : [...rest, { at: "line", corners: ordered(line), kind: "gap" }]);
}

/** A dot on a corner or halfway along a stretch of line, in a color (or plain): a dot of another
 *  color there is replaced, the same one removed. A dot on a line takes the place of a gap there. */
export function toggleDot(s: Spec, where: { corner: RC } | { line: [RC, RC] }, color?: LineColor): Spec {
  const gs = givensOf(s);
  const here = (g: Given) => ("corner" in where ? g.at === "corner" && same(g.corner, where.corner) && g.kind === "hexagon" : onLine(g, where.line));
  const had = gs.find((g) => here(g) && g.kind === "hexagon") as { color?: LineColor } | undefined;
  const rest = gs.filter((g) => !here(g));
  if (had && had.color === color) return withGivens(s, rest);
  const dot = ("corner" in where ? { at: "corner", corner: where.corner, kind: "hexagon" } : { at: "line", corners: ordered(where.line), kind: "hexagon" }) as Given;
  return withGivens(s, [...rest, color ? { ...dot, color } as Given : dot]);
}

/** A symbol in a cell (one per cell): placed, replacing what was there, or removed if it's the same one. */
export function toggleCellSymbol(s: Spec, cell: RC, x: PanelSymbol): Spec {
  const gs = givensOf(s), had = gs.find(at(cell));
  const rest = gs.filter((g) => !at(cell)(g));
  const placed = { at: "cell", cell, ...x } as Given;
  const key = (g: Record<string, unknown>) => JSON.stringify([g.kind, g.color, g.value, !!g.rotate, !!g.negative]);
  if (had && key(had) === key(x)) return withGivens(s, rest);
  return withGivens(s, [...rest, placed]);
}
/** A cell's triangles: 1, 2, 3, none (replacing another symbol there). */
export function cycleTriangle(s: Spec, cell: RC): Spec {
  const gs = givensOf(s), had = gs.find((g) => at(cell)(g) && g.kind === "triangle");
  const n = had && had.kind === "triangle" ? had.value + 1 : 1;
  const rest = gs.filter((g) => !at(cell)(g));
  return withGivens(s, n > 3 ? rest : [...rest, { at: "cell", cell, kind: "triangle", value: n }]);
}

export const squareOrStar = (kind: "square" | "star", color: SymbolColor): PanelSymbol => ({ kind, color });

/** Common shapes for the Shape tool, each as cells from 0,0. */
export const SHAPES: { name: string; cells: RC[] }[] = [
  { name: "One square", cells: [[0, 0]] },
  { name: "Two in a row", cells: [[0, 0], [0, 1]] },
  { name: "Three in a row", cells: [[0, 0], [0, 1], [0, 2]] },
  { name: "Three, bent", cells: [[0, 0], [1, 0], [1, 1]] },
  { name: "Four in a row", cells: [[0, 0], [0, 1], [0, 2], [0, 3]] },
  { name: "L of four", cells: [[0, 0], [1, 0], [2, 0], [2, 1]] },
  { name: "T of four", cells: [[0, 0], [0, 1], [0, 2], [1, 1]] },
  { name: "S of four", cells: [[0, 1], [0, 2], [1, 0], [1, 1]] },
  { name: "Square of four", cells: [[0, 0], [0, 1], [1, 0], [1, 1]] },
];
/** A shape turned a quarter turn clockwise (cells from 0,0 again, in reading order). */
export function turnShape(cells: RC[]): RC[] {
  const t = cells.map(([r, c]) => [c, -r] as RC);
  const r0 = Math.min(...t.map((x) => x[0])), c0 = Math.min(...t.map((x) => x[1]));
  return t.map(([r, c]) => [r - r0, c - c0] as RC).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

// ---- where a tap lands on a panel, in squares from the grid's top-left ----

/** The corner nearest a point, if it's within `reach` squares (null otherwise, or off the grid). */
export function cornerNear(size: [number, number], gx: number, gy: number, reach = 0.5): RC | null {
  const r = Math.round(gy) || 0, c = Math.round(gx) || 0;   // never -0
  return r >= 0 && c >= 0 && r <= size[0] && c <= size[1] && Math.hypot(gy - r, gx - c) <= reach ? [r, c] : null;
}
/** The stretch of grid line nearest a point (the outside edge included), if within `reach` squares of it. */
export function lineNear(size: [number, number], gx: number, gy: number, reach = 0.35): [RC, RC] | null {
  const [rows, cols] = size;
  const cands: { d: number; line: [RC, RC] }[] = [];
  const hr = Math.round(gy) || 0, hc = Math.floor(gx);   // a horizontal stretch along row line hr
  if (hr >= 0 && hr <= rows && hc >= 0 && hc < cols) cands.push({ d: Math.abs(gy - hr), line: [[hr, hc], [hr, hc + 1]] });
  const vc = Math.round(gx) || 0, vr = Math.floor(gy);   // a vertical stretch along column line vc
  if (vc >= 0 && vc <= cols && vr >= 0 && vr < rows) cands.push({ d: Math.abs(gx - vc), line: [[vr, vc], [vr + 1, vc]] });
  const best = cands.sort((a, b) => a.d - b.d)[0];
  return best && best.d <= reach ? best.line : null;
}
/** A dot's spot: a corner if the tap is close to one, else a stretch of line. */
export function dotSpotNear(size: [number, number], gx: number, gy: number): { corner: RC } | { line: [RC, RC] } | null {
  const corner = cornerNear(size, gx, gy, 0.25);
  if (corner) return { corner };
  const line = lineNear(size, gx, gy);
  return line ? { line } : null;
}

/** Everything on a corner, removed; with symmetry, a start's or end's mirror image goes too. */
export function eraseCorner(s: Spec, corner: RC): Spec {
  const gs = givensOf(s), sym = symmetryOf(s), mirror = sym ? mirrorCorner(s.size, corner, sym) : null;
  const paired = gs.filter((g) => g.at === "corner" && same(g.corner, corner) && (g.kind === "start" || g.kind === "end")).map((g) => g.kind);
  return withGivens(s, gs.filter((g) => !(g.at === "corner" && (same(g.corner, corner) || (mirror && same(g.corner, mirror) && paired.includes(g.kind))))));
}
