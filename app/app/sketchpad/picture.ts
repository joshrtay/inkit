// A paint drawing as a still picture (docs/creation-flow.md, decision 2): the "Drawn by" thumbnail
// on a game's page, and a draft's card before it has a type. The drawing as drawn (draw.ts, the
// sketchpad's own look), cropped to what's on the page. Pure: no DOM, so the server draws it.
// Wrap it in `.grid-game` (the boards' pen and wash styles).
import { washDefs } from "~site/lib/ink.ts";
import { boxOf } from "./check";
import { gridSvg, itemSvg, penVars } from "./draw";
import * as m from "./model";

/** Where the drawing's ink is on the page: the grid and every item, with a margin; null if blank. */
export function drawingBounds(d: m.Drawing): { x: number; y: number; w: number; h: number } | null {
  const boxes = d.items.filter((it) => it.kind !== "gap").map((it) => boxOf(d, it));
  if (d.grid) { const span = m.gridSpan(d.grid); boxes.push({ x: d.grid.x, y: d.grid.y, w: span.w * d.grid.S, h: span.h * d.grid.S }); }
  if (!boxes.length) return null;
  const x0 = Math.min(...boxes.map((b) => b.x)), y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w)), y1 = Math.max(...boxes.map((b) => b.y + b.h));
  const pad = Math.max(8, m.squareOf(d) * 0.3);
  // square, so thumbnails line up
  const side = Math.max(x1 - x0, y1 - y0) + 2 * pad, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return { x: cx - side / 2, y: cy - side / 2, w: side, h: side };
}

/** The drawing as SVG markup, `label` its accessible name; "" for a blank page. */
export function drawingSvg(d: m.Drawing, label = "The creator's drawing"): string {
  const b = drawingBounds(d);
  if (!b) return "";
  const r = (v: number) => Math.round(v * 10) / 10;
  const wash = washDefs(b.w);
  const vars = Object.entries(penVars(m.squareOf(d))).map(([k, v]) => `${k}:${v}`).join(";");
  const layer = (kinds: m.Item["kind"][]) => d.items.filter((it) => kinds.includes(it.kind)).map((it) => itemSvg(d, it)).join("");
  const gaps = m.gapsOf(d);
  const esc = label.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return `<svg class="sp-drawing" viewBox="${r(b.x)} ${r(b.y)} ${r(b.w)} ${r(b.h)}" role="img" aria-label="${esc}" style="--wash:url(#${wash.id});${vars}">${wash.svg}`
    + `<g class="sp-ink"><g>${layer(m.LAYERS[0])}</g>${d.grid ? gridSvg(d.grid, gaps) : ""}<g>${layer(m.LAYERS[1])}</g><g>${layer(m.LAYERS[2])}</g><g>${layer(m.LAYERS[3])}</g></g></svg>`;
}
