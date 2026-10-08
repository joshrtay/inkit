// Import Witness-style panels written in The Windmill's format (windmill.thefifthmatt.com: a
// protobuf Storage, base64 with "_" for "/" and "-" for "+", ending "_0"; schema in
// barrycohen/ttws grid.proto) into our panel format, and say how many solutions each has.
//
//   node puzzles/grid/witness-import.ts <codes file, one per line> <out dir>
//
// For the local reference set (references/, never published: the panels are the games' designs).
// Each panel goes to <out dir>/<n>.json as an instance of genre "panel"; <out dir>/report.json
// lists, for each, its size, symbols, solution count (0, 1 or "2+") and anything that couldn't be
// carried over.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { check, makePuzzle } from "../../src/engine/puzzle.ts";
import { emptyBoard } from "../../src/engine/types.ts";
import { solve } from "../../src/engine/solve.ts";
import type { Given, GridSpec, SymbolColor } from "../../src/engine/types.ts";

type RC = [number, number];

// ---- protobuf, just enough of it ----
function reader(buf: Uint8Array) {
  let i = 0;
  const varint = () => { let x = 0, s = 0, b: number; do { b = buf[i++]; x += (b & 0x7f) * 2 ** s; s += 7; } while (b & 0x80); return x; };
  return {
    done: () => i >= buf.length,
    field(): [number, number] { const k = varint(); return [k >>> 3, k & 7]; },
    varint,
    bytes: () => { const n = varint(); const out = buf.subarray(i, i + n); i += n; return out; },
    skip(wire: number) { if (wire === 0) varint(); else if (wire === 2) { const n = varint(); i += n; } else if (wire === 5) i += 4; else if (wire === 1) i += 8; },
  };
}
const zigzag = (n: number) => (n & 1 ? -(n + 1) / 2 : n / 2);

interface Shape { width: number; grid: boolean[]; free: boolean; negative: boolean }
interface Entity { type: number; color: number; orientation?: [number, number]; shape?: Shape; count: number; triangles: number }

function decodeShape(b: Uint8Array): Shape {
  const r = reader(b), s: Shape = { width: 0, grid: [], free: false, negative: false };
  while (!r.done()) {
    const [f, w] = r.field();
    if (f === 1) s.width = r.varint();
    else if (f === 2 && w === 2) { const p = reader(r.bytes()); while (!p.done()) s.grid.push(!!p.varint()); }
    else if (f === 2) s.grid.push(!!r.varint());
    else if (f === 3) s.free = !!r.varint();
    else if (f === 4) s.negative = !!r.varint();
    else r.skip(w);
  }
  return s;
}
function decodeEntity(b: Uint8Array): Entity {
  const r = reader(b), e: Entity = { type: 0, color: 0, count: 0, triangles: 0 };
  while (!r.done()) {
    const [f, w] = r.field();
    if (f === 1) e.type = r.varint();
    else if (f === 2) e.color = r.varint();
    else if (f === 3) {
      const o = reader(r.bytes()); let h = 0, v = 0;
      while (!o.done()) { const [g, w2] = o.field(); if (g === 1) h = zigzag(o.varint()); else if (g === 2) v = zigzag(o.varint()); else o.skip(w2); }
      e.orientation = [h, v];
    }
    else if (f === 4) e.shape = decodeShape(r.bytes());
    else if (f === 5) e.count = r.varint();
    else if (f === 6) e.triangles = r.varint();
    else r.skip(w);
  }
  return e;
}
function decodeStorage(code: string) {
  let c = code.trim().split("/").at(-1)!;
  if (c.endsWith("_0")) c = c.slice(0, -2);
  const buf = Uint8Array.from(Buffer.from(c.replace(/_/g, "/").replace(/-/g, "+"), "base64"));
  const r = reader(buf), out = { width: 0, entities: [] as Entity[], symmetry: 0 };
  while (!r.done()) {
    const [f, w] = r.field();
    if (f === 1) out.width = r.varint();
    else if (f === 2) out.entities.push(decodeEntity(r.bytes()));
    else if (f === 3) out.symmetry = r.varint();
    else r.skip(w);
  }
  return out;
}

// ---- to a panel ----
const T = { NONE: 1, BASIC: 2, START: 3, END: 4, DISJOINT: 5, HEXAGON: 6, SQUARE: 7, STAR: 8, TETRIS: 9, ERROR: 10, TRIANGLE: 11 };
// Windmill's colors in ours (cyan and magenta have no exact match: noted when both meet blue or purple)
const COLORS: Record<number, SymbolColor> = { 1: "black", 2: "white", 3: "blue", 4: "purple", 5: "yellow", 6: "red", 7: "green", 8: "blue", 9: "orange" };
const SYMMETRY: Record<number, string | undefined> = { 2: "left-right", 3: "up-down", 4: "turn" };

export function toPanel(code: string): { spec: GridSpec; notes: string[] } {
  const st = decodeStorage(code), W = st.width, notes: string[] = [];
  // the storage is a (2·cols+1) x (2·rows+1) array, row by row: corners and lines, then lines and
  // cells; a count skips that many places
  const cells: (Entity | null)[] = [];
  for (const e of st.entities) { if (e.count) for (let k = 0; k < e.count; k++) cells.push(null); else cells.push(e); }
  const H = Math.ceil(cells.length / W), cols = (W - 1) / 2, rows = (H - 1) / 2;
  const givens: Given[] = [];
  // each Windmill color gets its own color of ours in this panel: its usual match, or a free one
  // if two would meet (cyan and blue, magenta and purple)
  const used = [...new Set(cells.filter((e): e is Entity => !!e && (e.type === T.SQUARE || e.type === T.STAR)).map((e) => e.color))];
  const mine = new Map<number, SymbolColor>();
  for (const c of [...used].sort((a, b) => Number(a === 3 || a === 4) - Number(b === 3 || b === 4))) {
    const want = COLORS[c] ?? "black", taken = new Set(mine.values());
    mine.set(c, !taken.has(want) ? want : (["purple", "green", "red", "orange", "yellow", "white", "black", "blue"] as SymbolColor[]).find((x) => !taken.has(x))!);
    if (mine.get(c) !== want) notes.push(`${c === 3 ? "cyan" : c === 4 ? "magenta" : `color ${c}`} read as ${mine.get(c)}`);
  }
  const colorOf = (e: Entity, kind: string): SymbolColor => { if (!COLORS[e.color]) notes.push(`${kind} with no color: black`); return mine.get(e.color) ?? "black"; };
  cells.forEach((e, k) => {
    if (!e || e.type === T.NONE || e.type === T.BASIC || e.type === 0) return;
    const x = k % W, y = Math.floor(k / W);
    if (x % 2 === 0 && y % 2 === 0) {
      const corner: RC = [y / 2, x / 2];
      if (e.type === T.START) givens.push({ at: "corner", corner, kind: "start" });
      else if (e.type === T.END) {
        if (corner[0] > 0 && corner[1] > 0 && corner[0] < rows && corner[1] < cols) notes.push(`an end inside the grid at ${corner}: dropped`);
        else givens.push({ at: "corner", corner, kind: "end" });
      } else if (e.type === T.HEXAGON) givens.push({ at: "corner", corner, kind: "hexagon" });
      else notes.push(`type ${e.type} on a corner: dropped`);
    } else if (x % 2 === 1 && y % 2 === 1) {
      const cell: RC = [(y - 1) / 2, (x - 1) / 2];
      if (e.type === T.SQUARE) givens.push({ at: "cell", cell, kind: "square", color: colorOf(e, "square") });
      else if (e.type === T.STAR) givens.push({ at: "cell", cell, kind: "star", color: colorOf(e, "star") });
      else if (e.type === T.TRIANGLE) givens.push({ at: "cell", cell, kind: "triangle", value: e.triangles || 1 });
      else if (e.type === T.ERROR) givens.push({ at: "cell", cell, kind: "eraser" });
      else if (e.type === T.TETRIS && e.shape) {
        const sw = e.shape.width, pts: RC[] = [];
        e.shape.grid.forEach((on, j) => { if (on) pts.push([Math.floor(j / sw), j % sw]); });
        const r0 = Math.min(...pts.map((p) => p[0])), c0 = Math.min(...pts.map((p) => p[1]));
        givens.push({ at: "cell", cell, kind: "shape", value: pts.map(([r, c]) => [r - r0, c - c0] as RC), ...(e.shape.free ? { rotate: true } : {}), ...(e.shape.negative ? { negative: true } : {}) });
      } else notes.push(`type ${e.type} in a cell: dropped`);
    } else {
      // a stretch of line: horizontal on a corner row, vertical on a cell row
      const corners: [RC, RC] = y % 2 === 0 ? [[y / 2, (x - 1) / 2], [y / 2, (x + 1) / 2]] : [[(y - 1) / 2, x / 2], [(y + 1) / 2, x / 2]];
      if (e.type === T.DISJOINT) givens.push({ at: "line", corners, kind: "gap" });
      else if (e.type === T.HEXAGON) givens.push({ at: "line", corners, kind: "hexagon" });
      else if (e.type === T.START) notes.push("a start halfway along a line: dropped");
      else notes.push(`type ${e.type} on a line: dropped`);
    }
  });
  const sym = SYMMETRY[st.symmetry];
  return { spec: { genre: "panel", size: [rows, cols], givens, ...(sym ? { rules: [{ rule: "panel-line", symmetry: sym }] } : {}) }, notes: [...new Set(notes)] };
}

/** Solutions found by trying every line from every start (for panels the solver can't take:
 *  erasers with shapes), up to `limit`. Fine for panels up to about 5 × 5. */
export function countByPaths(spec: GridSpec, limit = 2): number {
  const p = makePuzzle(spec), g = p.grid, board = emptyBoard(g);
  const ends = new Set([...p.cornerGivens].filter(([, gs]) => gs.some((x) => x.kind === "end")).map(([v]) => v));
  const starts = [...p.cornerGivens].filter(([, gs]) => gs.some((x) => x.kind === "start")).map(([v]) => v);
  const seen = new Set<string>(), onPath = new Set<number>();
  let found = 0;
  const walk = (v: number) => {
    if (found >= limit) return;
    if (ends.has(v) && onPath.size > 1 && !check(p, board).length) {
      const key = board.fence.join("");
      if (!seen.has(key)) { seen.add(key); found++; }
    }
    for (const e of g.cornerBorders[v]) {
      if (p.gaps.has(e)) continue;
      const w = g.borders[e].corners[0] === v ? g.borders[e].corners[1] : g.borders[e].corners[0];
      if (onPath.has(w)) continue;
      onPath.add(w); board.fence[e] = 1;
      walk(w);
      onPath.delete(w); board.fence[e] = 0;
    }
  };
  for (const s of starts) { onPath.add(s); walk(s); onPath.delete(s); }
  return found;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [file, outDir] = process.argv.slice(2);
  if (!file || !outDir) { console.error("usage: witness-import.ts <codes file> <out dir>"); process.exit(1); }
  mkdirSync(outDir, { recursive: true });
  const codes = readFileSync(file, "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
  const report: Record<string, unknown>[] = [];
  for (const [k, code] of codes.entries()) {
    const n = k + 1, row: Record<string, unknown> = { n };
    try {
      const { spec, notes } = toPanel(code);
      const kinds: Record<string, number> = {};
      for (const g of spec.givens ?? []) kinds[g.kind] = (kinds[g.kind] ?? 0) + 1;
      Object.assign(row, { size: spec.size.join("x"), symmetry: spec.rules?.[0]?.symmetry ?? null, symbols: kinds, notes });
      writeFileSync(`${outDir}/${n}.json`, JSON.stringify({ type: "grid", name: `Windmill code ${n}`, meta: `${spec.size[0]} × ${spec.size[1]}`, source: { file, line: n, code }, grid: spec }, null, 1) + "\n");
      try {
        const sols = await solve(makePuzzle(spec), 2);
        row.solutions = sols.length > 1 ? "2+" : sols.length;
      } catch (e) {
        // erasers with shapes: try every line instead (no symmetry panels need this so far)
        if (!spec.rules?.length) { const k = countByPaths(spec); row.solutions = k > 1 ? "2+" : k; row.solvedBy = "every line"; }
        else { row.solutions = "error"; row.error = (e as Error).message; }
      }
    } catch (e) { row.error = `decode: ${(e as Error).message}`; }
    report.push(row);
    console.log(`${n}: ${row.size ?? "?"} ${row.symmetry ?? ""} solutions ${row.solutions ?? "-"}${row.error ? ` (${row.error})` : ""}`);
  }
  writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 1) + "\n");
  const tally = (k: unknown) => report.filter((r) => r.solutions === k).length;
  console.log(`${report.length} panels: ${tally(1)} with one solution, ${tally("2+")} with more, ${tally(0)} with none, ${report.filter((r) => r.error).length} errors`);
}
