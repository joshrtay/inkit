// Scoring a reading against the puzzle it was drawn from (reader.spec.ts): the type, the size, the
// givens as a normalised set (missing, extra, wrong values), outlined areas, the rules and their
// settings, and whether the read puzzle has the source's solution.
import { check, makePuzzle, needsOneSolution, normalShape } from "~site/engine/puzzle.ts";
import { solve } from "~site/engine/solve.ts";
import type { Board, Given, GridSpec, Puzzle, RuleSpec } from "~site/engine/types.ts";

export interface Score {
  genre: { want: string; got: string; ok: boolean };
  size: { want: string; got: string; ok: boolean };
  givens: { total: number; correct: number; missing: string[]; extra: string[]; wrong: string[] };
  areas: { ok: boolean; cells: number } | null;
  rules: { ok: boolean; missing: string[]; extra: string[] };
  /** the read puzzle has the source's solution, and only that (panels: the source's line works) */
  solution: "same" | "different" | "none" | "many" | "skipped" | "error";
  exact: boolean;
}

/** JSON with sorted keys. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${k}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v);
}
const rc = (x: number[]) => `${x[0]},${x[1]}`;
const sortPair = (a: number[][]) => [...a].map(rc).sort().join("|");

/** A given as where it is (its key) and what it says there (its value). */
function keyed(g: Given): [string, string] {
  const { at: _at, kind, ...rest } = g as Given & Record<string, unknown>;
  void _at;
  const r = rest as Record<string, unknown>;
  switch (g.at) {
    case "cell": { const { cell, ...v } = r; if (g.kind === "shape") v.value = normalShape(g.value); return [`${kind} cell ${rc(cell as number[])}`, canonical(v)]; }
    case "corner": { const { corner, ...v } = r; return [`${kind} corner ${rc(corner as number[])}`, canonical(v)]; }
    case "line": { const { corners, ...v } = r; return [`${kind} line ${sortPair(corners as number[][])}`, canonical(v)]; }
    case "edge": { const { cell, side, ...v } = r; return [`${kind} edge ${rc(cell as number[])} ${side}`, canonical(v)]; }
    case "border": {
      const { cells, ...v } = r;
      // an inequality points at the smaller region: its order is its value
      if (g.kind === "inequality") v.smaller = rc(g.cells[0]);
      return [`${kind} border ${sortPair(cells as number[][])}`, canonical(v)];
    }
    case "cells": return [`${kind} from ${rc(g.cells[0])}`, g.cells.map(rc).join(" ")];
    case "point": return [`${kind} point ${rc(g.point)}`, ""];
    case "row": case "col": return [`${kind} ${g.at} ${(g as { index: number }).index}`, canonical(r.value)];
    case "aside": return [`${kind} ${canonical(normalShape((g as { value: [number, number][] }).value))}`, ""];
  }
}

/** The givens to compare: a nonogram's runs worked out from its picture (either can be drawn). */
function givensOf(p: Puzzle): Given[] {
  const out = (p.spec.givens ?? []).filter((g) => g.kind !== "runs");
  if (p.rowRuns.size || p.colRuns.size) {
    for (const [index, value] of p.rowRuns) out.push({ at: "row", index, kind: "runs", value } as Given);
    for (const [index, value] of p.colRuns) out.push({ at: "col", index, kind: "runs", value } as Given);
  }
  return out;
}

/** Areas as a partition: each cell's area numbered in reading order of first appearance. */
const partition = (areas: string[]) => { const seen = new Map<string, number>(); return areas.map((row) => [...row].map((ch) => { if (!seen.has(ch)) seen.set(ch, seen.size); return seen.get(ch)!; })); };

/** A rule as compared: sorted settings; a panel's plain one line is what every panel has. */
const rulesOf = (rules: RuleSpec[] | undefined) => (rules ?? []).filter((r) => r.rule !== "panel-line" || r.symmetry).map(canonical);

/** RYB: each source piece's matching read piece (by where its middle is, the figures scaled to fit). */
function pieceMap(a: number[][][], b: number[][][]): number[] | null {
  if (a.length !== b.length) return null;
  const mids = (f: number[][][]) => {
    const pts = f.flat(), x0 = Math.min(...pts.map((q) => q[0])), y0 = Math.min(...pts.map((q) => q[1]));
    const span = Math.max(Math.max(...pts.map((q) => q[0])) - x0, Math.max(...pts.map((q) => q[1])) - y0) || 1;
    return f.map((piece) => [piece.reduce((s, q) => s + q[0], 0) / piece.length, piece.reduce((s, q) => s + q[1], 0) / piece.length].map((v, k) => (v - [x0, y0][k]) / span));
  };
  const ma = mids(a), mb = mids(b), used = new Set<number>();
  return ma.map((p) => {
    let best = -1, d = Infinity;
    mb.forEach((q, j) => { const e = Math.hypot(p[0] - q[0], p[1] - q[1]); if (!used.has(j) && e < d) { d = e; best = j; } });
    used.add(best);
    return best;
  });
}

/** Has the read puzzle got the source's solution? */
async function sameSolution(src: Puzzle, read: Puzzle, pieces: number[] | null): Promise<Score["solution"]> {
  try {
    const [want] = await solve(src, 1);
    if (!want) return "error";
    let board: Board = want;
    if (pieces) {   // RYB: the source's colours on the matching read pieces
      const color = new Uint8Array(want.color.length);
      pieces.forEach((j, i) => { color[j] = want.color[i]; });
      board = { ...want, color };
    }
    if (check(read, board).length) return "different";
    if (!needsOneSolution(read.spec.genre)) return "same";   // panels: any line that obeys the symbols
    const got = await solve(read, 2);
    return got.length === 0 ? "none" : got.length > 1 ? "many" : "same";
  } catch {
    return "error";
  }
}

/** Score a read sketch's puzzle against the source. `solveIt` false skips the solution check. */
export async function score(source: GridSpec, read: GridSpec | null, solveIt = true): Promise<Score> {
  const src = makePuzzle(source);
  let got: Puzzle | null = null;
  try { got = read ? makePuzzle(read, { unfinished: true }) : null; } catch { got = null; }
  const genre = { want: source.genre!, got: read?.genre ?? "(none)", ok: source.genre === read?.genre };
  const size = { want: source.size.join("x"), got: read ? read.size.join("x") : "-", ok: !!read && source.size.join("x") === read.size.join("x") };

  // givens: the same clue at the same place; a different value there is wrong, not missing + extra
  let want = givensOf(src), have = got ? givensOf(got) : (read?.givens ?? []);
  const pieces = source.figure && read?.figure ? pieceMap(source.figure.pieces, read.figure.pieces) : null;
  if (pieces) {   // RYB: a piece's dots on its matching read piece
    const back = new Map(pieces.map((j, i) => [j, i]));
    have = have.map((g) => (g.at === "cell" && g.kind === "dots" ? { ...g, cell: [0, back.get(g.cell[1]) ?? -1] } : g));
  }
  const w = new Map<string, string[]>(), h = new Map<string, string[]>();
  for (const g of want) { const [k, v] = keyed(g); w.set(k, [...(w.get(k) ?? []), v]); }
  for (const g of have) { const [k, v] = keyed(g); h.set(k, [...(h.get(k) ?? []), v]); }
  const missing: string[] = [], extra: string[] = [], wrong: string[] = [];
  let correct = 0;
  for (const [k, vs] of w) {
    const hv = [...(h.get(k) ?? [])];
    for (const v of vs) {
      const i = hv.indexOf(v);
      if (i >= 0) { correct++; hv.splice(i, 1); }
      else if (hv.length) wrong.push(`${k}: ${v} read as ${hv.shift()}`);
      else missing.push(`${k}${v && v !== "{}" ? ` ${v}` : ""}`);
    }
    if (hv.length) extra.push(...hv.map((v) => `${k} ${v}`));
  }
  for (const [k, vs] of h) if (!w.has(k)) extra.push(...vs.map((v) => `${k}${v && v !== "{}" ? ` ${v}` : ""}`));
  const givens = { total: want.length, correct, missing, extra, wrong };

  let areas: Score["areas"] = null;
  if (source.areas) {
    const a = partition(source.areas), b = read?.areas && size.ok ? partition(read.areas) : null;
    // cells whose area differs: compare each pair of neighbours' sameness (labels are arbitrary)
    let cells = 0;
    if (b) a.forEach((row, r) => row.forEach((x, c) => {
      const differs = (rr: number, cc: number) => (a[rr][cc] === x) !== (b[rr][cc] === b[r][c]);
      if ((c + 1 < row.length && differs(r, c + 1)) || (r + 1 < a.length && differs(r + 1, c))) cells++;
    }));
    areas = { ok: !!b && cells === 0, cells: b ? cells : a.flat().length };
  }

  const rw = rulesOf(source.rules), rh = rulesOf(read?.rules);
  const rules = { ok: false, missing: rw.filter((x) => !rh.includes(x)), extra: rh.filter((x) => !rw.includes(x)) };
  rules.ok = !rules.missing.length && !rules.extra.length;

  const solution: Score["solution"] = !solveIt ? "skipped" : !got || !genre.ok || !size.ok || (source.figure && !pieces) ? "different" : await sameSolution(src, got, pieces);
  const exact = genre.ok && size.ok && !missing.length && !extra.length && !wrong.length && (areas?.ok ?? true) && rules.ok;
  return { genre, size, givens, areas, rules, solution, exact };
}
