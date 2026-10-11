// The candidate grid for the Sudoku technique solver: a square n × n Sudoku with boxes (4 × 4,
// 6 × 6 with 2 × 3 boxes, 9 × 9, ...), or with irregular areas instead of boxes, and optional
// thermometers. Units are the rows, the columns and the boxes (or areas). Each cell keeps a bit
// set of its candidates: bit d-1 for digit d.
import { makePuzzle } from "../../../src/engine/puzzle.ts";
import { boxesOf } from "../../../src/engine/rules.ts";
import type { GridSpec } from "../../../src/engine/types.ts";

export interface Unit { name: string; kind: "row" | "col" | "box"; cells: number[] }

export interface Shape {
  n: number;
  /** cells: n × n */
  size: number;
  units: Unit[];
  /** the units each cell is in */
  unitsOf: number[][];
  /** the cells sharing a unit with each cell (not itself) */
  peers: number[][];
  /** sees[a * size + b]: a and b share a unit */
  sees: Uint8Array;
  /** thermometers, bulb first: digits rise along them */
  thermos: number[][];
  /** boxes are the given areas (Irregular Sudoku): units are called areas */
  irregular: boolean;
}

export interface Board {
  shape: Shape;
  /** candidates per cell (a placed cell keeps its digit's bit) */
  cand: number[];
  /** placed digit per cell, 0 when empty */
  value: number[];
}

export const bit = (d: number) => 1 << (d - 1);
export function count(m: number): number { let k = 0; while (m) { m &= m - 1; k++; } return k; }
/** the digits in a bit set, smallest first */
export function digitsOf(m: number): number[] { const out: number[] = []; for (let d = 1; m; d++, m >>>= 1) if (m & 1) out.push(d); return out; }
export const lowest = (m: number) => 32 - Math.clz32(m & -m);
export const highest = (m: number) => 32 - Math.clz32(m);

export const cellName = (s: Shape, c: number) => `r${Math.floor(c / s.n) + 1}c${(c % s.n) + 1}`;
export const rowOf = (s: Shape, c: number) => Math.floor(c / s.n);
export const colOf = (s: Shape, c: number) => c % s.n;
/** the box (or area) unit a cell is in, or -1 */
export const boxOf = (s: Shape, c: number) => s.unitsOf[c].find((u) => s.units[u].kind === "box") ?? -1;

/** A shape from its boxes (each a list of cells; none for a plain latin square). */
export function makeShape(n: number, boxes: number[][], thermos: number[][] = [], irregular = false): Shape {
  if (n > 30) throw new Error("at most 30 digits");
  const size = n * n, units: Unit[] = [];
  for (let r = 0; r < n; r++) units.push({ name: `row ${r + 1}`, kind: "row", cells: Array.from({ length: n }, (_, c) => r * n + c) });
  for (let c = 0; c < n; c++) units.push({ name: `column ${c + 1}`, kind: "col", cells: Array.from({ length: n }, (_, r) => r * n + c) });
  boxes.forEach((cells, k) => {
    if (cells.length !== n) throw new Error(`${irregular ? "area" : "box"} ${k + 1} has ${cells.length} cells, not ${n}`);
    units.push({ name: `${irregular ? "area" : "box"} ${k + 1}`, kind: "box", cells: [...cells].sort((a, b) => a - b) });
  });
  const unitsOf: number[][] = Array.from({ length: size }, () => []);
  units.forEach((u, k) => u.cells.forEach((c) => unitsOf[c].push(k)));
  const sees = new Uint8Array(size * size);
  for (const u of units) for (const a of u.cells) for (const b of u.cells) if (a !== b) sees[a * size + b] = 1;
  const peers = Array.from({ length: size }, (_, a) => { const out: number[] = []; for (let b = 0; b < size; b++) if (sees[a * size + b]) out.push(b); return out; });
  return { n, size, units, unitsOf, peers, sees, thermos, irregular };
}

/** Standard boxes h × w for an n × n grid (h·w = n). */
export function standardBoxes(n: number, h: number, w: number): number[][] {
  const out: number[][] = [];
  for (let br = 0; br < n; br += h) for (let bc = 0; bc < n; bc += w) {
    const cells: number[] = [];
    for (let r = br; r < br + h; r++) for (let c = bc; c < bc + w; c++) cells.push(r * n + c);
    out.push(cells);
  }
  return out;
}

/** An empty board: every candidate open. */
export function emptyBoard(shape: Shape): Board {
  const all = (1 << shape.n) - 1;
  return { shape, cand: Array(shape.size).fill(all), value: Array(shape.size).fill(0) };
}

export const copyBoard = (b: Board): Board => ({ shape: b.shape, cand: b.cand.slice(), value: b.value.slice() });

/** Place d in c and take d out of its peers' candidates. */
export function place(b: Board, c: number, d: number) {
  b.value[c] = d;
  b.cand[c] = bit(d);
  const m = ~bit(d);
  for (const p of b.shape.peers[c]) if (!b.value[p]) b.cand[p] &= m;
}

/** A board with these givens (cell -> digit) placed; fails on two equal givens in a unit. */
export function boardOf(shape: Shape, givens: Map<number, number> | number[]): Board {
  const b = emptyBoard(shape);
  const list = Array.isArray(givens) ? givens.flatMap((d, c) => (d ? [[c, d] as const] : [])) : [...givens];
  for (const [c, d] of list) {
    if (d < 1 || d > shape.n) throw new Error(`${cellName(shape, c)}: ${d} isn't a digit 1 to ${shape.n}`);
    if (b.value[c]) throw new Error(`${cellName(shape, c)} is given twice`);
    if (!(b.cand[c] & bit(d))) throw new Error(`${cellName(shape, c)}: ${d} is already in one of its units`);
    place(b, c, d);
  }
  return b;
}

export interface SudokuPuzzle { shape: Shape; givens: number[]; name?: string }

const DIGITS = "123456789ABCDEFGHIJKLMNOPQRSTU";

/** A puzzle written as n² characters ('.' or '0' empty; 1-9 then A-U above 9): 16 (4 × 4, 2 × 2
 *  boxes), 36 (6 × 6, 2 × 3 boxes), 81 (9 × 9), 256 (16 × 16)... */
export function fromString(text: string): SudokuPuzzle {
  const chars = [...text.trim()];
  const n = Math.round(Math.sqrt(chars.length));
  if (n * n !== chars.length || n < 2) throw new Error(`a puzzle string has a square number of characters (${chars.length} isn't)`);
  let h = Math.floor(Math.sqrt(n));
  while (h > 1 && n % h) h--;
  const shape = makeShape(n, h > 1 ? standardBoxes(n, h, n / h) : []);
  const givens = chars.map((ch) => {
    if (ch === "." || ch === "0") return 0;
    const d = DIGITS.indexOf(ch.toUpperCase()) + 1;
    if (d < 1 || d > n) throw new Error(`"${ch}" isn't a digit of a ${n} × ${n} sudoku`);
    return d;
  });
  return { shape, givens };
}

export const toString = (b: Pick<Board, "value">) => b.value.map((d) => (d ? DIGITS[d - 1] : ".")).join("");

const SUPPORTED = new Set(["latin", "boxes", "thermo"]);

/** A puzzle from our GridSpec (Sudoku, Irregular Sudoku, Thermo Sudoku). */
export function fromSpec(spec: GridSpec): SudokuPuzzle {
  const p = makePuzzle(spec);
  const n = p.digits, g = p.grid;
  if (g.rows !== n || g.cols !== n || g.kind !== "square") throw new Error(`not a square sudoku (${g.rows} × ${g.cols}, digits 1 to ${n})`);
  const other = p.rules.filter((s) => !SUPPORTED.has(s.rule)).map((s) => s.rule);
  if (other.length) throw new Error(`rules the technique solver doesn't know: ${other.join(", ")}`);
  if (!p.rules.some((s) => s.rule === "latin")) throw new Error("not a sudoku: no latin rule");
  const boxRule = p.rules.find((s) => s.rule === "boxes");
  const boxes = boxRule ? boxesOf(boxRule, p) : [];
  const at = (cell: number) => { const [r, c] = g.rc(cell); return r * n + c; };
  const shape = makeShape(n, boxes.map((cs) => cs.map(at)), p.rules.some((s) => s.rule === "thermo") ? p.thermos.map((t) => t.map(at)) : [], !!p.areas && !!boxRule);
  const givens = Array(n * n).fill(0);
  for (const [cell, gs] of p.cellGivens) for (const gv of gs) if (gv.kind === "number" && typeof gv.value === "number") givens[at(cell)] = gv.value;
  return { shape, givens, name: (spec as { name?: string }).name };
}
