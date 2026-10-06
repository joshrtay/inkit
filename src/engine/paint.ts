// A quick solver for paint puzzles (Three Coats), so the player knows the answer and can turn a
// wrong color away (hearts). Clingo proves the one solution when a puzzle is built or published;
// this only finds it again in the browser, fast, for the rules a paint puzzle uses.
import { colorName, dotClues } from "./rules.ts";
import { paletteSize } from "./encode.ts";
import type { Puzzle } from "./types.ts";

const KNOWN = new Set(["painted", "neighbor-dots", "color-count"]);

/** Up to `limit` colorings (palette colors 1..n per cell), or null if the puzzle uses rules
 *  this solver doesn't know. */
export function solvePaint(p: Puzzle, limit = 2): number[][] | null {
  if (!p.marks.includes("paint") || p.rules.some((s) => !KNOWN.has(s.rule))) return null;
  const g = p.grid, n = g.cellCount, k = paletteSize(p);
  const nb = Array.from({ length: n }, (_, i) => g.cellLinks[i].map((l) => { const [a, c] = g.links[l].cells; return a === i ? c : a; }));
  const need = Array.from({ length: n }, () => new Array<number>(k + 1).fill(0));
  for (const [i, m] of dotClues(p)) for (const [c, cnt] of m) if (c <= k) need[i][c] = cnt;
  const counts = p.rules.find((s) => s.rule === "color-count");
  const total = Array.from({ length: k + 1 }, (_, c) => {
    const v = counts && (counts[colorName(p, c)] ?? counts[`c${c}`]);
    return typeof v === "number" ? v : -1;
  });
  const color = new Array<number>(n).fill(0), used = new Array<number>(k + 1).fill(0), sols: number[][] = [];
  const order = [...Array(n).keys()].sort((a, b) => nb[b].length - nb[a].length);
  // can cell i's dots still be met? each dot needs its own neighbour
  const feasible = (i: number) => {
    let open = 0, missing = 0;
    const have = new Array<number>(k + 1).fill(0);
    for (const j of nb[i]) if (color[j]) have[color[j]]++; else open++;
    for (let c = 1; c <= k; c++) missing += Math.max(0, need[i][c] - have[c]);
    return missing <= open;
  };
  const search = (d: number) => {
    if (sols.length >= limit) return;
    if (d === n) { if (total.every((t, c) => c === 0 || t < 0 || used[c] === t)) sols.push([...color]); return; }
    const i = order[d];
    for (let c = 1; c <= k; c++) {
      if (total[c] >= 0 && used[c] >= total[c]) continue;
      color[i] = c; used[c]++;
      if (feasible(i) && nb[i].every(feasible)) search(d + 1);
      color[i] = 0; used[c]--;
    }
  };
  search(0);
  return sols;
}
