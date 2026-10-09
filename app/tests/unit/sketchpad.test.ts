// The sketchpad's drawing (app/sketchpad/model.ts): snapping to the grid, what's under a point,
// the changes, undo, and the drawing as data. Its SVG (draw.ts) is checked for the boards' classes.
import { describe, expect, it } from "vitest";
import * as m from "~/sketchpad/model";
import { gridSvg, itemSvg, onDark, penScale, penVars, stampSvg } from "~/sketchpad/draw";

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
  it("snapping off, or off the grid, a stamp stays where it's put: in the grid's squares however far out", () => {
    expect(m.stampAnchor(grid, P(1.5, 1.5), "stone", false)).toEqual({ at: "grid", r: 1.5, c: 1.5 });
    expect(m.stampAnchor(grid, { x: 10, y: 20 }, "stone", true)).toEqual({ at: "grid", r: -2, c: -2.25 });
    expect(m.stampAnchor(null, { x: 10, y: 20 }, "stone", true)).toEqual({ at: "page", x: 10, y: 20 });
  });
  it("a clue far out in the margin moves and grows with the grid", () => {
    let d = m.write(withGrid, m.loose(grid, { x: 20, y: 20 }), "Sudoku");
    d = m.setGrid(d, { ...grid, x: 200, S: 20 });
    expect(m.pointOf(d.grid, (d.items[0] as { at: m.Anchor }).at)).toEqual({ x: 160, y: 60 });
  });
  it("diamonds go on lines", () => {
    expect(m.stampAnchor(grid, P(1.1, 2.4), "diamond", true)).toEqual({ at: "edge", r: 1, c: 2, side: "top" });
    expect(m.stampAnchor(grid, P(0.5, 3.05), "open-diamond", true)).toEqual({ at: "edge", r: 0, c: 3, side: "left" });
  });
  it("small writing goes on a square's sides and corners, a corner of the grid or a line", () => {
    expect(m.textAnchor(grid, P(1.2, 1.5), true, true)).toEqual({ at: "inset", r: 1, c: 1, spot: "n" });
    expect(m.textAnchor(grid, P(1.22, 1.22), true, true)).toEqual({ at: "inset", r: 1, c: 1, spot: "nw" });
    expect(m.textAnchor(grid, P(2.02, 3.97), true, true)).toEqual({ at: "corner", r: 2, c: 4 });
    expect(m.textAnchor(grid, P(2.5, 3.03), true, true)).toEqual({ at: "edge", r: 2, c: 3, side: "left" });
    expect(m.textAnchor(grid, P(1.2, 1.5), false, true)).toEqual({ at: "cell", r: 1, c: 1 });
    expect(m.pointOf(grid, { at: "inset", r: 0, c: 0, spot: "e" })).toEqual({ x: 132, y: 120 });
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
    const free = m.straightLine(null, { x: 10, y: 10 }, { x: 50, y: 13 }, true);
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

describe("gaps in the grid's lines", () => {
  it("the eraser finds the stretch of line under it, level or upright", () => {
    expect(m.edgeAt(grid, P(1.03, 2.4), 8)).toEqual({ at: "edge", r: 1, c: 2, side: "top" });
    expect(m.edgeAt(grid, P(2.6, 5.05), 8)).toEqual({ at: "edge", r: 2, c: 5, side: "left" });
    expect(m.edgeAt(grid, P(1.5, 1.5), 8)).toBeNull();
    expect(m.edgeAt(grid, P(1.02, 1.01), 8, "top")).toEqual({ at: "edge", r: 1, c: 1, side: "top" });
  });
  it("a gap comes and goes; the grid leaves it out (a break in the middle, run on through gaps beside it)", () => {
    const e: m.EdgeAt = { at: "edge", r: 0, c: 1, side: "top" };
    let d = m.gapEdge(withGrid, e, true);
    expect(m.gapEdge(d, e, true)).toBe(d);
    expect(m.gapsOf(d)).toEqual([e]);
    // the top of the frame: 0 to 1.36 squares, then 1.64 to 5
    expect(gridSvg(grid, m.gapsOf(d))).toContain('d="M100 100H154.4M165.6 100H300');
    d = m.gapEdge(d, { at: "edge", r: 0, c: 2, side: "top" }, true);
    expect(gridSvg(grid, m.gapsOf(d))).toContain('d="M100 100H154.4M205.6 100H300');
    expect(m.hit(d, P(0, 1.5))?.kind).toBe("gap");
    expect(m.gapEdge(d, e, false).items).toHaveLength(1);
    expect(m.objects(d).items).toEqual([{ kind: "gap", at: e }, { kind: "gap", at: { at: "edge", r: 0, c: 2, side: "top" } }]);
    // the grid taken away takes its gaps
    expect(m.removeGrid(d).items).toEqual([]);
  });
  it("an inner line keeps its faint pen", () => {
    const svg = gridSvg(grid, [{ at: "edge", r: 2, c: 2, side: "left" }]);
    expect(svg.match(/class="gridline"/g)!.length).toBe(3 + 4 + 1);   // the line at c = 2 in two stretches
  });
});

describe("shapes", () => {
  it("turn, flip and toggle on the pad", () => {
    const L: m.Cells = [[0, 0], [1, 0], [2, 0], [2, 1]];
    expect(m.flipCells(L)).toEqual([[0, 1], [1, 1], [2, 0], [2, 1]]);   // a J
    expect(m.turnCells(m.turnCells(m.turnCells(m.turnCells(L))))).toEqual(L);
    expect(m.toggleCell([[0, 0]], 0, 0)).toEqual([[0, 0]]);
    expect(m.toggleCell([[0, 0]], 1, 1)).toEqual([[0, 0], [1, 1]]);
    expect(m.normalCells([[2, 3], [3, 3]])).toEqual([[0, 0], [1, 0]]);
  });
  it("are drawn as the boards draw them: hollow dashed, tilted if they may turn", () => {
    const s = { stamp: "shape" as const, cells: [[0, 0], [0, 1]] as m.Cells, color: "blue" as const };
    expect(stampSvg({ ...s, hollow: true }, 50, 50, 48)).toContain("hollow");
    expect(stampSvg({ ...s, rotate: true }, 50, 50, 48)).toContain("rotate(16");
    expect(stampSvg({ stamp: "eraser", color: "red" }, 50, 50, 48)).toContain("var(--wash-red)");
    expect(stampSvg({ stamp: "diamond" }, 50, 50, 48)).toContain('class="diamond twins"');
    expect(stampSvg({ stamp: "open-diamond" }, 50, 50, 48)).toContain('class="diamond opposites"');
    expect(stampSvg({ stamp: "stone", color: "red", hidden: true }, 50, 50, 48)).toContain("sp-hidden");
  });
  it("a stamp with other options is another stamp", () => {
    const at: m.Anchor = { at: "cell", r: 0, c: 0 }, s: m.Stamp = { kind: "stamp", stamp: "shape", cells: [[0, 0]], color: "yellow", at };
    const d = m.stamp(m.stamp(withGrid, s), { ...s, hollow: true });
    expect(d.items).toMatchObject([{ hollow: true }]);
  });
});

describe("scale", () => {
  it("the pens' weights follow the grid's squares, within 0.6× and 1.4×", () => {
    expect(penScale(48)).toBe(1);
    expect(penScale(14)).toBe(0.6);
    expect(penScale(100)).toBe(1.4);
    expect(penVars(24)["--pen-bold"]).toBe("3.3");
  });
  it("dots and hoshi never get too small to see", () => {
    expect(stampSvg({ stamp: "hoshi" }, 0, 0, 14)).toContain('r="2.6"');
    expect(stampSvg({ stamp: "dot" }, 0, 0, 14)).toContain('r="2.2"');
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
  it("a drawing from before the gaps and small writing still reads back", () => {
    const old = { grid: { x: 10, y: 10, rows: 2, cols: 2, S: 48 }, next: 3, items: [
      { id: 1, kind: "stamp", stamp: "shape", at: { at: "cell", r: 0, c: 0 }, color: "yellow", cells: [[0, 0]] },
      { id: 2, kind: "text", at: { at: "page", x: 500, y: 500 }, text: "3" }] };
    const d = m.revive(JSON.parse(JSON.stringify(old)))!;
    expect(d.items).toHaveLength(2);
    expect(() => d.items.map((it) => itemSvg(d, it))).not.toThrow();
  });
  it("a saved drawing reads back; anything else doesn't", () => {
    const d = m.write(withGrid, { at: "cell", r: 0, c: 0 }, "1");
    expect(m.revive(JSON.parse(JSON.stringify(d)))).toEqual(d);
    expect(m.revive({ items: "no" })).toBeNull();
    expect(m.revive(null)).toBeNull();
  });
});

describe("drawing it", () => {
  it("a panel's grid as tracks: every stretch a wide pale stroke, broken in the middle at a gap", () => {
    const tracks = { ...grid, tracks: true };
    const n = grid.rows * (grid.cols + 1) + grid.cols * (grid.rows + 1);
    expect(gridSvg(tracks).match(/class="panel-track"/g)).toHaveLength(n);
    expect(gridSvg(tracks)).not.toContain("gridline");
    expect(gridSvg(tracks, [{ at: "edge", r: 1, c: 1, side: "top" }]).match(/class="panel-track"/g)).toHaveLength(n + 1);
    expect(m.objects(m.setGrid(m.EMPTY, tracks)).grid).toMatchObject({ tracks: true });
  });
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
  it("small writing at half size; writing on a shaded square or a black stone in the paper's colour", () => {
    let d = m.stamp(withGrid, { kind: "stamp", stamp: "rock", at: { at: "cell", r: 0, c: 0 } });
    d = m.write(d, { at: "cell", r: 0, c: 0 }, "2");
    d = m.write(d, { at: "inset", r: 1, c: 1, spot: "nw" }, "15", true);
    const [, onRock, small] = d.items;
    expect(itemSvg(d, onRock)).toContain("on-rock");
    expect(itemSvg(d, small)).toContain("font-size:10px");
    expect(itemSvg(d, small)).not.toContain("on-rock");
    expect(onDark(d, small as Extract<m.Item, { kind: "text" }>)).toBe(false);
  });
});

describe("a quick drag", () => {
  it("passes over every point between where the pointer was and is", () => {
    expect(m.along({ x: 0, y: 0 }, { x: 10, y: 0 }, 4)).toEqual([{ x: 10 / 3, y: 0 }, { x: 20 / 3, y: 0 }, { x: 10, y: 0 }]);
    expect(m.along({ x: 0, y: 0 }, { x: 0, y: 0 }, 4)).toEqual([{ x: 0, y: 0 }]);
  });
});

describe("thermometers", () => {
  it("are dragged square by square from the bulb, back steps undo, a bulb tapped takes one off", async () => {
    const m = await import("~/sketchpad/model");
    let cells: [number, number][] = [[3, 0]];
    cells = m.thermoStep(cells, 2, 1);   // diagonal: next to it
    cells = m.thermoStep(cells, 0, 1);   // two away: skipped
    cells = m.thermoStep(cells, 1, 1);
    cells = m.thermoStep(cells, 2, 1);   // back: the last comes off
    expect(cells).toEqual([[3, 0], [2, 1]]);
    let d = m.thermo(m.EMPTY, [[3, 0], [2, 1], [1, 1]]);
    expect(d.items).toEqual([{ id: 1, kind: "thermo", cells: [[3, 0], [2, 1], [1, 1]] }]);
    expect(m.thermo(d, [[3, 0]]).items).toEqual([]);
    d = m.thermo(d, [[2, 2]]);
    expect(d.items).toHaveLength(1);
  });
});
