// Hexagons and lattices: the editor's operations (app/editor/ops.ts), the reader's conversion
// (app/lib/read-sketch.server.ts) and the sketchpad's Hexagons and Dots grids (app/sketchpad/model.ts).
import { describe, expect, it } from "vitest";
import { makePuzzle } from "~site/engine/puzzle.ts";
import { hexGrid, latticeGrid } from "~site/engine/geometry.ts";
import * as ops from "~/editor/ops";
import { givenOf, ruleSettings, toSketch, type Reading } from "~/lib/read-sketch.server";
import { parseSketch } from "~/games/sketch";
import * as m from "~/sketchpad/model";
import { gridSvg } from "~/sketchpad/draw";
import type { GridSpec } from "~site/engine/types.ts";

describe("the engine's hex and lattice grids", () => {
  it("a hexagon touches six others, two in its row and two in each row beside it", () => {
    const g = hexGrid(3, 3), mid = g.cell(1, 1);
    const near = g.cellLinks[mid].map((l) => g.links[l].cells.find((c) => c !== mid)!).map(g.rc).sort();
    expect(near).toEqual([[0, 1], [0, 2], [1, 0], [1, 2], [2, 1], [2, 2]]);
    // every hexagon has six sides; shared sides are one border
    expect(g.cellBorders.every((bs) => bs.length === 6)).toBe(true);
    expect(g.borders.length).toBe(9 * 6 - g.links.length);
  });
  it("a lattice joins every two dots, except through another dot", () => {
    const g = latticeGrid(3, 3, [0, 1, 2, 8]);
    const pairs = g.links.map((l) => l.cells.join("-")).sort();
    expect(pairs).toEqual(["0-1", "0-8", "1-2", "1-8", "2-8"]);   // not 0-2: it runs through 1
  });
});

describe("editing number paths and lattices", () => {
  const hid: GridSpec = { genre: "hidoku", size: [4, 4] };
  it("Hidoku's sides only is its own number-path rule without diagonals", () => {
    const s = ops.setSidesOnly(hid, true);
    expect(s.rules).toEqual([{ rule: "number-path" }]);
    expect(ops.sidesOnly(s)).toBe(true);
    expect(ops.setSidesOnly(s, false)).toEqual(hid);
    expect(makePuzzle(s).rules).toEqual([{ rule: "number-path" }]);
  });
  const dp: GridSpec = { genre: "distance-path", size: [4, 4] };
  it("dots go on and off a point", () => {
    const s = ops.togglePeg(dp, [1, 2]);
    expect(s.givens).toEqual([{ at: "cell", cell: [1, 2], kind: "peg" }]);
    expect(ops.hasPeg(s, [1, 2])).toBe(true);
    expect(ops.togglePeg(s, [1, 2]).givens).toEqual([]);
  });
  it("lengths are read as written and kept as squares", () => {
    expect(ops.parseLengths("1 √2 2 √5")).toEqual([1, 2, 4, 5]);
    expect(ops.parseLengths("r8, sqrt 10; 3")).toEqual([8, 10, 9]);
    expect(ops.parseLengths("1 two")).toBeNull();
    expect(ops.lengthsText([5, 1, 4, 2])).toBe("1 √2 2 √5");
    const s = ops.setLengths(dp, [1, 5]);
    expect(ops.lengthsOf(s)).toEqual([1, 5]);
    expect(ops.lengthsOf(ops.setLengths(s, null))).toBeNull();
  });
  it("moves: any way, a queen's or a knight's", () => {
    const s = ops.setMoves(dp, "queen");
    expect(s.rules).toEqual([{ rule: "distance-path", moves: "queen" }]);
    expect(ops.movesOf(s)).toBe("queen");
    expect(ops.setMoves(s, null)).toEqual(dp);
  });
});

describe("reading hexagons and lattices", () => {
  const reading = (over: Partial<Reading>): Reading => ({
    readable: true, problem: "", genre: "distance-path", candidates: ["distance-path"], title: "",
    bounds: { left: 0, top: 0, right: 1, bottom: 1 }, rows: 3, cols: 3, rules: [], givens: [], runs: [],
    pictureRows: [], palette: [], areas: [], figure: [], sure: true, notes: [], ...over,
  });
  it("dots, lengths and moves", () => {
    expect(givenOf({ kind: "peg", row: 1, col: 2, value: "" })).toEqual({ at: "cell", cell: [1, 2], kind: "peg" });
    expect(givenOf({ kind: "lengths", row: -1, col: -1, value: "1, √5, 2" })).toEqual({ at: "aside", kind: "lengths", value: [1, 5, 4] });
    expect(ruleSettings("moves queen")).toEqual({ moves: "queen" });
    const sketch = toSketch(reading({ rules: [{ rule: "distance-path", settings: "moves knight" }], givens: [
      { kind: "peg", row: 0, col: 0, value: "" }, { kind: "peg", row: 1, col: 2, value: "" }, { kind: "lengths", row: -1, col: -1, value: "√5" }] }));
    expect(parseSketch(sketch).ok).toBe(true);
  });
  it("a sides-only Hidoku keeps its rule", () => {
    const sketch = toSketch(reading({ genre: "hidoku", candidates: ["hidoku"], rules: [{ rule: "number-path", settings: "" }], givens: [{ kind: "number", row: 0, col: 0, value: "1" }] }));
    expect(sketch).toContain("number-path");
    expect(parseSketch(sketch).ok).toBe(true);
  });
});

describe("the sketchpad's Hexagons and Dots", () => {
  const grid: m.Grid = { x: 40, y: 40, rows: 3, cols: 4, S: 48 };
  it("a honeycomb: cells at the hexagons' centres, snapped to the nearest", () => {
    const hex = m.setLook(grid, "hex");
    expect(m.lookOf(hex)).toBe("hex");
    const c = m.pointOf(hex, { at: "cell", r: 1, c: 0 });
    expect(c.x).toBeCloseTo(40 + 48);      // row 1 sits half a hexagon right
    expect(m.snap(hex, { x: c.x + 5, y: c.y - 4 }, ["cell"])).toEqual({ at: "cell", r: 1, c: 0 });
    expect(m.cellAt(hex, { x: c.x, y: c.y })).toEqual({ at: "cell", r: 1, c: 0 });
    expect(m.edgeAt(hex, c, 10)).toBeNull();
    expect(gridSvg(hex)).toContain("frame");
    expect(m.objects(m.setGrid(m.EMPTY, hex)).grid).toMatchObject({ shape: "hex" });
  });
  it("a lattice: faint points at the squares' centres, no lines", () => {
    const dots = m.setLook(grid, "dots");
    expect(gridSvg(dots)).not.toContain("gridline");
    expect(gridSvg(dots).match(/lattice-point/g)?.length).toBe(12);
    expect(m.lookOf(m.setLook(dots, "tracks"))).toBe("tracks");
  });
});
