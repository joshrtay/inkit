// Beast Academy's Puzzle Lab puzzles (kept locally in references/beast-academy, never published)
// as our puzzles: their sets in order with tiers (1 moon, 2 comet, 3 Saturn, 4 galaxy), and a
// converter for Akari, Fillomino and Spiral Galaxies. Used by ba-run.ts and the scoreboard.
import { existsSync, readFileSync } from "node:fs";

export const root = new URL("../../references/beast-academy/", import.meta.url).pathname;
export type Raw = { t: number; s: string; p: Record<string, any>[] };
/** The saved sets, or none on a machine without them. */
export const loadSets = (): Raw[] => (existsSync(`${root}lab-sample.json`) ? JSON.parse(readFileSync(`${root}lab-sample.json`, "utf8")) : []);

// Beast Academy's order of sets per type, and their tiers (from the Puzzle Lab report)
export const ORDER: Record<number, [string, number][]> = {
  14: [["Agoraphobia", 1], ["Countdown", 1], ["Cipher 1", 2], ["Cipher 2", 3], ["Single Layout", 3], ["Cipher 3", 4], ["Cipher Monster", 4]],
  9: [["Evens", 1], ["Gerrymandering", 1], ["Nooks and Crannies", 2], ["Quintets", 3], ["Stairs", 3]],
  18: [["Straddling", 1], ["Checkerboard", 1], ["Cornerstones", 2], ["Centered", 3]],
};
export const GENRE: Record<number, string> = { 14: "akari", 9: "fillomino", 18: "spiral-galaxies" };

type Givens = { at: string; [k: string]: unknown }[];
export function convert(t: number, c: Record<string, any>) {
  if (t === 14) {
    // walls [x, y, n?] on a [width, height] grid; a cipher letter becomes the number the answer gives it
    const [w, h] = c.gridSize as [number, number];
    const bulbs = new Set((c.lightbulbSolution as number[][]).map(([x, y]) => `${x},${y}`));
    const givens: Givens = [];
    for (const [x, y, n] of c.walls as [number, number, number | string | undefined][]) {
      givens.push({ at: "cell", cell: [y, x], kind: "block" });
      if (n === undefined) continue;
      const value = typeof n === "number" ? n : [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => bulbs.has(`${x + dx},${y + dy}`)).length;
      givens.push({ at: "cell", cell: [y, x], kind: "number", value });
    }
    return { genre: "akari", size: [h, w], givens };
  }
  if (t === 9) {
    // grid rows: -1 a hole, 0 empty, n a clue; values: one region of each of these sizes (every
    // answer has exactly that), which our rules say as those sizes only, and that many regions
    const g = c.grid as number[][];
    const givens: Givens = [];
    g.forEach((row, r) => row.forEach((v, col) => {
      if (v === -1) givens.push({ at: "cell", cell: [r, col], kind: "block" });
      else if (v > 0) givens.push({ at: "cell", cell: [r, col], kind: "number", value: v });
    }));
    return { genre: "fillomino", size: [g.length, g[0].length], givens, rules: [{ rule: "size-clue" }, { rule: "neighbors-differ-size" }, { rule: "allowed-sizes", sizes: c.values }, { rule: "region-count", is: c.values.length }] };
  }
  // galaxies [x, y] in cells (a half is on a border); our points count half-cells from the corner
  const [w, h] = c.gridSize as [number, number];
  return { genre: "spiral-galaxies", size: [h, w], givens: (c.galaxies as number[][]).map(([x, y]) => ({ at: "point", point: [2 * y + 1, 2 * x + 1], kind: "galaxy" })) };
}
