// Drawing two of Panes' cell clues, shared by the player (game.ts) and still pictures
// (picture.ts) as SVG markup: a symbol (a plain ✦, or one washed in its color: Rose Windows'
// roses), and a palisade mark (a small diamond whose inked sides are the cell's borders).
// Styles in styles.css (.clue.symbol, .palisade).
import { PANEL_COLORS } from "./panel-draw.ts";

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
