// Drawing Panes' clues, shared by the player (game.ts) and still pictures (picture.ts) as SVG
// markup: a symbol (a plain ✦, or one washed in its color: Rose Windows' roses), a palisade mark
// (a small diamond whose inked sides are the cell's borders), and paneCluesSvg's: a shape in a cell
// (Polyomino), a < sign or a number on a border (Inequality, Difference), a number on a corner (a
// watchtower), and the shape bank under the board. Styles in styles.css (.clue.symbol, .palisade,
// .border-clue, .bank).
import type { Puzzle } from "../../engine/types.ts";
import { PANEL_COLORS, symbolSvg, type PanelFrame } from "./panel-draw.ts";

type A = Record<string, string | number>;
const tag = (name: string, a: A, body = "") => `<${name}${Object.entries(a).map(([k, v]) => ` ${k}="${String(v).replace(/"/g, "&quot;")}"`).join("")}${body ? `>${body}</${name}>` : "/>"}`;
const f1 = (v: number) => Math.round(v * 10) / 10;

/** A symbol in a cell: ✦, in its color when its value names one. */
export function symbolClueSvg(value: string, x: number, y: number): string {
  const color = PANEL_COLORS[value.trim().toLowerCase()];
  return tag("text", { class: color ? "clue symbol colored" : "clue symbol", x, y: y + 1, ...(color ? { style: `fill:${color}` } : {}) }, "✦");
}

/** A palisade mark: a diamond (a cell's four sides, turned) with `value` of its sides inked:
 *  two side by side at a corner, or two opposite. */
export function palisadeSvg(value: number, opposite: boolean, x: number, y: number, S: number): string {
  const d = S * 0.2;
  const pts = [[x, y - d], [x + d, y], [x, y + d], [x - d, y]];   // top, right, bottom, left corners
  const inked = value === 2 && opposite ? [0, 2] : [0, 1, 2, 3].slice(0, value);
  const side = (k: number) => { const [a, b] = [pts[k], pts[(k + 1) % 4]]; return `M${f1(a[0])} ${f1(a[1])}L${f1(b[0])} ${f1(b[1])}`; };
  const faint = [0, 1, 2, 3].filter((k) => !inked.includes(k));
  return tag("g", { class: "palisade" },
    (faint.length ? tag("path", { class: "palisade-faint", d: faint.map(side).join("") }) : "") +
    (inked.length ? tag("path", { class: "palisade-ink", d: inked.map(side).join("") }) : ""));
}

/** The shape bank's place under the grid: each shape's top-left and the size of its squares, and
 *  the room it takes (0 with no bank). Shapes wrap onto more rows when the board is narrow. */
export function bankLayout(p: Puzzle, S: number) {
  const u = Math.round(S * 0.3), gap = u * 1.5, width = p.grid.cols * S, top = S * 0.45;
  const items: { x: number; y: number; u: number; cells: [number, number][] }[] = [];
  let x = 0, y = top, rowH = 0;
  for (const cells of p.bank) {
    const h = Math.max(...cells.map((c) => c[0])) + 1, w = Math.max(...cells.map((c) => c[1])) + 1;
    if (x > 0 && x + w * u > width) { x = 0; y += rowH + gap; rowH = 0; }
    items.push({ x, y, u, cells });
    x += w * u + gap; rowH = Math.max(rowH, h * u);
  }
  return { items, height: p.bank.length ? y + rowH + S * 0.35 : 0 };
}

/** The Panes clues drawn here rather than by the player itself: shapes in cells, signs and numbers
 *  on borders, watchtowers on corners, and the shape bank under the grid. */
export function paneCluesSvg(p: Puzzle, { S, X, Y }: PanelFrame): string {
  const g = p.grid, out: string[] = [];
  for (const [i, gs] of p.cellGivens) for (const giv of gs) {
    if (giv.kind !== "shape" || p.rules.some((r) => r.rule === "panel-symbols")) continue;   // a panel draws its own
    const [r, c] = g.rc(i);
    out.push(symbolSvg({ kind: "shape", value: giv.value }, X(c) + S / 2, Y(r) + S / 2, S));
  }
  for (const [e, gs] of p.borderGivens) for (const giv of gs) {
    if (giv.at !== "border" || (giv.kind !== "inequality" && giv.kind !== "difference")) continue;
    const [[r0, c0], [r1, c1]] = giv.cells, bd = g.borders[e];
    const [x0, y0] = [X(g.cornerRC(bd.corners[0])[1]), Y(g.cornerRC(bd.corners[0])[0])], [x1, y1] = [X(g.cornerRC(bd.corners[1])[1]), Y(g.cornerRC(bd.corners[1])[0])];
    const x = (x0 + x1) / 2, y = (y0 + y1) / 2, rad = S * 0.21;
    let body = tag("circle", { cx: f1(x), cy: f1(y), r: f1(rad) });
    if (giv.kind === "difference") body += tag("text", { class: "clue small", x: f1(x), y: f1(y + 1) }, String(giv.value));
    else {
      // the sign's point is toward the smaller region (cells[0])
      const dx = Math.sign(c0 - c1), dy = Math.sign(r0 - r1), d = rad * 0.5;
      const tip = [x + dx * d, y + dy * d], back = [x - dx * d, y - dy * d];
      body += tag("path", { d: `M${f1(back[0] - dy * d)} ${f1(back[1] - dx * d)}L${f1(tip[0])} ${f1(tip[1])}L${f1(back[0] + dy * d)} ${f1(back[1] + dx * d)}` });
    }
    out.push(tag("g", { class: `border-clue ${giv.kind}` }, body));
  }
  for (const [v, gs] of p.cornerGivens) for (const giv of gs) {
    if (giv.kind !== "watchtower") continue;
    const [r, c] = g.cornerRC(v), x = X(c), y = Y(r);
    out.push(tag("g", { class: "num watchtower" }, tag("circle", { cx: x, cy: y, r: 12 }) + tag("text", { x, y: y + 1 }, String(giv.value))));
  }
  const bank = bankLayout(p, S);
  if (bank.items.length) {
    const top = Y(g.rows);
    out.push(tag("g", { class: "bank" }, bank.items.map(({ x, y, u, cells }) => {
      const pad = u * 0.08, d = cells.map(([r, c]) => `M${f1(X(0) + x + c * u + pad)} ${f1(top + y + r * u + pad)}h${f1(u - 2 * pad)}v${f1(u - 2 * pad)}h${f1(-(u - 2 * pad))}Z`).join("");
      return tag("g", { class: "panel-shape" }, tag("path", { class: "wash", d, style: `fill:${PANEL_COLORS.yellow}` }) + tag("path", { class: "symbol-line", d }));
    }).join("")));
  }
  return out.join("");
}
