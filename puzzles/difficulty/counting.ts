// Counting across units, for the deduction solver (deduce.ts), in any type whose rules say "this
// unit holds exactly n of these marks": Star Battle's stars per row, column and area; Sudoku's
// each digit once per row, column and box. The idea is one schema, pigeonhole across units:
//
//   k units of one family need d stars between them, and every place left for those stars lies
//   in units of another family that need just d too. Then those other units are used up: their
//   cells outside the first k hold none.
//
// Star Battle's guides call it undercounting and overcounting (k areas inside k rows, k rows inside
// k areas); in Sudoku it's pointing and claiming (k = 1) and the fish, X-Wing and Swordfish
// (rows against columns). The solver can't see it in a row or an area alone, and a case split
// can't add constraints up, so it fell to search. Here each such set of units becomes a window,
// and the solver proves and explains it as it does any other (docs/research-star-battle.md).
import type { Puzzle, RuleSpec } from "../../src/engine/types.ts";

export interface CountUnit { label: string; cells: number[]; need: number }
/** Units of one kind (rows, columns, areas, boxes) counting one mark. */
export interface CountFamily { name: string; units: CountUnit[] }
/** Families counting the same mark: units of different families may be set against each other. */
export interface CountSystem { label: string; mark: (cell: number) => string; families: CountFamily[] }

/** The count systems a puzzle's rules define. `boxes` are the program's boxes (box(I,K) facts). */
export function countSystems(p: Puzzle, boxes: number[][]): CountSystem[] {
  const g = p.grid;
  if (g.kind !== "square" || p.figure) return [];
  const rows = Array.from({ length: g.rows }, (_, r) => Array.from({ length: g.cols }, (_, c) => g.cell(r, c)));
  const cols = Array.from({ length: g.cols }, (_, c) => Array.from({ length: g.rows }, (_, r) => g.cell(r, c)));
  const areas = p.areas?.cells ?? [];
  const fam = (name: string, label: (k: number) => string, sets: number[][], need: number): CountFamily =>
    ({ name, units: sets.map((cells, k) => ({ label: label(k), cells, need })) });
  const byRow = (need: number) => fam("rows", (k) => `row ${k + 1}`, rows, need);
  const byCol = (need: number) => fam("columns", (k) => `column ${k + 1}`, cols, need);
  const out: CountSystem[] = [];
  const names = new Map(p.rules.map((r) => [r.rule, r]));

  const line = names.get("shaded-per-line"), area = names.get("shaded-per-area");
  if (line || area) {
    const families: CountFamily[] = [];
    const n = (r: RuleSpec) => (typeof r.n === "number" ? r.n : 1);
    if (line) families.push(byRow(n(line)), byCol(n(line)));
    if (area && areas.length) families.push(fam("areas", (k) => `area ${String.fromCharCode(97 + (k % 26))}`, areas, n(area)));
    if (families.length > 1) out.push({ label: "shaded", mark: (i) => `shaded(${i})`, families });
  }

  if (names.has("latin") && !p.blocked.size && p.digits === g.rows && g.rows === g.cols) {
    for (let d = 1; d <= p.digits; d++) {
      const families = [byRow(1), byCol(1)];
      if (names.has("boxes") && boxes.length) families.push(fam("boxes", (k) => `box ${k + 1}`, boxes, 1));
      out.push({ label: `${d}s`, mark: (i) => `digit(${i},${d})`, families });
    }
  }
  return out;
}

/** A set of units whose counting settles cells: the units counted (`from`), the units used up
 *  (`into`), and the cells of both, which the solver checks as one window. */
export interface CountSet { label: string; cells: number[]; size: number }

/** Every set of up to `maxK` units of one family whose remaining marks must all fall in units of
 *  another family that need exactly as many, leaving open cells in those to clear. `state(m)` is
 *  a mark's state: 1 true, 0 false, -1 open, undefined when the mark doesn't exist (no such cell). */
export function countSets(systems: CountSystem[], state: (mark: string) => number | undefined, maxK = 4): CountSet[] {
  const out: CountSet[] = [];
  for (const sys of systems) {
    // per unit: how many marks it still needs, and its open cells
    const info = sys.families.map((f) => f.units.map((u) => {
      let have = 0;
      const open: number[] = [];
      for (const c of u.cells) { const s = state(sys.mark(c)); if (s === 1) have++; else if (s === -1) open.push(c); }
      return { u, left: u.need - have, open };
    }));
    // which unit of each family holds each cell
    const unitAt = info.map((units) => { const m = new Map<number, number>(); units.forEach((x, k) => x.u.cells.forEach((c) => m.set(c, k))); return m; });
    for (let a = 0; a < info.length; a++) for (let b = 0; b < info.length; b++) {
      if (a === b) continue;
      const live = info[a].map((x, k) => [x, k] as const).filter(([x]) => x.left > 0 && x.open.length);
      const pick: number[] = [];
      const visit = (start: number) => {
        if (pick.length) {
          // the other family's units holding the picked units' open cells
          const ys = new Set<number>(), xs = new Set<number>();
          let need = 0;
          for (const k of pick) { need += info[a][k].left; for (const c of info[a][k].open) { xs.add(c); const y = unitAt[b].get(c); if (y !== undefined) ys.add(y); } }
          let have = 0, spare = false;
          for (const y of ys) { have += info[b][y].left; if (info[b][y].open.some((c) => !xs.has(c))) spare = true; }
          if (need === have && spare) {
            const cells = new Set<number>();
            for (const k of pick) for (const c of info[a][k].u.cells) cells.add(c);
            for (const y of ys) for (const c of info[b][y].u.cells) cells.add(c);
            const name = (f: number, ks: Iterable<number>) => [...ks].map((k) => info[f][k].u.label).join(", ");
            out.push({ label: `${sys.label}: ${name(a, pick)} inside ${name(b, ys)}`, cells: [...cells].sort((x, y) => x - y), size: cells.size });
          }
        }
        if (pick.length >= maxK) return;
        for (let i = start; i < live.length; i++) { pick.push(live[i][1]); visit(i + 1); pick.pop(); }
      };
      visit(0);
    }
  }
  return out;
}
