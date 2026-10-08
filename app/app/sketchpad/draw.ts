// The sketchpad's drawing (model.ts) as SVG markup, in the boards' own look (docs/style.md): the
// grid in pen like a board's, washes in watercolour, and every stamp drawn by the same functions
// the player uses (panel-draw.ts), so a stone here is the stone a player sees. The classes are
// styles.css's (under .grid-game) and sketchpad.css's (.sp-*).
import { ensoPath, LINE_COLORS, stoneSvg, symbolSvg } from "~site/game-types/grid/panel-draw.ts";
import { outward, pointOf, squareOf, type Drawing, type Grid, type Item, type XY, smoothPath } from "./model";

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

/** The grid in pen: faint lines inside a medium frame. */
export function gridSvg(g: Grid): string {
  const { x, y, S, rows, cols } = g, W = cols * S, H = rows * S;
  let lines = "";
  for (let r = 1; r < rows; r++) lines += tag("line", { class: "gridline", x1: x, y1: y + r * S, x2: x + W, y2: y + r * S });
  for (let c = 1; c < cols; c++) lines += tag("line", { class: "gridline", x1: x + c * S, y1: y, x2: x + c * S, y2: y + H });
  return lines + tag("rect", { class: "frame", x, y, width: W, height: H });
}

const lineColor = (c?: string): A => (c && LINE_COLORS[c] ? { style: `fill:${LINE_COLORS[c]}` } : {});

/** One stamp, around (x, y), sized to a square of `S`. Also draws the toolbar's buttons. */
export function stampSvg(s: Pick<Extract<Item, { kind: "stamp" }>, "stamp" | "color" | "count" | "cells">, x: number, y: number, S: number, out: XY = { x: 0, y: -1 }): string {
  switch (s.stamp) {
    case "stone": return stoneSvg(s.color ?? "black", x, y, S * 0.28, "pearl");   // Masyu's pearls are stones this size
    case "star": return tag("path", { class: "star", d: starPath(x, y, S * 0.36) });
    case "rock": return tag("rect", { class: "rock wash", x: x - S / 2, y: y - S / 2, width: S, height: S });
    case "galaxy": return tag("circle", { class: "galaxy", cx: x, cy: y, r: S * 0.15 });
    case "x": return tag("path", { class: "xmark cellx", d: xPath(x, y, S * 0.18) });
    case "dot": return tag("circle", { class: "dotmark", cx: x, cy: y, r: S * 0.075 });
    // a symmetry panel's starts and dots take its two lines' colours (blue, yellow); otherwise ink
    case "hoshi": return tag("circle", { class: "panel-dot", cx: x, cy: y, r: S * 0.1, ...lineColor(s.color) });
    case "start": return tag("circle", { class: "panel-start", cx: x, cy: y, r: S * 0.26 }) + tag("path", { class: "panel-enso", d: ensoPath(x, y, S * 0.21), ...lineColor(s.color) });
    case "end": return tag("line", { class: "mark pen panel-end", x1: x, y1: y, x2: x + out.x * S * 0.3, y2: y + out.y * S * 0.3 });
    case "crest": return symbolSvg({ kind: "star", color: s.color ?? "orange" }, x, y, S);
    case "triangle": return symbolSvg({ kind: "triangle", value: s.count ?? 1, color: s.color ?? "orange" }, x, y, S);
    case "shape": return symbolSvg({ kind: "shape", value: s.cells ?? [[0, 0]], color: s.color ?? "yellow" }, x, y, S);
    case "eraser": return symbolSvg({ kind: "eraser" }, x, y, S);
  }
}

/** One item of the drawing. */
export function itemSvg(d: Drawing, it: Item): string {
  const g = d.grid, S = squareOf(d), at = (a: Parameters<typeof pointOf>[1]) => pointOf(g, a);
  switch (it.kind) {
    case "pen": return tag("path", { class: `sp-pen ${it.weight}`, d: smoothPath(it.points.map(at)) });
    case "line": { const a = at(it.from), b = at(it.to); return tag("line", { class: `sp-pen ${it.weight}`, x1: a.x, y1: a.y, x2: b.x, y2: b.y }); }
    case "brush": return tag("path", { class: "wash sp-brush", d: smoothPath(it.points.map(at)), style: `stroke:var(--wash-${it.color})` });
    case "wash": { const c = at(it.at); return tag("rect", { class: "wash sp-wash", x: c.x - S / 2, y: c.y - S / 2, width: S, height: S, style: `fill:var(--wash-${it.color})` }); }
    case "stamp": { const p = at(it.at); return stampSvg(it, p.x, p.y, S, outward(g, it.at)); }
    case "text": { const p = at(it.at); return tag("text", { class: "clue sp-text", x: p.x, y: p.y + S * 0.03, style: `font-size:${f1(textSize(d))}px` }, esc(it.text)); }
  }
}

/** How big writing is: a board's clue in a board's square (24 in 48), scaled to the grid's. */
export const textSize = (d: Drawing) => squareOf(d) * 0.5;
