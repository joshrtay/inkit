// The sketchpad's drawing (app/sketchpad/model.ts): snapping to the grid, what's under a point,
// the changes, undo, and the drawing as data. Its SVG (draw.ts) is checked for the boards' classes.
import { describe, expect, it } from "vitest";
import * as m from "~/sketchpad/model";
import { gridSvg, itemSvg } from "~/sketchpad/draw";

const grid: m.Grid = { x: 100, y: 100, rows: 4, cols: 5, S: 40 };
const withGrid = m.setGrid(m.EMPTY, grid);
/** The page point of a grid position (r, c in squares from its top-left). */
const P = (r: number, c: number): m.XY => ({ x: grid.x + c * grid.S, y: grid.y + r * grid.S });

describe("snapping", () => {
  it("a square stamp goes to the square it's in, or the ring just outside the grid", () => {
    expect(m.snap(grid, P(1.2, 2.9), ["cell"])).toEqual({ at: "cell", r: 1, c: 2 });
    expect(m.snap(grid, P(-0.5, 0.5), ["cell"])).toEqual({ at: "cell", r: -1, c: 0 });
    expect(m.snap(grid, P(-1.5, 0.5), ["cell"])).toBeNull();
  });
  it("a point stamp goes to the nearest corner or middle of a line", () => {
    expect(m.snap(grid, P(1.1, 2.9), ["corner", "edge"])).toEqual({ at: "corner", r: 1, c: 3 });
    expect(m.snap(grid, P(1.05, 2.5), ["corner", "edge"])).toEqual({ at: "edge", r: 1, c: 2, side: "top" });
    expect(m.snap(grid, P(2.5, 5.1), ["corner", "edge"])).toEqual({ at: "edge", r: 2, c: 5, side: "left" });
    // corners are only on the grid
    expect(m.snap(grid, P(-0.9, 2), ["corner"])).toBeNull();
  });
  it("a galaxy circle can go on a centre, a corner or a line", () => {
    expect(m.snap(grid, P(1.5, 1.5), m.STAMP_SNAP.galaxy)).toEqual({ at: "cell", r: 1, c: 1 });
    expect(m.snap(grid, P(2.02, 3.97), m.STAMP_SNAP.galaxy)).toEqual({ at: "corner", r: 2, c: 4 });
  });
  it("snapping off, or off the grid, a stamp stays where it's put", () => {
    expect(m.stampAnchor(grid, P(1.5, 1.5), "stone", false)).toEqual({ at: "grid", r: 1.5, c: 1.5 });
    expect(m.stampAnchor(grid, { x: 10, y: 20 }, "stone", true)).toEqual({ at: "page", x: 10, y: 20 });
    expect(m.stampAnchor(null, { x: 10, y: 20 }, "stone", true)).toEqual({ at: "page", x: 10, y: 20 });
  });
  it("anchors are where they say on the page", () => {
    expect(m.pointOf(grid, { at: "cell", r: 0, c: 0 })).toEqual({ x: 120, y: 120 });
    expect(m.pointOf(grid, { at: "corner", r: 4, c: 5 })).toEqual({ x: 300, y: 260 });
    expect(m.pointOf(grid, { at: "edge", r: 1, c: 0, side: "left" })).toEqual({ x: 100, y: 160 });
  });
});

describe("lines", () => {
  it("keep level or upright near the axes", () => {
    expect(m.lockAxis({ x: 0, y: 0 }, { x: 100, y: 6 })).toEqual({ x: 100, y: 0 });
    expect(m.lockAxis({ x: 0, y: 0 }, { x: -5, y: -100 })).toEqual({ x: 0, y: -100 });
    expect(m.lockAxis({ x: 0, y: 0 }, { x: 50, y: 50 })).toEqual({ x: 50, y: 50 });
  });
  it("end on grid corners when snapping", () => {
    const line = m.straightLine(grid, { x: P(0, 0).x + 3, y: P(0, 0).y + 4 }, { x: P(0, 3).x - 5, y: P(0, 3).y + 3 }, true);
    expect(line).toEqual({ from: { at: "corner", r: 0, c: 0 }, to: { at: "corner", r: 0, c: 3 } });
    const free = m.straightLine(grid, { x: 10, y: 10 }, { x: 50, y: 13 }, true);
    expect(free).toEqual({ from: { at: "page", x: 10, y: 10 }, to: { at: "page", x: 50, y: 10 } });
  });
  it("freehand strokes lose their jitter, keep their ends, and snap the ends to corners", () => {
    const pts = [P(0.05, 0.05), { x: 102.5, y: 102.3 }, P(0.5, 0.6), P(0.97, 1.02)];
    const kept = m.penStroke(grid, pts, true);
    expect(kept[0]).toEqual({ at: "corner", r: 0, c: 0 });
    expect(kept.at(-1)).toEqual({ at: "corner", r: 1, c: 1 });
    expect(kept).toHaveLength(3);
    expect(m.smoothPath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }])).toBe("M0 0Q10 0 10 5L10 10");
  });
});

describe("the grid", () => {
  it("comes from a drag, with square squares about a board's size", () => {
    const g = m.gridFromDrag({ x: 300, y: 300 }, { x: 60, y: 60 })!;
    expect(g).toMatchObject({ x: 60, y: 60, rows: 5, cols: 5, S: 48 });
    expect(m.gridFromDrag({ x: 10, y: 10 }, { x: 12, y: 300 })).toBeNull();
    expect(m.gridFromDrag({ x: 0, y: 0 }, { x: 200, y: 100 }, 3, 3)).toMatchObject({ rows: 3, cols: 3, S: 100 / 3 });
  });
  it("stays on the page when it grows or moves", () => {
    const big = m.resizeGrid(grid, 4, 20);
    expect(big.S * big.cols).toBeLessThanOrEqual(m.PAGE);
    expect(big.x + big.cols * big.S).toBeLessThanOrEqual(m.PAGE + 1e-9);
    const moved = m.moveGrid(grid, 1000, -1000);
    expect(moved).toMatchObject({ x: m.PAGE - 200, y: 0 });
  });
  it("carries what's on it when it moves", () => {
    let d = m.stamp(withGrid, { kind: "stamp", stamp: "stone", color: "black", at: { at: "cell", r: 1, c: 1 } });
    d = m.setGrid(d, m.moveGrid(grid, 20, 0));
    expect(m.pointOf(d.grid, (d.items[0] as { at: m.Anchor }).at)).toEqual({ x: 180, y: 160 });
  });
  it("taken away, leaves what's drawn where it was (washes go with it)", () => {
    let d = m.stamp(withGrid, { kind: "stamp", stamp: "stone", at: { at: "cell", r: 0, c: 0 } });
    d = m.washCell(d, { at: "cell", r: 1, c: 1 }, "blue", true);
    d = m.removeGrid(d);
    expect(d.grid).toBeNull();
    expect(d.items).toEqual([{ id: 1, kind: "stamp", stamp: "stone", at: { at: "page", x: 120, y: 120 } }]);
  });
});

describe("changes", () => {
  const stone = (r: number, c: number, color: m.SymbolColor = "black"): m.Stamp => ({ kind: "stamp", stamp: "stone", color, at: { at: "cell", r, c } });
  it("a stamp tapped again comes off; another stamp takes its place", () => {
    let d = m.stamp(withGrid, stone(0, 0));
    expect(d.items).toHaveLength(1);
    d = m.stamp(d, stone(0, 0, "white"));
    expect(d.items).toMatchObject([{ color: "white" }]);
    d = m.stamp(d, stone(0, 0, "white"));
    expect(d.items).toHaveLength(0);
  });
  it("washing a square: on, another colour, off", () => {
    const at: m.CellAt = { at: "cell", r: 2, c: 3 };
    let d = m.washCell(withGrid, at, "blue", true);
    d = m.washCell(d, at, "red", true);
    expect(d.items).toMatchObject([{ kind: "wash", color: "red" }]);
    expect(m.washCell(d, at, "red", true)).toBe(d);
    expect(m.washCell(d, at, "red", false).items).toHaveLength(0);
  });
  it("writing replaces what was written; nothing written rubs it out", () => {
    const at: m.Anchor = { at: "cell", r: 0, c: 1 };
    let d = m.write(withGrid, at, " 3 ");
    expect(m.textAt(d, at)?.text).toBe("3");
    expect(m.write(d, at, "3")).toBe(d);
    d = m.write(d, at, "12");
    expect(d.items).toMatchObject([{ kind: "text", text: "12" }]);
    expect(m.write(d, at, "").items).toHaveLength(0);
  });
});

describe("the eraser", () => {
  it("finds the top thing under a point: writing over stamps over lines over washes", () => {
    let d = m.washCell(withGrid, { at: "cell", r: 0, c: 0 }, "blue", true);
    d = m.add(d, { kind: "line", weight: "bold", from: { at: "corner", r: 0, c: 0 }, to: { at: "corner", r: 1, c: 1 } });
    const p = P(0.5, 0.5);
    expect(m.hit(d, p)?.kind).toBe("line");
    d = m.stamp(d, { kind: "stamp", stamp: "stone", at: { at: "cell", r: 0, c: 0 } });
    expect(m.hit(d, p)?.kind).toBe("stamp");
    d = m.write(d, { at: "cell", r: 0, c: 0 }, "5");
    expect(m.hit(d, p)?.kind).toBe("text");
    expect(m.hit(d, P(3.5, 3.5))).toBeNull();
  });
  it("finds a freehand stroke near its ink", () => {
    const d = m.add(m.EMPTY, { kind: "pen", weight: "bold", points: [{ at: "page", x: 10, y: 10 }, { at: "page", x: 100, y: 10 }] });
    expect(m.hit(d, { x: 50, y: 15 })?.kind).toBe("pen");
    expect(m.hit(d, { x: 50, y: 30 })).toBeNull();
  });
});

describe("undo", () => {
  it("steps back and forward; a new change drops what was undone", () => {
    let h = m.start();
    h = m.commit(h, withGrid);
    h = m.commit(h, m.write(h.now, { at: "cell", r: 0, c: 0 }, "1"));
    expect(m.commit(h, h.now)).toBe(h);
    h = m.undo(h);
    expect(h.now).toBe(withGrid);
    h = m.redo(h);
    expect(h.now.items).toHaveLength(1);
    h = m.undo(m.undo(h));
    expect(h.now).toBe(m.EMPTY);
    expect(m.undo(h)).toBe(h);
    h = m.commit(h, withGrid);
    expect(h.future).toHaveLength(0);
  });
});

describe("the drawing as data", () => {
  it("lists the grid and each thing with where it is, in the grid's squares", () => {
    let d = m.stamp(withGrid, { kind: "stamp", stamp: "crest", color: "orange", at: { at: "cell", r: 2, c: 1 } });
    d = m.write(d, { at: "cell", r: 0, c: 4 }, "7");
    expect(m.objects(d)).toEqual({
      page: m.PAGE, grid: { rows: 4, cols: 5, x: 100, y: 100, square: 40 },
      items: [{ kind: "stamp", stamp: "crest", color: "orange", at: { at: "cell", r: 2, c: 1 } }, { kind: "text", at: { at: "cell", r: 0, c: 4 }, text: "7" }],
    });
  });
  it("a saved drawing reads back; anything else doesn't", () => {
    const d = m.write(withGrid, { at: "cell", r: 0, c: 0 }, "1");
    expect(m.revive(JSON.parse(JSON.stringify(d)))).toEqual(d);
    expect(m.revive({ items: "no" })).toBeNull();
    expect(m.revive(null)).toBeNull();
  });
});

describe("drawing it", () => {
  it("in the boards' classes: a pen grid, washes, the real stones, handwriting", () => {
    expect(gridSvg(grid)).toContain('class="frame"');
    expect(gridSvg(grid).match(/class="gridline"/g)).toHaveLength(3 + 4);
    let d = m.washCell(withGrid, { at: "cell", r: 0, c: 0 }, "green", true);
    d = m.stamp(d, { kind: "stamp", stamp: "stone", color: "white", at: { at: "cell", r: 1, c: 1 } });
    d = m.write(d, { at: "cell", r: 2, c: 2 }, "<9>");
    const [wash, stone, text] = d.items.map((it) => itemSvg(d, it));
    expect(wash).toContain('class="wash sp-wash"');
    expect(wash).toContain("var(--wash-green)");
    expect(stone).toContain("stone white");
    expect(text).toContain("&lt;9&gt;");
  });
});

describe("a quick drag", () => {
  it("passes over every point between where the pointer was and is", () => {
    expect(m.along({ x: 0, y: 0 }, { x: 10, y: 0 }, 4)).toEqual([{ x: 10 / 3, y: 0 }, { x: 20 / 3, y: 0 }, { x: 10, y: 0 }]);
    expect(m.along({ x: 0, y: 0 }, { x: 0, y: 0 }, 4)).toEqual([{ x: 0, y: 0 }]);
  });
});
