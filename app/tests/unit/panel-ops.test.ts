// The on-puzzle editor's panel actions (app/editor/ops.ts): the line's starts, ends, gaps and dots,
// the symbols in the cells, symmetry, and where a tap lands.
import { describe, expect, it } from "vitest";
import { makePuzzle } from "~site/engine/puzzle.ts";
import type { GridSpec } from "~site/engine/types.ts";
import * as ops from "~/editor/ops";

const panel = (size: [number, number] = [4, 4], extra: Partial<GridSpec> = {}): GridSpec => ({ genre: "panel", size, givens: [], ...extra });
/** A panel with two mirrored lines (left to right). */
const mirrored = (size: [number, number] = [4, 5]) => panel(size, { rules: [{ rule: "panel-line", symmetry: "left-right" }] });

describe("starts and ends", () => {
  it("toggle a start on a corner", () => {
    const s = ops.toggleStart(panel(), [4, 0]);
    expect(s.givens).toEqual([{ at: "corner", corner: [4, 0], kind: "start" }]);
    expect(ops.toggleStart(s, [4, 0]).givens).toEqual([]);
  });
  it("put ends only on the outside edge", () => {
    expect(ops.toggleEnd(panel(), [2, 2]).givens).toEqual([]);
    const s = ops.toggleEnd(panel(), [0, 4]);
    expect(s.givens).toEqual([{ at: "corner", corner: [0, 4], kind: "end" }]);
    expect(ops.toggleEnd(s, [0, 4]).givens).toEqual([]);
  });
  it("keep a start and an end on the same corner apart", () => {
    const s = ops.toggleEnd(ops.toggleStart(panel(), [0, 0]), [0, 0]);
    expect(s.givens).toHaveLength(2);
    expect(ops.toggleStart(s, [0, 0]).givens).toEqual([{ at: "corner", corner: [0, 0], kind: "end" }]);
  });
  it("come in mirrored pairs in a symmetry panel: a blue start and a yellow one", () => {
    const s = ops.toggleStart(mirrored(), [4, 1]);
    expect(s.givens).toEqual([
      { at: "corner", corner: [4, 1], kind: "start", color: "blue" },
      { at: "corner", corner: [4, 4], kind: "start", color: "yellow" },
    ]);
    // removing either removes both
    expect(ops.toggleStart(s, [4, 4]).givens).toEqual([]);
    const e = ops.toggleEnd(s, [0, 0]);
    expect(e.givens).toContainEqual({ at: "corner", corner: [0, 0], kind: "end" });
    expect(e.givens).toContainEqual({ at: "corner", corner: [0, 5], kind: "end" });
    expect(() => makePuzzle(e)).not.toThrow();
  });
  it("erase a start with its mirror, and a corner's dot", () => {
    let s = ops.toggleStart(mirrored(), [4, 1]);
    s = ops.toggleDot(s, { corner: [2, 2] });
    s = ops.eraseCorner(s, [4, 1]);
    expect(s.givens).toEqual([{ at: "corner", corner: [2, 2], kind: "hexagon" }]);
    expect(ops.eraseCorner(s, [2, 2]).givens).toEqual([]);
  });
});

describe("symmetry", () => {
  it("is the puzzle's own panel-line rule: set, changed and removed", () => {
    expect(ops.symmetryOf(panel())).toBeNull();
    expect(ops.symmetryOf(mirrored())).toBe("left-right");
    const s = ops.setSymmetry(mirrored(), "turn");
    expect(s.rules).toEqual([{ rule: "panel-line", symmetry: "turn" }]);
    expect(ops.symmetryOf(s)).toBe("turn");
    expect(ops.setSymmetry(s, null).rules).toBeUndefined();
    expect(ops.setSymmetry(panel(), "up-down").rules).toEqual([{ rule: "panel-line", symmetry: "up-down" }]);
    expect(ops.setSymmetry(panel(), null)).toEqual(panel());
  });
  it("mirrors corners", () => {
    expect(ops.mirrorCorner([4, 5], [1, 1], "left-right")).toEqual([1, 4]);
    expect(ops.mirrorCorner([4, 5], [1, 1], "up-down")).toEqual([3, 1]);
    expect(ops.mirrorCorner([4, 5], [1, 1], "turn")).toEqual([3, 4]);
  });
});

describe("gaps and dots", () => {
  it("toggle a gap whichever way round the line is given", () => {
    const s = ops.toggleGap(panel(), [[2, 4], [2, 3]]);
    expect(s.givens).toEqual([{ at: "line", corners: [[2, 3], [2, 4]], kind: "gap" }]);
    expect(ops.toggleGap(s, [[2, 3], [2, 4]]).givens).toEqual([]);
    expect(() => makePuzzle(s, { unfinished: true })).not.toThrow();
  });
  it("put a dot on a corner or a line, replacing a gap; the same dot again removes it", () => {
    let s = ops.toggleGap(panel(), [[0, 1], [0, 2]]);
    s = ops.toggleDot(s, { line: [[0, 2], [0, 1]] });
    expect(s.givens).toEqual([{ at: "line", corners: [[0, 1], [0, 2]], kind: "hexagon" }]);
    s = ops.toggleDot(s, { corner: [1, 1] });
    expect(s.givens).toContainEqual({ at: "corner", corner: [1, 1], kind: "hexagon" });
    expect(ops.toggleDot(s, { corner: [1, 1] }).givens).toHaveLength(1);
  });
  it("recolor a dot, then remove it", () => {
    let s = ops.toggleDot(mirrored(), { corner: [1, 1] }, "blue");
    expect(s.givens).toEqual([{ at: "corner", corner: [1, 1], kind: "hexagon", color: "blue" }]);
    s = ops.toggleDot(s, { corner: [1, 1] }, "yellow");
    expect(s.givens).toEqual([{ at: "corner", corner: [1, 1], kind: "hexagon", color: "yellow" }]);
    expect(ops.toggleDot(s, { corner: [1, 1] }, "yellow").givens).toEqual([]);
  });
});

describe("symbols in cells", () => {
  it("place a colored square, replace it with another color, and remove it", () => {
    let s = ops.toggleCellSymbol(panel(), [1, 1], { kind: "square", color: "black" });
    expect(s.givens).toEqual([{ at: "cell", cell: [1, 1], kind: "square", color: "black" }]);
    s = ops.toggleCellSymbol(s, [1, 1], { kind: "square", color: "white" });
    expect(s.givens).toEqual([{ at: "cell", cell: [1, 1], kind: "square", color: "white" }]);
    s = ops.toggleCellSymbol(s, [1, 1], { kind: "star", color: "white" });
    expect(s.givens).toEqual([{ at: "cell", cell: [1, 1], kind: "star", color: "white" }]);
    expect(ops.toggleCellSymbol(s, [1, 1], { kind: "star", color: "white" }).givens).toEqual([]);
  });
  it("cycle triangles 1, 2, 3, none", () => {
    let s = panel();
    for (const n of [1, 2, 3]) {
      s = ops.cycleTriangle(s, [0, 0]);
      expect(s.givens).toEqual([{ at: "cell", cell: [0, 0], kind: "triangle", value: n }]);
    }
    expect(ops.cycleTriangle(s, [0, 0]).givens).toEqual([]);
  });
  it("place shapes (turnable, hollow) and erasers", () => {
    const L = ops.SHAPES.find((x) => x.name === "Three, bent")!.cells;
    let s = ops.toggleCellSymbol(panel(), [2, 2], { kind: "shape", value: L, rotate: true });
    expect(s.givens).toEqual([{ at: "cell", cell: [2, 2], kind: "shape", value: [[0, 0], [1, 0], [1, 1]], rotate: true }]);
    s = ops.toggleCellSymbol(s, [2, 2], { kind: "shape", value: L, negative: true });
    expect(s.givens).toEqual([{ at: "cell", cell: [2, 2], kind: "shape", value: L, negative: true }]);
    expect(ops.toggleCellSymbol(s, [2, 2], { kind: "shape", value: L, negative: true }).givens).toEqual([]);
    s = ops.toggleCellSymbol(panel(), [3, 3], { kind: "eraser" });
    expect(s.givens).toEqual([{ at: "cell", cell: [3, 3], kind: "eraser" }]);
    expect(ops.toggleCellSymbol(s, [3, 3], { kind: "eraser" }).givens).toEqual([]);
  });
  it("turn a shape a quarter turn", () => {
    expect(ops.turnShape([[0, 0], [0, 1]])).toEqual([[0, 0], [1, 0]]);
    expect(ops.turnShape([[0, 0], [1, 0], [1, 1]])).toEqual([[0, 0], [0, 1], [1, 0]]);
    const T = ops.SHAPES.find((x) => x.name === "T of four")!.cells;
    expect([1, 2, 3, 4].reduce((cs) => ops.turnShape(cs), T)).toEqual(T);
  });
});

describe("where a tap lands", () => {
  it("finds the nearest corner within reach", () => {
    expect(ops.cornerNear([4, 4], 1.1, 0.9)).toEqual([1, 1]);
    expect(ops.cornerNear([4, 4], -0.3, 4.2)).toEqual([4, 0]);
    expect(ops.cornerNear([4, 4], 1.5, 1.5)).toBeNull();
    expect(ops.cornerNear([4, 4], 5.2, 1)).toBeNull();
  });
  it("finds the nearest stretch of line, the outside edge included", () => {
    expect(ops.lineNear([4, 4], 1.5, 0.1)).toEqual([[0, 1], [0, 2]]);
    expect(ops.lineNear([4, 4], 4.05, 2.4)).toEqual([[2, 4], [3, 4]]);
    expect(ops.lineNear([4, 4], 1.5, 1.5)).toBeNull();
  });
  it("puts a dot on a corner when close to one, else on the line", () => {
    expect(ops.dotSpotNear([4, 4], 2.1, 1.05)).toEqual({ corner: [1, 2] });
    expect(ops.dotSpotNear([4, 4], 2.5, 1.05)).toEqual({ line: [[1, 2], [1, 3]] });
  });
});

describe("resizing a panel", () => {
  it("keeps lines' clues, and ends on the bottom and right edges", () => {
    let s = ops.toggleEnd(panel(), [4, 2]);
    s = ops.toggleEnd(s, [1, 4]);
    s = ops.toggleGap(s, [[1, 1], [1, 2]]);
    s = ops.resize(s, 5, 6);
    expect(s.givens).toEqual([
      { at: "corner", corner: [5, 2], kind: "end" },
      { at: "corner", corner: [1, 6], kind: "end" },
      { at: "line", corners: [[1, 1], [1, 2]], kind: "gap" },
    ]);
    expect(() => makePuzzle(s, { unfinished: true })).not.toThrow();
  });
});
