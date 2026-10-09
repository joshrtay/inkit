// The sketchpad's camera (sketchpad/view.ts): Fit shows the puzzle, not the page; zoom keeps the
// point under the pointer; panning and pinching move the paper with the fingers.
import { describe, expect, it } from "vitest";
import * as m from "~/sketchpad/model";
import * as cam from "~/sketchpad/view";

const small: m.Grid = { x: 200, y: 200, rows: 4, cols: 4, S: 30 };
const room = { w: 900, h: 700 };

describe("the view", () => {
  it("fits the puzzle, not the page: a small grid fills the room", () => {
    const d = m.setGrid(m.EMPTY, small);
    const v = cam.fitView(cam.fitBox(d), room);
    const tl = cam.toScreen(v, { x: small.x, y: small.y }), br = cam.toScreen(v, { x: small.x + 4 * small.S, y: small.y + 4 * small.S });
    // the grid's side is most of the room's smaller side, and it's centred
    expect(br.y - tl.y).toBeGreaterThan(0.6 * room.h);
    expect((tl.x + br.x) / 2).toBeCloseTo(room.w / 2, 5);
    expect((tl.y + br.y) / 2).toBeCloseTo(room.h / 2, 5);
  });
  it("fits beside what floats over the room's left side", () => {
    const d = m.setGrid(m.EMPTY, small);
    const v = cam.fitView(cam.fitBox(d), { ...room, left: 300 });
    expect(cam.toScreen(v, { x: small.x - 1, y: small.y }).x).toBeGreaterThan(300);
  });
  it("shows the first page when nothing's drawn, and takes in everything drawn, wherever it is", () => {
    expect(cam.fitBox(m.EMPTY)).toEqual({ x: 0, y: 0, w: m.PAGE, h: m.PAGE });
    let d = m.setGrid(m.EMPTY, small);
    d = m.write(d, { at: "page", x: 1500, y: -300 }, "far");
    const b = cam.fitBox(d);
    expect(b.x).toBeLessThan(small.x);
    expect(b.x + b.w).toBeGreaterThan(1500);
    expect(b.y).toBeLessThan(-300);
  });
  it("zooms about a point, which stays put", () => {
    const v: cam.View = { x: 10, y: 20, k: 1.5 };
    const before = cam.toPage(v, 300, 200), z = cam.zoomAt(v, 3, 300, 200), after = cam.toPage(z, 300, 200);
    expect(z.k).toBe(3);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
    expect(cam.zoomAt(v, 1000, 0, 0).k).toBe(cam.MAX_K);
  });
  it("pans with the pointer, and pinches with two fingers", () => {
    const v: cam.View = { x: 0, y: 0, k: 2 };
    const p = cam.toPage(v, 100, 100), moved = cam.panBy(v, 40, -20);
    expect(cam.toScreen(moved, p)).toEqual({ x: 140, y: 80 });
    const from = { mid: { x: 100, y: 100 }, dist: 50 }, to = { mid: { x: 150, y: 120 }, dist: 100 };
    const pin = cam.pinch(v, from, to);
    expect(pin.k).toBe(4);
    const q = cam.toScreen(pin, p);
    expect(q.x).toBeCloseTo(150, 9);
    expect(q.y).toBeCloseTo(120, 9);
  });
  it("keeps Fit clear of the palette: whole room when it misses, else beside or below it", () => {
    const d = m.setGrid(m.EMPTY, small), box = cam.fitBox(d);
    const palette = { x: 8, y: 8, w: 250, h: 240 };
    const v = cam.fitClear(box, room, palette);
    const tl = cam.toScreen(v, { x: box.x, y: box.y }), br = cam.toScreen(v, { x: box.x + box.w, y: box.y + box.h });
    const clear = tl.x >= palette.x + palette.w || tl.y >= palette.y + palette.h;
    expect(clear).toBe(true);
    expect(br.x).toBeLessThanOrEqual(room.w + 1e-6);
    expect(cam.fitClear(box, room, null)).toEqual(cam.fitView(box, room));
  });
  it("is a viewBox the size of the SVG", () => {
    expect(cam.viewBox({ x: -10, y: 5, k: 2 }, 400, 300)).toBe("-10 5 200 150");
  });
});
