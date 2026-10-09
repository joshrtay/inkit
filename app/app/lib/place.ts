// Where a floating thing goes beside what it belongs to (a tooltip beside its button, a menu under
// its button, a tip beside a mark on the paper): on the side asked for if it fits there, else the
// opposite side, else whichever side has room; then slid along that side to stay inside the
// bounds. Pure, so it's unit-tested (tests/unit/place.test.ts); components/Tooltips.tsx and the
// sketchpad use it.

export type Side = "top" | "bottom" | "left" | "right";
export interface Rect { x: number; y: number; w: number; h: number }
export interface Placed { x: number; y: number; side: Side; /** where the anchor's middle is, along the placed box's edge (for an arrow) */ arrow: number }

const OPPOSITE: Record<Side, Side> = { top: "bottom", bottom: "top", left: "right", right: "left" };
const clamp = (v: number, lo: number, hi: number) => (hi < lo ? lo : Math.min(hi, Math.max(lo, v)));

/** A box `size` big beside `anchor`, `gap` away from it, within `bounds` (kept `margin` in from its edges).
 *  `align`: centred on the anchor along that side, or lined up with its start or end edge. */
export function place(anchor: Rect, size: { w: number; h: number }, bounds: Rect, side: Side = "bottom",
  { gap = 8, margin = 6, align = "center" }: { gap?: number; margin?: number; align?: "center" | "start" | "end" } = {}): Placed {
  const room: Record<Side, number> = {
    top: anchor.y - bounds.y - margin,
    bottom: bounds.y + bounds.h - (anchor.y + anchor.h) - margin,
    left: anchor.x - bounds.x - margin,
    right: bounds.x + bounds.w - (anchor.x + anchor.w) - margin,
  };
  const need = (s: Side) => (s === "top" || s === "bottom" ? size.h : size.w) + gap;
  const order: Side[] = [side, OPPOSITE[side], ...(["bottom", "top", "right", "left"] as Side[]).filter((s) => s !== side && s !== OPPOSITE[side])];
  const chosen = order.find((s) => room[s] >= need(s))
    // nowhere it fits whole: the side with the most room
    ?? order.reduce((a, b) => (room[b] - need(b) > room[a] - need(a) ? b : a));
  let x: number, y: number;
  if (chosen === "top" || chosen === "bottom") {
    y = chosen === "top" ? anchor.y - gap - size.h : anchor.y + anchor.h + gap;
    x = align === "start" ? anchor.x : align === "end" ? anchor.x + anchor.w - size.w : anchor.x + anchor.w / 2 - size.w / 2;
    x = clamp(x, bounds.x + margin, bounds.x + bounds.w - margin - size.w);
    y = clamp(y, bounds.y + margin, bounds.y + bounds.h - margin - size.h);
    return { x, y, side: chosen, arrow: clamp(anchor.x + anchor.w / 2 - x, 10, size.w - 10) };
  }
  x = chosen === "left" ? anchor.x - gap - size.w : anchor.x + anchor.w + gap;
  y = align === "start" ? anchor.y : align === "end" ? anchor.y + anchor.h - size.h : anchor.y + anchor.h / 2 - size.h / 2;
  y = clamp(y, bounds.y + margin, bounds.y + bounds.h - margin - size.h);
  x = clamp(x, bounds.x + margin, bounds.x + bounds.w - margin - size.w);
  return { x, y, side: chosen, arrow: clamp(anchor.y + anchor.h / 2 - y, 10, size.h - 10) };
}

/** A DOM rect as a Rect. */
export const rectOf = (r: { left: number; top: number; width: number; height: number }): Rect => ({ x: r.left, y: r.top, w: r.width, h: r.height });
