// What rules look at, worked out from a board: regions and their shapes.
import type { Grid } from "./geometry.ts";
import type { Board, Puzzle } from "./types.ts";

export interface Regions {
  of: number[];          // cell -> region index (-1 for cells that aren't in any region, e.g. shaded)
  cells: number[][];     // region -> its cells, sorted
}

/** Connected groups of cells. For a regions puzzle: same color and not cut apart (rocks are holes,
 *  in no region; a given wall always cuts). For a
 *  shading puzzle: the islands of unshaded cells. For a line puzzle (a panel): the parts the line
 *  cuts the grid into. */
export function regionsOf(p: Puzzle, b: Board): Regions {
  const g = p.grid;
  const lines = linesCut(p);
  const open = (i: number) => !p.blocked.has(i) && (p.marks.includes("regions") || lines ? true : b.shade[i] !== 1);
  const joined = (l: number) => {
    const [a, c] = g.links[l].cells;
    if (!open(a) || !open(c)) return false;
    // a given wall is a region border already drawn
    if (p.marks.includes("regions")) return b.cut[g.links[l].border] !== 1 && !p.walls.has(l) && b.color[a] === b.color[c];
    if (lines) return b.fence[g.links[l].border] !== 1;
    return true;
  };
  const of = new Array<number>(g.cellCount).fill(-1);
  const cells: number[][] = [];
  for (let s = 0; s < g.cellCount; s++) {
    if (of[s] >= 0 || !open(s)) continue;
    const id = cells.length, members = [s];
    of[s] = id;
    for (let k = 0; k < members.length; k++)
      for (const l of g.cellLinks[members[k]]) {
        if (!joined(l)) continue;
        const [a, c] = g.links[l].cells, n = a === members[k] ? c : a;
        if (of[n] < 0) { of[n] = id; members.push(n); }
      }
    cells.push(members.sort((x, y) => x - y));
  }
  return { of, cells };
}

/** Do the drawn lines cut the grid into regions? (Line puzzles: only fence marks.) */
export const linesCut = (p: Puzzle) => p.marks.length === 1 && p.marks[0] === "fence";

/** A shape's canonical form: the same for any turn or flip of it. */
export function shapeKey(g: Grid, cells: number[]): string {
  const pts = cells.map((i) => g.rc(i));
  const forms = [
    ([r, c]: number[]) => [r, c], ([r, c]: number[]) => [r, -c], ([r, c]: number[]) => [-r, c], ([r, c]: number[]) => [-r, -c],
    ([r, c]: number[]) => [c, r], ([r, c]: number[]) => [c, -r], ([r, c]: number[]) => [-c, r], ([r, c]: number[]) => [-c, -r],
  ];
  let best = "";
  for (const f of forms) {
    const q = pts.map(f);
    const r0 = Math.min(...q.map((x) => x[0])), c0 = Math.min(...q.map((x) => x[1]));
    const key = q.map(([r, c]) => [r - r0, c - c0]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((x) => x.join(".")).join(" ");
    if (!best || key < best) best = key;
  }
  return best;
}

/** Shaded cells as groups, for connectivity rules. */
export function shadedGroups(g: Grid, b: Board): number[][] {
  const seen = new Uint8Array(g.cellCount), groups: number[][] = [];
  for (let s = 0; s < g.cellCount; s++) {
    if (seen[s] || b.shade[s] !== 1) continue;
    const members = [s]; seen[s] = 1;
    for (let k = 0; k < members.length; k++)
      for (const l of g.cellLinks[members[k]]) {
        const [a, c] = g.links[l].cells, n = a === members[k] ? c : a;
        if (!seen[n] && b.shade[n] === 1) { seen[n] = 1; members.push(n); }
      }
    groups.push(members);
  }
  return groups;
}

/** The drawn lines as a graph: node -> its line edges. Fence lines join corners; loop lines join cells. */
export function lineGraph(p: Puzzle, b: Board, kind: "fence" | "loop") {
  const g = p.grid;
  const nodes = kind === "fence" ? g.cornerCount : g.cellCount;
  const edges: [number, number, number][] = [];   // [a, b, edge id]
  if (kind === "fence") g.borders.forEach((e) => { if (b.fence[e.id] === 1) edges.push([e.corners[0], e.corners[1], e.id]); });
  else g.links.forEach((e) => { if (b.loop[e.id] === 1) edges.push([e.cells[0], e.cells[1], e.id]); });
  const deg = new Array<number>(nodes).fill(0);
  for (const [a, c] of edges) { deg[a]++; deg[c]++; }
  return { nodes, edges, deg };
}
