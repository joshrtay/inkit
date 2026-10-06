// A maze's second phase (the grid player hands over once its walls check out): drag a line
// through the open cells from the way in to the way out. Arrow keys step too. The maze is a
// tree, so a drag back along the line pulls it back, and a fast drag finds the short way round.
import type { Puzzle } from "../../engine/types.ts";

type XY = [number, number];

export interface WalkView {
  svg: SVGSVGElement;
  /** where the line and the walker are drawn */
  layer: Element;
  el(tag: string, attrs: Record<string, string | number>, parent?: Element): Element;
  center(cell: number): XY;
  cellAt(pt: XY): number;
  toBoard(evt: PointerEvent): XY;
  say(text: string, tone?: "" | "good" | "warn"): void;
  /** the walker got out, after this many cells */
  out(cells: number): void;
}

export interface Walk {
  readonly active: boolean;
  readonly done: boolean;
  /** cells walked so far, for saving */
  readonly trail: number[];
  start(trail?: number[]): void;
  stop(): void;
  /** one step back; false at the start */
  back(): boolean;
}

const STEPS: Record<string, XY> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

/** The cell inside a door, and the point `d` units outside it. */
function door(p: Puzzle, role: "in" | "out", center: (i: number) => XY, half: number) {
  const e = [...p.doors].find(([, r]) => r === role)![0];
  const b = p.grid.borders[e], inside = b.cells[0] < 0 ? b.cells[1] : b.cells[0];
  const [cx, cy] = center(inside);
  // the outward step: away from the cell, across the border
  const [dx, dy] = b.horizontal ? [0, b.cells[0] < 0 ? -1 : 1] : [b.cells[0] < 0 ? -1 : 1, 0];
  return { cell: inside, at: (d: number): XY => [cx + dx * (half + d), cy + dy * (half + d)] };
}

export function createWalk(p: Puzzle, fence: Uint8Array, half: number, v: WalkView): Walk {
  const g = p.grid;
  const entry = door(p, "in", v.center, half), exit = door(p, "out", v.center, half);
  let active = false, walking = false, trail: number[] = [entry.cell], tail: XY | null = null;
  const head = () => trail[trail.length - 1];
  const isOut = () => head() === exit.cell;
  const open = (i: number) => g.cellLinks[i].filter((l) => fence[g.links[l].border] !== 1)
    .map((l) => (g.links[l].cells[0] === i ? g.links[l].cells[1] : g.links[l].cells[0]));

  function render() {
    v.layer.replaceChildren();
    if (!active) return;
    const out = isOut();
    for (const n of out || walking ? [] : open(head())) {
      const [x, y] = v.center(n);
      v.el("rect", { class: "reach", x: x - half + 4, y: y - half + 4, width: 2 * half - 8, height: 2 * half - 8, rx: 4 }, v.layer);
    }
    const pts: XY[] = [entry.at(8), ...trail.map(v.center)];
    if (out) pts.push(exit.at(14)); else if (tail) pts.push(tail);
    v.el("polyline", { class: "trail", points: pts.map((pt) => pt.join(",")).join(" ") }, v.layer);
    const [tx, ty] = out ? exit.at(14) : tail ?? v.center(head());
    v.el("circle", { class: "token", r: 10, cx: tx, cy: ty }, v.layer);
    if (out) v.out(trail.length);
    else v.say(`The walls are right! Now find the way out: ${trail.length} square${trail.length === 1 ? "" : "s"} so far.`, "good");
  }

  /** shortest open route between two cells, at most 4 steps (covers fast drags) */
  function route(from: number, to: number): number[] | null {
    const prev = new Map<number, number>(), seen = new Set([from]);
    let frontier = [from];
    for (let d = 0; d < 4 && frontier.length; d++) {
      const next: number[] = [];
      for (const s of frontier) for (const n of open(s)) {
        if (seen.has(n)) continue;
        seen.add(n); prev.set(n, s);
        if (n === to) { const steps: number[] = []; for (let u = n; u !== from; u = prev.get(u)!) steps.unshift(u); return steps; }
        next.push(n);
      }
      frontier = next;
    }
    return null;
  }
  /** extend or pull back the line so it ends at cell s */
  function goTo(s: number) {
    if (isOut() || s === head()) return;
    const back = trail.indexOf(s);
    if (back >= 0) { trail = trail.slice(0, back + 1); return; }
    for (const n of route(head(), s) ?? []) {
      if (trail.length > 1 && n === trail[trail.length - 2]) trail.pop(); else trail.push(n);
      if (n === exit.cell) break;
    }
  }
  /** stretch the line from the last cell toward the finger, along an open corridor only */
  function stretchTo([px, py]: XY) {
    tail = null;
    if (isOut()) return;
    const [hx, hy] = v.center(head());
    let best: XY | null = null, reach = 0;
    for (const n of open(head())) {
      const [nx, ny] = v.center(n), dx = Math.sign(nx - hx), dy = Math.sign(ny - hy);
      const along = (px - hx) * dx + (py - hy) * dy;
      if (along > reach) { reach = along; best = [dx, dy]; }
    }
    if (best) tail = [hx + best[0] * Math.min(reach, 2 * half), hy + best[1] * Math.min(reach, 2 * half)];
  }

  v.svg.addEventListener("pointerdown", (evt) => {
    if (!active || isOut()) return;
    const s = v.cellAt(v.toBoard(evt));
    if (s < 0 || (!trail.includes(s) && !route(head(), s))) return;
    goTo(s);
    walking = true;
    try { v.svg.setPointerCapture(evt.pointerId); } catch { /* synthetic events */ }
    stretchTo(v.toBoard(evt));
    render();
  });
  v.svg.addEventListener("pointermove", (evt) => {
    if (!walking) return;
    const pt = v.toBoard(evt), s = v.cellAt(pt);
    if (s >= 0) goTo(s);
    stretchTo(pt);
    render();
  });
  const end = () => { if (!walking) return; walking = false; tail = null; render(); };
  v.svg.addEventListener("pointerup", end);
  v.svg.addEventListener("pointercancel", end);
  document.addEventListener("keydown", (evt) => {
    const t = evt.target;
    if (!active || isOut() || !(evt.key in STEPS) || (t instanceof Element && t.closest("input, textarea, select, dialog"))) return;
    evt.preventDefault();
    const [r, c] = g.rc(head()), [dr, dc] = STEPS[evt.key], r2 = r + dr, c2 = c + dc;
    if (r2 < 0 || c2 < 0 || r2 >= g.rows || c2 >= g.cols) return;
    const n = g.cell(r2, c2);
    if (trail.length > 1 && n === trail[trail.length - 2]) trail.pop();
    else if (open(head()).includes(n)) trail.push(n);
    else return;
    render();
  });

  return {
    get active() { return active; },
    get done() { return active && isOut(); },
    get trail() { return trail; },
    start(saved) {
      active = true;
      // a saved line only counts if it still runs through open cells from the way in
      trail = saved?.length && saved[0] === entry.cell && saved.every((s, k) => k === 0 || open(saved[k - 1]).includes(s)) ? [...saved] : [entry.cell];
      v.svg.classList.add("walking");
      render();
    },
    stop() { active = false; walking = false; tail = null; trail = [entry.cell]; v.svg.classList.remove("walking"); render(); },
    back() {
      if (!active || trail.length < 2 || isOut()) return false;
      trail.pop(); render();
      return true;
    },
  };
}
