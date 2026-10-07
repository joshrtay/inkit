// What the on-puzzle editor does to a puzzle, as plain functions: each takes a puzzle description
// and returns the changed one (the same object when nothing changes). BoardEditor works out what
// was touched and calls these; tests call them directly (tests/unit/ops.test.ts).
import { runsOf } from "~site/engine/rules.ts";
import type { Given, GridSpec, Side } from "~site/engine/types.ts";

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
    const ok = g.at === "cell" ? inside(g.cell) : g.at === "border" ? g.cells.every(inside)
      : g.at === "corner" ? g.corner[0] <= r && g.corner[1] <= c
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
