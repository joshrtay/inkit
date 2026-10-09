// The sketchpad's camera: which part of the paper the workspace shows, and how big. The paper is
// open in every direction (the drawing's page units, model.ts, go on past PAGE and below 0); the
// view is the page point at the workspace's top-left corner and the scale, screen pixels per page
// unit. Fit shows the puzzle (the grid and everything drawn, with a margin) as big as the room
// allows, or the first PAGE × PAGE of paper when nothing's drawn yet. Pure: unit-tested in
// tests/unit/view.test.ts; components/Sketchpad.tsx moves it (wheel, drag with space or the middle
// button, two fingers, the zoom buttons).
import { boxOf } from "./check";
import * as m from "./model";

export interface View { x: number; y: number; k: number }
export interface Box { x: number; y: number; w: number; h: number }
/** The room the drawing is fitted into: the workspace's size, less what floats over its edges (the palette). */
export interface Room { w: number; h: number; left?: number; top?: number; right?: number; bottom?: number }

export const MIN_K = 0.1, MAX_K = 12;
export const clampK = (k: number) => Math.min(MAX_K, Math.max(MIN_K, k));

/** Where the ink is: the grid and every item (gaps aside), not squared or padded; null if nothing's drawn. */
export function inkBounds(d: m.Drawing): Box | null {
  const boxes = d.items.filter((it) => it.kind !== "gap").map((it) => boxOf(d, it));
  if (d.grid) { const span = m.gridSpan(d.grid); boxes.push({ x: d.grid.x, y: d.grid.y, w: span.w * d.grid.S, h: span.h * d.grid.S }); }
  if (!boxes.length) return null;
  const x0 = Math.min(...boxes.map((b) => b.x)), y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w)), y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** What Fit shows: the ink with a margin (a fifth of a square, at least 12 units), or the first page when blank. */
export function fitBox(d: m.Drawing): Box {
  const b = inkBounds(d);
  if (!b) return { x: 0, y: 0, w: m.PAGE, h: m.PAGE };
  const pad = Math.max(12, m.squareOf(d) * 0.2);
  return { x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad };
}

/** The view that shows `box` as big as it goes in the room, centred in it. `most`: no bigger than this
 *  scale (a single stamp shouldn't fill the screen). */
export function fitView(box: Box, room: Room, most = 8): View {
  const left = room.left ?? 0, top = room.top ?? 0, w = Math.max(40, room.w - left - (room.right ?? 0)), h = Math.max(40, room.h - top - (room.bottom ?? 0));
  const k = clampK(Math.min(most, w / Math.max(1, box.w), h / Math.max(1, box.h)));
  return { k, x: box.x + box.w / 2 - (left + w / 2) / k, y: box.y + box.h / 2 - (top + h / 2) / k };
}

/** Fit, kept clear of what floats over the room (`avoid`, in the room's pixels: the palette): the
 *  whole room if the puzzle misses it there (or slid aside, it does); else the room beside it or
 *  below it, whichever shows the puzzle bigger. */
export function fitClear(box: Box, room: Room, avoid: Box | null): View {
  const whole = fitView(box, room);
  if (!avoid) return whole;
  const on = (v: View) => {
    const a = toScreen(v, box), b = toScreen(v, { x: box.x + box.w, y: box.y + box.h });
    return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
  };
  const clear = (r: Box) => r.x >= avoid.x + avoid.w || r.y >= avoid.y + avoid.h || r.x + r.w <= avoid.x || r.y + r.h <= avoid.y;
  const s = on(whole);
  if (clear(s)) return whole;
  // slid right, past it, if the room has the width
  const dx = avoid.x + avoid.w + 8 - s.x;
  if (s.x + s.w + dx <= room.w - (room.right ?? 0)) return panBy(whole, dx, 0);
  const beside = fitView(box, { ...room, left: avoid.x + avoid.w + 8 });
  const below = fitView(box, { ...room, top: avoid.y + avoid.h + 8 });
  return beside.k >= below.k ? beside : below;
}

/** A screen point in the workspace (pixels from its top-left) as a page point, and back. */
export const toPage = (v: View, sx: number, sy: number): m.XY => ({ x: v.x + sx / v.k, y: v.y + sy / v.k });
export const toScreen = (v: View, p: m.XY): m.XY => ({ x: (p.x - v.x) * v.k, y: (p.y - v.y) * v.k });

/** Zoomed to scale `k`, the page point under screen point (sx, sy) staying put. */
export function zoomAt(v: View, k: number, sx: number, sy: number): View {
  const k2 = clampK(k), p = toPage(v, sx, sy);
  return { k: k2, x: p.x - sx / k2, y: p.y - sy / k2 };
}
/** Moved by (dx, dy) screen pixels: the paper follows the pointer. */
export const panBy = (v: View, dx: number, dy: number): View => ({ ...v, x: v.x - dx / v.k, y: v.y - dy / v.k });

/** Two fingers: the view that keeps the page point that was under their middle (`from`, at scale
 *  `start.k`) under their middle now (`to`), scaled by how far apart they've moved. */
export function pinch(start: View, from: { mid: m.XY; dist: number }, to: { mid: m.XY; dist: number }): View {
  const k = clampK(start.k * (to.dist / Math.max(1, from.dist)));
  const p = toPage(start, from.mid.x, from.mid.y);
  return { k, x: p.x - to.mid.x / k, y: p.y - to.mid.y / k };
}

/** The view's viewBox for an SVG `w` × `h` pixels. */
export const viewBox = (v: View, w: number, h: number) => `${v.x} ${v.y} ${Math.max(1, w) / v.k} ${Math.max(1, h) / v.k}`;
