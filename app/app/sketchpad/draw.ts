// The sketchpad's drawing (model.ts) as SVG markup, in the boards' own look (docs/style.md): the
// grid in pen like a board's, washes in watercolour, and every stamp drawn by the same functions
// the player uses (panel-draw.ts), so a stone here is the stone a player sees. The classes are
// styles.css's (under .grid-game) and sketchpad.css's (.sp-*).
import { ensoPath, LINE_COLORS, stoneSvg, symbolSvg } from "~site/game-types/grid/panel-draw.ts";
import { HEX_SIDE, hexGrid } from "~site/engine/geometry.ts";
import { CELL, gapsOf, outward, pointOf, sameAnchor, squareOf, type Anchor, type Drawing, type EdgeAt, type Grid, type Item, type XY, smoothPath } from "./model";

type A = Record<string, string | number>;
const f1 = (v: number) => Math.round(v * 10) / 10;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const tag = (name: string, a: A, body = "") =>
  `<${name}${Object.entries(a).map(([k, v]) => ` ${k}="${esc(typeof v === "number" ? String(f1(v)) : v)}"`).join("")}${body ? `>${body}</${name}>` : "/>"}`;

/** Star Battle's star, as the boards draw it (picture.ts's starPath). */
const starPath = (x: number, y: number, r: number) => Array.from({ length: 10 }, (_, k) => {
  const a = -Math.PI / 2 + (k * Math.PI) / 5, d = k % 2 ? r * 0.42 : r;
  return `${k ? "L" : "M"}${f1(x + d * Math.cos(a))} ${f1(y + d * Math.sin(a))}`;
}).join("") + "Z";
const xPath = (x: number, y: number, d: number) => `M${f1(x - d)} ${f1(y - d)}L${f1(x + d)} ${f1(y + d)}M${f1(x + d)} ${f1(y - d)}L${f1(x - d)} ${f1(y + d)}`;

/** How much of a gap's line is kept at each end, as the boards draw a panel's gaps (panel-draw.ts):
 *  a break in the middle. Where gaps run on along a line, the break runs on through them. */
const GAP_STUB = 0.36;

/** The grid in pen: faint lines inside a medium frame, with its gaps (breaks in a line) left out. */
export function gridSvg(g: Grid, gaps: EdgeAt[] = []): string {
  const { x, y, S, rows, cols } = g, W = cols * S, H = rows * S;
  if (g.shape === "hex") return hexSvg(g);
  if (g.shape === "dots") return dotsSvg(g);
  if (g.tracks) return tracksSvg(g, gaps);
  if (!gaps.length) {
    let lines = "";
    for (let r = 1; r < rows; r++) lines += tag("line", { class: "gridline", x1: x, y1: y + r * S, x2: x + W, y2: y + r * S });
    for (let c = 1; c < cols; c++) lines += tag("line", { class: "gridline", x1: x + c * S, y1: y, x2: x + c * S, y2: y + H });
    return lines + tag("rect", { class: "frame", x, y, width: W, height: H });
  }
  const gap = new Set(gaps.map((e) => `${e.side}${e.r},${e.c}`));
  /** The stretches of one line (`n` squares long) still drawn, in squares along it. */
  const kept = (n: number, isGap: (k: number) => boolean) => {
    const out: [number, number][] = [];
    let from = 0;
    for (let k = 0; k < n; k++) {
      if (!isGap(k)) continue;
      const a = isGap(k - 1) ? k : k + GAP_STUB, b = isGap(k + 1) ? k + 1 : k + 1 - GAP_STUB;
      if (a > from) out.push([from, a]);
      from = b;
    }
    if (from < n) out.push([from, n]);
    return out;
  };
  let lines = "", frame = "";
  for (let r = 0; r <= rows; r++) for (const [a, b] of kept(cols, (k) => gap.has(`top${r},${k}`))) {
    const seg = `M${f1(x + a * S)} ${f1(y + r * S)}H${f1(x + b * S)}`;
    if (r === 0 || r === rows) frame += seg; else lines += tag("line", { class: "gridline", x1: x + a * S, y1: y + r * S, x2: x + b * S, y2: y + r * S });
  }
  for (let c = 0; c <= cols; c++) for (const [a, b] of kept(rows, (k) => gap.has(`left${k},${c}`))) {
    const seg = `M${f1(x + c * S)} ${f1(y + a * S)}V${f1(y + b * S)}`;
    if (c === 0 || c === cols) frame += seg; else lines += tag("line", { class: "gridline", x1: x + c * S, y1: y + a * S, x2: x + c * S, y2: y + b * S });
  }
  return lines + (frame ? tag("path", { class: "frame", d: frame, "stroke-linecap": "square" }) : "");
}

/** A honeycomb, as the boards draw one (shaped.ts): the hexagons' shared sides faint, the outside in medium pen. */
function hexSvg(g: Grid): string {
  const h = hexGrid(g.rows, g.cols), at = (v: number) => { const [cx, cy] = h.cornerXY(v); return [g.x + cx * g.S, g.y + cy * g.S]; };
  let lines = "", frame = "";
  for (const e of h.borders) {
    const [[x1, y1], [x2, y2]] = e.corners.map(at);
    if (e.link >= 0) lines += tag("line", { class: "gridline", x1, y1, x2, y2 });
    else frame += `M${f1(x1)} ${f1(y1)}L${f1(x2)} ${f1(y2)}`;
  }
  return lines + tag("path", { class: "frame", d: frame, "stroke-linecap": "round" });
}
/** A lattice of points, one at each square's centre, faint, as the boards draw one (shaped.ts). */
function dotsSvg(g: Grid): string {
  let out = "";
  for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) {
    const p = pointOf(g, { at: "cell", r, c });
    out += tag("circle", { class: "dot lattice-point", cx: p.x, cy: p.y, r: Math.max(1.6, g.S * 0.055) });
  }
  return out;
}
/** A hexagon around (x, y) for a grid of `S` squares, as points. */
const hexPoints = (x: number, y: number, S: number) => Array.from({ length: 6 }, (_, k) => {
  const a = ((-90 + 60 * k) * Math.PI) / 180;
  return `${f1(x + HEX_SIDE * S * Math.cos(a))},${f1(y + HEX_SIDE * S * Math.sin(a))}`;
}).join(" ");
/** On a honeycomb, a cell's wash and a rock fill its hexagon. */
const onHex = (g: Grid | null, a: Anchor) => g?.shape === "hex" && a.at === "cell";

/** A panel's grid: every line a wide pale track with round ends, as the player draws it
 *  (panel-draw.ts's panelTracks), broken in the middle at a gap. */
function tracksSvg(g: Grid, gaps: EdgeAt[]): string {
  const { x, y, S, rows, cols } = g, gap = new Set(gaps.map((e) => `${e.side}${e.r},${e.c}`));
  const line = (x1: number, y1: number, x2: number, y2: number) => tag("line", { class: "panel-track", x1, y1, x2, y2, style: `stroke-width:${f1(S * 0.25)}` });
  let out = "";
  for (let r = 0; r <= rows; r++) for (let c = 0; c < cols; c++) {
    const [x1, x2, yy] = [x + c * S, x + (c + 1) * S, y + r * S];
    out += gap.has(`top${r},${c}`) ? line(x1, yy, x1 + S * GAP_STUB, yy) + line(x2 - S * GAP_STUB, yy, x2, yy) : line(x1, yy, x2, yy);
  }
  for (let c = 0; c <= cols; c++) for (let r = 0; r < rows; r++) {
    const [y1, y2, xx] = [y + r * S, y + (r + 1) * S, x + c * S];
    out += gap.has(`left${r},${c}`) ? line(xx, y1, xx, y1 + S * GAP_STUB) + line(xx, y2 - S * GAP_STUB, xx, y2) : line(xx, y1, xx, y2);
  }
  return out;
}

/** The pens' weights for a grid of `S` squares: the boards' (docs/style.md) at a board's 48, thinner
 *  for a fine grid and heavier for a big one, within 0.6× to 1.4×. */
export const penScale = (S: number) => Math.min(1.4, Math.max(0.6, S / CELL));
/** The pens' weights as CSS variables (styles.css's, on .grid-game) for a grid of `S` squares. */
export function penVars(S: number): Record<string, string> {
  const k = penScale(S), w = (v: number) => String(Math.round(v * k * 100) / 100);
  return { "--pen-hair": w(1), "--pen-fine": w(1.6), "--pen-medium": w(2.6), "--pen-bold": w(5.5), "--wash-stroke": w(12) };
}

const lineColor = (c?: string): A => (c && LINE_COLORS[c] ? { style: `fill:${LINE_COLORS[c]}` } : {});

/** One stamp, around (x, y), sized to a square of `S`. Also draws the toolbar's buttons. */
export function stampSvg(s: Pick<Extract<Item, { kind: "stamp" }>, "stamp" | "color" | "count" | "cells" | "hollow" | "rotate" | "hidden">, x: number, y: number, S: number, out: XY = { x: 0, y: -1 }): string {
  switch (s.stamp) {
    // Masyu's pearls are stones this size, and so are a panel's squares (docs/style.md); a hidden
    // one (RYB's dots shown once painted) has a dashed outline
    case "stone": return stoneSvg(s.color ?? "black", x, y, S * 0.28, s.hidden ? "pearl sp-hidden" : "pearl");
    case "star": return tag("path", { class: "star", d: starPath(x, y, S * 0.36) });
    case "rock": return tag("rect", { class: "rock wash", x: x - S / 2, y: y - S / 2, width: S, height: S });
    case "galaxy": return tag("circle", { class: "galaxy", cx: x, cy: y, r: S * 0.15 });
    case "x": return tag("path", { class: "xmark cellx", d: xPath(x, y, S * 0.18) });
    case "dot": return tag("circle", { class: "dotmark", cx: x, cy: y, r: Math.max(2.2, S * 0.075) });
    // Panes' border marks, as the boards draw them (picture.ts: 8 across in a 48 square)
    case "diamond": case "open-diamond": {
      const k = S / 6;
      return tag("path", { class: `diamond ${s.stamp === "diamond" ? "twins" : "opposites"}`, d: `M${f1(x)} ${f1(y - k)}L${f1(x + k)} ${f1(y)}L${f1(x)} ${f1(y + k)}L${f1(x - k)} ${f1(y)}Z` });
    }
    // a symmetry panel's starts and dots take its two lines' colours (blue, yellow); otherwise ink
    case "hoshi": return tag("circle", { class: "panel-dot", cx: x, cy: y, r: Math.max(2.6, S * 0.1), ...lineColor(s.color) });
    case "start": return tag("circle", { class: "panel-start", cx: x, cy: y, r: S * 0.26 }) + tag("path", { class: "panel-enso", d: ensoPath(x, y, S * 0.21), ...lineColor(s.color) });
    case "end": return tag("line", { class: "mark pen panel-end", x1: x, y1: y, x2: x + out.x * S * 0.3, y2: y + out.y * S * 0.3 });
    case "crest": return symbolSvg({ kind: "star", color: s.color ?? "orange" }, x, y, S);
    case "triangle": return symbolSvg({ kind: "triangle", value: s.count ?? 1, color: s.color ?? "orange" }, x, y, S);
    case "shape": return symbolSvg({ kind: "shape", value: s.cells ?? [[0, 0]], color: s.color ?? (s.hollow ? "blue" : "yellow"), negative: !!s.hollow, rotate: !!s.rotate }, x, y, S);
    case "eraser": return symbolSvg({ kind: "eraser", color: s.color }, x, y, S);
  }
}

/** One item of the drawing. */
export function itemSvg(d: Drawing, it: Item): string {
  const g = d.grid, S = squareOf(d), at = (a: Parameters<typeof pointOf>[1]) => pointOf(g, a);
  switch (it.kind) {
    case "pen": return tag("path", { class: `sp-pen ${it.weight}`, d: smoothPath(it.points.map(at)) });
    case "line": { const a = at(it.from), b = at(it.to); return tag("line", { class: `sp-pen ${it.weight}`, x1: a.x, y1: a.y, x2: b.x, y2: b.y }); }
    case "brush": return tag("path", { class: "wash sp-brush", d: smoothPath(it.points.map(at)), style: `stroke:var(--wash-${it.color})` });
    case "wash": { const c = at(it.at); if (onHex(g, it.at)) return tag("polygon", { class: "wash sp-wash", points: hexPoints(c.x, c.y, S), style: `fill:var(--wash-${it.color})` }); return tag("rect", { class: "wash sp-wash", x: c.x - S / 2, y: c.y - S / 2, width: S, height: S, style: `fill:var(--wash-${it.color})` }); }
    case "stamp": {
      const p = at(it.at), out = outward(g, it.at);
      // on a panel's tracks, an end is a short track out of the edge, as the player draws it
      if (it.stamp === "rock" && onHex(g, it.at)) return tag("polygon", { class: "rock wash", points: hexPoints(p.x, p.y, S) });
      if (it.stamp === "end" && g?.tracks) return tag("line", { class: "panel-track", x1: p.x, y1: p.y, x2: p.x + out.x * S * 0.3, y2: p.y + out.y * S * 0.3, style: `stroke-width:${f1(S * 0.25)}` });
      return stampSvg(it, p.x, p.y, S, out);
    }
    case "text": {
      const p = at(it.at), size = textSize(d, it.small);
      return tag("text", { class: `clue sp-text${it.small ? " small" : ""}${onDark(d, it) ? " on-rock" : ""}`, x: p.x, y: p.y + size * 0.06, style: `font-size:${f1(size)}px` }, esc(it.text));
    }
    case "gap": return "";   // the grid leaves it out (gridSvg)
  }
}

/** How big writing is: a board's clue in a board's square (24 in 48), scaled to the grid's; small
 *  writing half that (a board's small clues are 13). */
export const textSize = (d: Drawing, small?: boolean) => squareOf(d) * (small ? 0.25 : 0.5);

/** Whether writing sits on something dark (a shaded square, a black stone), so it's written in the
 *  paper's colour, as the boards write Akari's numbered black squares. */
export function onDark(d: Drawing, it: Extract<Item, { kind: "text" }>): boolean {
  const p = pointOf(d.grid, it.at), S = squareOf(d);
  return d.items.some((o) => {
    if (o.kind !== "stamp") return false;
    if (o.stamp === "rock") { const q = pointOf(d.grid, o.at); return Math.abs(q.x - p.x) < S / 2 && Math.abs(q.y - p.y) < S / 2; }
    if (o.stamp !== "stone" || (o.color ?? "black") !== "black" || o.hidden) return false;
    const q = pointOf(d.grid, o.at);
    return sameAnchor(o.at, it.at) || Math.hypot(q.x - p.x, q.y - p.y) < S * 0.2;
  });
}
