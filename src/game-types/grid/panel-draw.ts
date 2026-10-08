// Drawing a panel (src/engine/panel.ts), shared by the player (game.ts) and still pictures
// (picture.ts) as SVG markup: the tracks the line can run along (pale wide lines, broken at
// gaps), the start (an ensō) and the ends sticking out of the edge, the dots (hoshi, as on a Go
// board), and the symbols in the cells: stones, crests (kamon), scale triangles (uroko), tiles
// (kumiko) and a brushed eraser. Every colour is a watercolour wash (the .wash class) with a pen
// outline, as docs/style.md says. Styles in styles.css (.panel-*, .stone).
import type { Grid } from "../../engine/geometry.ts";
import type { Board, Puzzle } from "../../engine/types.ts";
import { cellSymbolsOf, endsOf, hexagonsOf, startsOf } from "../../engine/panel.ts";

/** The colours of the symbols, as the site's watercolour tokens (global.css): use them in a
 *  `style` (CSS variables don't work in SVG attributes). Black and white are the stones' sumi
 *  and shell. */
export const PANEL_COLORS: Record<string, string> = {
  black: "var(--sumi)", white: "var(--shell)", red: "var(--wash-red)", orange: "var(--wash-orange)", yellow: "var(--wash-yellow)",
  green: "var(--wash-green)", blue: "var(--wash-blue)", purple: "var(--wash-purple)",
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

/** An ensō, the brushed circle, around (x, y): a stroke that swells and thins, left open. */
export function ensoPath(x: number, y: number, r: number, weight = r * 0.28) {
  const from = (-70 * Math.PI) / 180, sweep = (300 * Math.PI) / 180, n = 28, outer: string[] = [], inner: string[] = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, a = from + sweep * t, w = weight * (0.25 + 0.75 * Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.6);
    outer.push(`${f1(x + (r + w / 2) * Math.cos(a))} ${f1(y + (r + w / 2) * Math.sin(a))}`);
    inner.unshift(`${f1(x + (r - w / 2) * Math.cos(a))} ${f1(y + (r - w / 2) * Math.sin(a))}`);
  }
  return `M${outer.join("L")}L${inner.join("L")}Z`;
}

/** A stone (Go's, and Masyu's pearls): a watercolour disc with a bold pen outline. `color`: a
 *  PANEL_COLORS name; the class names it for the styles. */
export function stoneSvg(color: string, cx: number, cy: number, r: number, cls = "") {
  return tag("g", { class: `stone ${color}${cls ? ` ${cls}` : ""}` },
    tag("circle", { class: "wash", cx: f1(cx), cy: f1(cy), r: f1(r), style: `fill:${PANEL_COLORS[color] ?? PANEL_COLORS.black}` })
    + tag("circle", { class: "stone-line", cx: f1(cx), cy: f1(cy), r: f1(r) }));
}

/** The tracks, gaps, the start's ensō and the ends: under everything else. */
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
  for (const { v, color } of startsOf(p)) {
    const [x, y] = cornerXY(g, fr, v);
    out.push(tag("circle", { class: "panel-start", cx: x, cy: y, r: fr.S * 0.26 }));
    out.push(tag("path", { class: "panel-enso", d: ensoPath(x, y, fr.S * 0.21), ...(color ? { style: `fill:${LINE_COLORS[color]}` } : {}) }));
  }
  return out.join("");
}

/** The ink of the drawn line where it reaches a start (the ensō fills in) or an end (the line
 *  itself is the board's fence marks, drawn by the caller). `colorOf` gives a corner's line
 *  color, with two lines. */
export function panelInk(p: Puzzle, fr: PanelFrame, b: Board, colorOf?: (v: number) => string | undefined): string {
  const g = p.grid, out: string[] = [];
  const on = (v: number) => g.cornerBorders[v].some((e) => b.fence[e] === 1);
  const style = (v: number): A => { const c = colorOf?.(v); return c ? { style: `fill:${LINE_COLORS[c]};stroke:${LINE_COLORS[c]}` } : {}; };
  for (const { v } of startsOf(p)) if (on(v)) { const [x, y] = cornerXY(g, fr, v); out.push(tag("circle", { class: "panel-start ink", cx: x, cy: y, r: fr.S * 0.17, ...style(v) })); }
  for (const v of endsOf(p)) if (on(v) && g.cornerBorders[v].filter((e) => b.fence[e] === 1).length === 1 && !startsOf(p).some((s) => s.v === v)) {
    const [x, y] = cornerXY(g, fr, v), [dx, dy] = outward(g, v), d = fr.S * 0.3;
    out.push(tag("line", { class: "mark pen panel-end", x1: x, y1: y, x2: x + dx * d, y2: y + dy * d, ...style(v) }));
  }
  return out.join("");
}

/** A crest (kamon) of eight rounded petals around (x, y). */
const crest = (x: number, y: number, r: number) => Array.from({ length: 8 }, (_, k) => {
  const a = (k * Math.PI) / 4, pt = (d: number, t: number) => `${f1(x + d * Math.sin(a + t))} ${f1(y - d * Math.cos(a + t))}`;
  return `M${pt(r * 0.12, 0)}C${pt(r * 0.7, 0.62)} ${pt(r * 1.08, 0.36)} ${pt(r, 0)}C${pt(r * 1.08, -0.36)} ${pt(r * 0.7, -0.62)} ${pt(r * 0.12, 0)}Z`;
}).join("");
/** Three brush strokes from (x, y), each swelling then tapering to a point. */
const brushY = (x: number, y: number, r: number) => [-90, 30, 150].map((deg) => {
  const a = (deg * Math.PI) / 180, w = r * 0.2, along = (d: number, side: number) => `${f1(x + d * Math.cos(a) - side * Math.sin(a))} ${f1(y + d * Math.sin(a) + side * Math.cos(a))}`;
  return `M${along(0, 0)}Q${along(r * 0.35, w)} ${along(r, 0)}Q${along(r * 0.35, -w)} ${along(0, 0)}Z`;
}).join("");

/** One cell symbol, drawn around (x, y) in a cell of size S. Exported for the editor's tool buttons. */
/** A Kinship tile (rules.ts tileOf): its shape is a stone, a crest or a triangle, its wash the colour. */
export function tileSvg(tile: { kind: string; color: string }, cx: number, cy: number, S: number): string {
  const kind = tile.kind === "stone" ? "square" : tile.kind === "crest" ? "star" : "triangle";
  return tag("g", { class: `tile ${tile.kind} ${tile.color}` }, symbolSvg({ kind, color: tile.color, value: 1 }, cx, cy, kind === "triangle" ? S * 1.35 : S));
}

export function symbolSvg(x: { kind: string; color?: string; value?: unknown; rotate?: boolean; negative?: boolean }, cx: number, cy: number, S: number): string {
  if (x.kind === "square") return stoneSvg(x.color ?? "black", cx, cy, S * 0.25, "panel-square");
  if (x.kind === "star") {
    const d = crest(cx, cy, S * 0.27);
    return tag("g", { class: `panel-star ${x.color}` }, tag("path", { class: "wash", d, style: `fill:${PANEL_COLORS[x.color ?? "orange"]}` }) + tag("path", { class: "crest-line", d })
      + tag("circle", { class: "crest-eye", cx: f1(cx), cy: f1(cy), r: f1(S * 0.055) }));
  }
  if (x.kind === "triangle") {
    const n = Number(x.value) || 1, w = S * 0.21, h = w * 0.9, gap = S * 0.05, total = n * w + (n - 1) * gap;
    const d = Array.from({ length: n }, (_, k) => { const x0 = cx - total / 2 + k * (w + gap); return `M${f1(x0)} ${f1(cy + h / 2)}L${f1(x0 + w / 2)} ${f1(cy - h / 2)}L${f1(x0 + w)} ${f1(cy + h / 2)}Z`; }).join("");
    return tag("g", { class: "panel-triangle" }, tag("path", { class: "wash", d, style: `fill:${PANEL_COLORS[x.color ?? "orange"]}` }) + tag("path", { class: "symbol-line", d }));
  }
  if (x.kind === "shape") {
    const cells = (x.value as [number, number][]) ?? [];
    const h = Math.max(...cells.map((c) => c[0])) + 1, w = Math.max(...cells.map((c) => c[1])) + 1;
    const u = Math.min(S * 0.2, (S * 0.7) / Math.max(h, w)), pad = u * 0.08;
    const d = cells.map(([r, c]) => { const x0 = cx - (w * u) / 2 + c * u + pad, y0 = cy - (h * u) / 2 + r * u + pad, s = u - 2 * pad; return `M${f1(x0)} ${f1(y0)}h${f1(s)}v${f1(s)}h${f1(-s)}Z`; }).join("");
    const turn: A = x.rotate ? { transform: `rotate(16 ${f1(cx)} ${f1(cy)})` } : {};
    const color = PANEL_COLORS[x.color ?? (x.negative ? "blue" : "yellow")];
    return x.negative
      ? tag("g", { class: "panel-shape negative", ...turn }, tag("path", { class: "symbol-line hollow", d, style: `stroke:${color}` }))
      : tag("g", { class: "panel-shape", ...turn }, tag("path", { class: "wash", d, style: `fill:${color}` }) + tag("path", { class: "symbol-line", d }));
  }
  if (x.kind === "eraser") return tag("path", { class: "panel-eraser", d: brushY(cx, cy, S * 0.24), ...(x.color && x.color !== "white" ? { style: `fill:${PANEL_COLORS[x.color]}` } : {}) });
  return "";
}

/** The dots and the symbols: over the line. */
export function panelSymbols(p: Puzzle, fr: PanelFrame): string {
  const g = p.grid, out: string[] = [];
  for (const h of hexagonsOf(p)) {
    let x: number, y: number;
    if (h.at === "corner") [x, y] = cornerXY(g, fr, h.v);
    else { const [[x1, y1], [x2, y2]] = g.borders[h.e].corners.map((v) => cornerXY(g, fr, v)); x = (x1 + x2) / 2; y = (y1 + y2) / 2; }
    // a hoshi, the star point of a Go board
    out.push(tag("circle", { class: `panel-dot${h.color ? ` ${h.color}` : ""}`, cx: f1(x), cy: f1(y), r: f1(fr.S * 0.1), ...(h.color ? { style: `fill:${LINE_COLORS[h.color]}` } : {}) }));
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
