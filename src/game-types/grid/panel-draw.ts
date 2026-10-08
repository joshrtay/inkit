// Drawing a panel (src/engine/panel.ts), shared by the player (game.ts) and still pictures
// (picture.ts) as SVG markup: the tracks the line can run along (pale wide lines, broken at
// gaps), the start circles and the ends sticking out of the edge, the dots, and the symbols in
// the cells. Styles in styles.css (.panel-*).
import type { Grid } from "../../engine/geometry.ts";
import type { Board, Puzzle } from "../../engine/types.ts";
import { cellSymbolsOf, endsOf, hexagonsOf, startsOf } from "../../engine/panel.ts";

/** The colors of squares and stars, and of a symmetry panel's two lines. */
export const PANEL_COLORS: Record<string, string> = {
  black: "#2b2a33", white: "#ffffff", red: "#e2475a", orange: "#f2913a", yellow: "#f2c23a", green: "#4fae6a", blue: "#3f8fe0", purple: "#9b6bd6",
};
export const LINE_COLORS: Record<string, string> = { blue: "#3f8fe0", yellow: "#e8b21f" };

type A = Record<string, string | number>;
const tag = (name: string, a: A, body = "") => `<${name}${Object.entries(a).map(([k, v]) => ` ${k}="${String(v).replace(/"/g, "&quot;")}"`).join("")}${body ? `>${body}</${name}>` : "/>"}`;
const f1 = (v: number) => Math.round(v * 10) / 10;

export interface PanelFrame { S: number; X: (c: number) => number; Y: (r: number) => number }

const cornerXY = (g: Grid, { X, Y }: PanelFrame, v: number): [number, number] => { const [r, c] = g.cornerRC(v); return [X(c), Y(r)]; };
/** Which way an end sticks out: away from the grid, from its corner. */
function outward(g: Grid, v: number): [number, number] {
  const [r, c] = g.cornerRC(v);
  if (r === 0) return [0, -1];
  if (r === g.rows) return [0, 1];
  if (c === 0) return [-1, 0];
  return [1, 0];
}

/** The tracks, gaps, start circles and ends: under everything else. */
export function panelTracks(p: Puzzle, fr: PanelFrame): string {
  const g = p.grid, out: string[] = [];
  for (const e of g.borders) {
    const [[x1, y1], [x2, y2]] = e.corners.map((v) => cornerXY(g, fr, v));
    if (p.gaps.has(e.id)) {
      // a break in the middle
      const k = 0.36;
      out.push(tag("line", { class: "panel-track", x1, y1, x2: f1(x1 + (x2 - x1) * k), y2: f1(y1 + (y2 - y1) * k) }));
      out.push(tag("line", { class: "panel-track", x1: f1(x2 - (x2 - x1) * k), y1: f1(y2 - (y2 - y1) * k), x2, y2 }));
    } else out.push(tag("line", { class: "panel-track", x1, y1, x2, y2 }));
  }
  for (const v of endsOf(p)) {
    const [x, y] = cornerXY(g, fr, v), [dx, dy] = outward(g, v), d = fr.S * 0.3;
    out.push(tag("line", { class: "panel-track end", x1: x, y1: y, x2: x + dx * d, y2: y + dy * d }));
  }
  for (const { v } of startsOf(p)) { const [x, y] = cornerXY(g, fr, v); out.push(tag("circle", { class: "panel-start", cx: x, cy: y, r: fr.S * 0.24 })); }
  return out.join("");
}

/** The ink of the drawn line where it reaches a start or an end (the line itself is the board's
 *  fence marks, drawn by the caller). `colorOf` gives a corner's line color, with two lines. */
export function panelInk(p: Puzzle, fr: PanelFrame, b: Board, colorOf?: (v: number) => string | undefined): string {
  const g = p.grid, out: string[] = [];
  const on = (v: number) => g.cornerBorders[v].some((e) => b.fence[e] === 1);
  const style = (v: number): A => { const c = colorOf?.(v); return c ? { style: `fill:${LINE_COLORS[c]};stroke:${LINE_COLORS[c]}` } : {}; };
  for (const { v } of startsOf(p)) if (on(v)) { const [x, y] = cornerXY(g, fr, v); out.push(tag("circle", { class: "panel-start ink", cx: x, cy: y, r: fr.S * 0.24, ...style(v) })); }
  for (const v of endsOf(p)) if (on(v) && g.cornerBorders[v].filter((e) => b.fence[e] === 1).length === 1 && !startsOf(p).some((s) => s.v === v)) {
    const [x, y] = cornerXY(g, fr, v), [dx, dy] = outward(g, v), d = fr.S * 0.3;
    out.push(tag("line", { class: "mark pen panel-end", x1: x, y1: y, x2: x + dx * d, y2: y + dy * d, ...style(v) }));
  }
  return out.join("");
}

/** A hexagon around (x, y). */
const hexagon = (x: number, y: number, r: number) =>
  Array.from({ length: 6 }, (_, k) => { const a = (Math.PI / 3) * k; return `${k ? "L" : "M"}${f1(x + r * Math.cos(a))} ${f1(y + r * Math.sin(a))}`; }).join("") + "Z";
/** An eight-pointed star (two squares, one turned) around (x, y). */
const star8 = (x: number, y: number, r: number) =>
  Array.from({ length: 16 }, (_, k) => { const a = -Math.PI / 2 + (k * Math.PI) / 8, d = k % 2 ? r * 0.72 : r; return `${k ? "L" : "M"}${f1(x + d * Math.cos(a))} ${f1(y + d * Math.sin(a))}`; }).join("") + "Z";

/** One cell symbol, drawn around (x, y) in a cell of size S. Exported for the editor's tool buttons. */
export function symbolSvg(x: { kind: string; color?: string; value?: unknown; rotate?: boolean; negative?: boolean }, cx: number, cy: number, S: number): string {
  if (x.kind === "square") {
    const d = S * 0.38;
    return tag("rect", { class: `panel-square ${x.color}`, x: f1(cx - d / 2), y: f1(cy - d / 2), width: f1(d), height: f1(d), rx: f1(d * 0.28), fill: PANEL_COLORS[x.color ?? "black"] });
  }
  if (x.kind === "star") return tag("path", { class: `panel-star ${x.color}`, d: star8(cx, cy, S * 0.25), fill: PANEL_COLORS[x.color ?? "orange"] });
  if (x.kind === "triangle") {
    const n = Number(x.value) || 1, w = S * 0.2, h = w * 0.88, gap = S * 0.06, total = n * w + (n - 1) * gap;
    return Array.from({ length: n }, (_, k) => {
      const x0 = cx - total / 2 + k * (w + gap);
      return tag("path", { class: "panel-triangle", ...(x.color ? { style: `fill:${PANEL_COLORS[x.color]}` } : {}), d: `M${f1(x0)} ${f1(cy + h / 2)}L${f1(x0 + w / 2)} ${f1(cy - h / 2)}L${f1(x0 + w)} ${f1(cy + h / 2)}Z` });
    }).join("");
  }
  if (x.kind === "shape") {
    const cells = (x.value as [number, number][]) ?? [];
    const h = Math.max(...cells.map((c) => c[0])) + 1, w = Math.max(...cells.map((c) => c[1])) + 1;
    const u = Math.min(S * 0.2, (S * 0.7) / Math.max(h, w)), pad = u * 0.1;
    const blocks = cells.map(([r, c]) => tag("rect", { x: f1(cx - (w * u) / 2 + c * u + pad), y: f1(cy - (h * u) / 2 + r * u + pad), width: f1(u - 2 * pad), height: f1(u - 2 * pad), rx: f1(u * 0.12) })).join("");
    const tint: A = x.color ? { style: `--shape:${PANEL_COLORS[x.color]}` } : {};
    return tag("g", { class: `panel-shape${x.negative ? " negative" : ""}`, ...tint, ...(x.rotate ? { transform: `rotate(16 ${f1(cx)} ${f1(cy)})` } : {}) }, blocks);
  }
  if (x.kind === "eraser") {
    const r = S * 0.2, arm = (deg: number) => { const a = (deg * Math.PI) / 180; return `M${f1(cx)} ${f1(cy)}L${f1(cx + r * Math.cos(a))} ${f1(cy + r * Math.sin(a))}`; };
    return tag("path", { class: "panel-eraser", ...(x.color && x.color !== "white" ? { style: `stroke:${PANEL_COLORS[x.color]}` } : {}), d: arm(-90) + arm(30) + arm(150) });
  }
  return "";
}

/** The dots and the symbols: over the line. */
export function panelSymbols(p: Puzzle, fr: PanelFrame): string {
  const g = p.grid, out: string[] = [];
  for (const h of hexagonsOf(p)) {
    let x: number, y: number;
    if (h.at === "corner") [x, y] = cornerXY(g, fr, h.v);
    else { const [[x1, y1], [x2, y2]] = g.borders[h.e].corners.map((v) => cornerXY(g, fr, v)); x = (x1 + x2) / 2; y = (y1 + y2) / 2; }
    out.push(tag("path", { class: `panel-dot${h.color ? ` ${h.color}` : ""}`, d: hexagon(x, y, fr.S * 0.11), ...(h.color ? { style: `fill:${LINE_COLORS[h.color]}` } : {}) }));
  }
  for (const { i, x } of cellSymbolsOf(p)) {
    const [r, c] = g.rc(i);
    out.push(symbolSvg(x, fr.X(c) + fr.S / 2, fr.Y(r) + fr.S / 2, fr.S));
  }
  return out.join("");
}

/** Which line each corner is on (the color of the start it runs from), for a two-line panel. */
export function lineColors(p: Puzzle, b: Board): (v: number) => string | undefined {
  const g = p.grid, color = new Map<number, string>();
  for (const s of startsOf(p)) {
    if (!s.color) continue;
    const stack = [s.v]; color.set(s.v, s.color);
    while (stack.length) {
      const u = stack.pop()!;
      for (const e of g.cornerBorders[u]) if (b.fence[e] === 1) for (const w of g.borders[e].corners) if (!color.has(w)) { color.set(w, s.color); stack.push(w); }
    }
  }
  return (v) => color.get(v);
}
