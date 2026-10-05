// Lazy River solver, used by the build to prove each level has exactly one loop.
// Same algorithm as puzzles/lib/lazy_river.py: degree-2 propagation, no early
// mini-loops, every white cell must stay reachable, then branch.
import type { LazyRiverConfig } from "./types";
import { DOWN, LEFT, RIGHT, UP } from "./types";

export interface Board {
  H: number; W: number;
  cells: [number, number][];
  edges: [number, number][];        // pairs of cell indexes
  cellEdges: number[][];
}

export function board(cfg: LazyRiverConfig): Board {
  const H = cfg.grid.length, W = cfg.grid[0].length;
  const wall = new Set(cfg.walls.map(([a, b]) => [a.join(","), b.join(",")].sort().join("|")));
  const cells: [number, number][] = [];
  const id = new Map<string, number>();
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++)
    if (cfg.grid[r][c] !== "#") { id.set(`${r},${c}`, cells.length); cells.push([r, c]); }
  const edges: [number, number][] = [];
  for (const [r, c] of cells) for (const [r2, c2] of [[r, c + 1], [r + 1, c]]) {
    const j = id.get(`${r2},${c2}`);
    if (j === undefined || wall.has([`${r},${c}`, `${r2},${c2}`].sort().join("|"))) continue;
    edges.push([id.get(`${r},${c}`)!, j]);
  }
  const cellEdges = cells.map(() => [] as number[]);
  edges.forEach(([a, b], e) => { cellEdges[a].push(e); cellEdges[b].push(e); });
  return { H, W, cells, edges, cellEdges };
}

/** Up to `limit` loops through every white cell, each as a list of edge indexes. */
export function solve(b: Board, limit = 2): number[][] {
  const n = b.cells.length, sols: number[][] = [];
  const find = (x: number, p: number[]) => { while (p[x] !== x) x = p[x] = p[p[x]]; return x; };

  function propagate(val: number[]): boolean {
    for (let changed = true; changed;) {
      changed = false;
      for (let i = 0; i < n; i++) {
        const es = b.cellEdges[i];
        const on = es.filter((e) => val[e] === 1).length, unk = es.filter((e) => val[e] === -1);
        const need = 2 - on;
        if (need < 0 || need > unk.length) return false;
        if (unk.length && need === 0) { unk.forEach((e) => (val[e] = 0)); changed = true; }
        else if (unk.length && need === unk.length) { unk.forEach((e) => (val[e] = 1)); changed = true; }
      }
      const parent = Array.from({ length: n }, (_, i) => i), size = Array(n).fill(1);
      const totalOn = val.filter((v) => v === 1).length;
      for (let e = 0; e < val.length; e++) {
        if (val[e] !== 1) continue;
        const x = find(b.edges[e][0], parent), y = find(b.edges[e][1], parent);
        if (x === y) { if (totalOn !== n) return false; continue; }
        parent[x] = y; size[y] += size[x];
      }
      for (let e = 0; e < val.length; e++) {
        if (val[e] !== -1) continue;
        const x = find(b.edges[e][0], parent), y = find(b.edges[e][1], parent);
        if (x === y && size[x] < n) { val[e] = 0; changed = true; }
      }
    }
    const parent = Array.from({ length: n }, (_, i) => i);
    val.forEach((v, e) => { if (v !== 0) parent[find(b.edges[e][0], parent)] = find(b.edges[e][1], parent); });
    const root = find(0, parent);
    for (let i = 0; i < n; i++) if (find(i, parent) !== root) return false;
    return true;
  }

  function search(val: number[]) {
    if (sols.length >= limit || !propagate(val)) return;
    // Note: val.includes(-1) / indexOf(-1) misreport here on Node 22 (an engine quirk
    // with fill(-1) arrays), so test with a callback instead.
    if (!val.some((v) => v === -1)) {
      const on = val.flatMap((v, e) => (v === 1 ? [e] : []));
      if (on.length === n) sols.push(on);
      return;
    }
    let best = -1, bestCount = Infinity;
    for (let i = 0; i < n; i++) {
      const k = b.cellEdges[i].filter((e) => val[e] === -1).length;
      if (k > 0 && k < bestCount) { best = i; bestCount = k; }
    }
    const e = b.cellEdges[best].find((f) => val[f] === -1)!;
    for (const v of [1, 0]) { const nv = val.slice(); nv[e] = v; search(nv); }
  }

  if (n >= 4) search(Array(b.edges.length).fill(-1));
  return sols;
}

/** Edge bits per cell for a set of edges (up 1, right 2, down 4, left 8). */
export function toBits(b: Board, edgeIds: number[]): number[][] {
  const out = Array.from({ length: b.H }, () => Array<number>(b.W).fill(0));
  for (const e of edgeIds) {
    const [r1, c1] = b.cells[b.edges[e][0]], [r2, c2] = b.cells[b.edges[e][1]];
    if (r1 === r2) { out[r1][c1] |= RIGHT; out[r2][c2] |= LEFT; }
    else { out[r1][c1] |= DOWN; out[r2][c2] |= UP; }
  }
  return out;
}

/** Wall bits per cell (both sides set). */
export function wallBits(cfg: LazyRiverConfig): number[][] {
  const H = cfg.grid.length, W = cfg.grid[0].length;
  const out = Array.from({ length: H }, () => Array<number>(W).fill(0));
  for (const [[r1, c1], [r2, c2]] of cfg.walls) {
    const [a, b] = r1 * W + c1 < r2 * W + c2 ? [[r1, c1], [r2, c2]] : [[r2, c2], [r1, c1]];
    if (a[0] === b[0]) { out[a[0]][a[1]] |= RIGHT; out[b[0]][b[1]] |= LEFT; }
    else { out[a[0]][a[1]] |= DOWN; out[b[0]][b[1]] |= UP; }
  }
  return out;
}
