// RYB logic shared by the build (validation) and anything else that needs it.
// Rule: k dots of color C in a piece mean at least k of its neighbors are C.
// Neighbors share part of an edge; touching at a corner doesn't count.
import type { Color, RybConfig } from "./types";

const EPS = 1e-6;
type Pt = number[];

/** Do two segments lie on the same line and overlap for more than a point? */
function sharesEdge(a1: Pt, a2: Pt, b1: Pt, b2: Pt) {
  const dx = a2[0] - a1[0], dy = a2[1] - a1[1];
  const len = Math.hypot(dx, dy);
  if (len < EPS) return false;
  const cross = (p: Pt) => (dx * (p[1] - a1[1]) - dy * (p[0] - a1[0])) / len;
  if (Math.abs(cross(b1)) > 1e-4 || Math.abs(cross(b2)) > 1e-4) return false;
  const along = (p: Pt) => (dx * (p[0] - a1[0]) + dy * (p[1] - a1[1])) / len;
  const lo = Math.max(0, Math.min(along(b1), along(b2)));
  const hi = Math.min(len, Math.max(along(b1), along(b2)));
  return hi - lo > 1e-3;
}

/** Neighbor lists for every piece. */
export function adjacency(pieces: { points: Pt[] }[]): number[][] {
  const edges = pieces.map((p) => p.points.map((pt, i) => [pt, p.points[(i + 1) % p.points.length]]));
  return pieces.map((_, i) => pieces.flatMap((_, j) =>
    i !== j && edges[i].some(([a, b]) => edges[j].some(([c, d]) => sharesEdge(a, b, c, d))) ? [j] : []));
}

/** Count of dots per color for a clue string such as "113". */
export function dotsOf(clue = ""): Color[] {
  return [...clue].filter((ch) => "123".includes(ch)).map((ch) => Number(ch) as Color);
}

/** Up to `limit` full colorings that satisfy every clue (and the totals, if given). */
export function solve(config: RybConfig, limit = 2): Color[][] {
  const n = config.pieces.length;
  const nb = adjacency(config.pieces);
  const need = config.pieces.map((p) => {
    const d = dotsOf(p.clue);
    return [0, d.filter((c) => c === 1).length, d.filter((c) => c === 2).length, d.filter((c) => c === 3).length];
  });
  const totals = config.totals ? [0, config.totals["1"] ?? -1, config.totals["2"] ?? -1, config.totals["3"] ?? -1] : null;
  const color = new Array<number>(n).fill(0);
  const used = [0, 0, 0, 0];
  const order = [...Array(n).keys()].sort((a, b) => nb[b].length - nb[a].length);
  const sols: Color[][] = [];

  // Can piece i's clue still be met? Each dot needs its own distinct neighbor.
  const feasible = (i: number) => {
    let open = 0;
    const have = [0, 0, 0, 0];
    for (const j of nb[i]) color[j] ? have[color[j]]++ : open++;
    let missing = 0;
    for (let c = 1; c <= 3; c++) missing += Math.max(0, need[i][c] - have[c]);
    return missing <= open;
  };

  function search(k: number) {
    if (sols.length >= limit) return;
    if (k === n) {
      if (totals && [1, 2, 3].some((c) => totals[c] >= 0 && used[c] !== totals[c])) return;
      sols.push(color.slice() as Color[]);
      return;
    }
    const i = order[k];
    for (let c = 1; c <= 3; c++) {
      if (totals && totals[c] >= 0 && used[c] >= totals[c]) continue;
      color[i] = c; used[c]++;
      if (feasible(i) && nb[i].every(feasible)) search(k + 1);
      color[i] = 0; used[c]--;
    }
  }
  search(0);
  return sols;
}
