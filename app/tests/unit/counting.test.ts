// Counting across units (puzzles/difficulty/counting.ts): which rules make count systems, and
// which sets of units the pigeonhole step finds, in Star Battle and in Sudoku.
import { describe, expect, it } from "vitest";
import { countSets, countSystems } from "../../../puzzles/difficulty/counting.ts";
import { makePuzzle } from "../../../src/engine/puzzle.ts";

describe("count systems", () => {
  it("reads Star Battle's rows, columns and areas, and Sudoku's per digit", () => {
    const sb = makePuzzle({ genre: "star-battle", size: [4, 4], areas: ["aabb", "aabb", "ccdd", "ccdd"] });
    expect(countSystems(sb, []).map((s) => s.families.map((f) => f.name))).toEqual([["rows", "columns", "areas"]]);
    const su = makePuzzle({ genre: "sudoku", size: [4, 4] });
    const boxes = [[0, 1, 4, 5], [2, 3, 6, 7], [8, 9, 12, 13], [10, 11, 14, 15]];
    const systems = countSystems(su, boxes);
    expect(systems.map((s) => s.label)).toEqual(["1s", "2s", "3s", "4s"]);
    expect(systems[0].families.map((f) => f.name)).toEqual(["rows", "columns", "boxes"]);
  });
});

describe("count sets", () => {
  // a 4 × 4 Star Battle (one star each) whose area a is the first row's two left cells
  const sb = makePuzzle({ genre: "star-battle", size: [4, 4], areas: ["aabb", "cccb", "cddd", "cddd"] });
  const systems = countSystems(sb, []);
  const open = (name: string) => (/^shaded\(\d+\)$/.test(name) ? -1 : undefined);

  it("finds an area inside a row: the rest of the row is used up", () => {
    const sets = countSets(systems, open, 1);
    expect(sets.some((s) => s.label === "shaded: area a inside row 1")).toBe(true);
  });

  it("finds Sudoku's X-Wing: two rows whose 1s fit in two columns", () => {
    const su = makePuzzle({ genre: "sudoku", size: [4, 4] });
    // 1 can only go in columns 1 and 3 of rows 1 and 2
    const allowed = new Set([0, 2, 4, 6, 8, 9, 10, 11, 12, 13, 14, 15]);
    const state = (name: string) => { const m = /^digit\((\d+),1\)$/.exec(name); return m ? (allowed.has(+m[1]) ? -1 : 0) : -1; };
    const sets = countSets(countSystems(su, []), state, 2);
    expect(sets.some((s) => s.label === "1s: row 1, row 2 inside column 1, column 3")).toBe(true);
  });
});
