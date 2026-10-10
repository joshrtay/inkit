// The AI creators' icons, keyed by persona handle (./personas.ts): one small mark each, in place of
// the letter-on-colour avatar people get (components/Avatar.tsx). Drawn in a 48-unit box with the
// site's pen weights (docs/style.md: hair 1, fine 1.6, medium 2.6, bold 5.5) and its colour tokens:
// pen ink, sumi, shell, the washes and a seal red. Every mark stands on a ground of its own (paper,
// sumi, a wash), so it reads on the light page and the dark one alike; dark grounds get a faint
// shell rim so their edge doesn't sink into the dark page. CSS variables only work in a `style`,
// so colours are set there, each with its light-mode value as a fallback (for docs/ai-creators-sheet.html).
//
// Plain strings, no site imports: the contact sheet (puzzles/ai/sheet.ts) uses them as they are.

const HAIR = 1, FINE = 1.6, MEDIUM = 2.6, BOLD = 5.5;
const INK = "var(--paper-ink,#26398f)", SUMI = "var(--sumi,#2b2a33)", SHELL = "var(--shell,#efece4)", PAPER = "var(--paper,#fffefa)";
const SEAL = "var(--paper-red,#c4364b)";
const wash = (c: "red" | "yellow" | "blue" | "orange" | "green" | "pink" | "purple") =>
  `var(--wash-${c},${{ red: "#ef5a6a", yellow: "#f7cf3d", blue: "#3fb0e6", orange: "#f29a38", green: "#7cc68f", pink: "#f07ab8", purple: "#a77bd6" }[c]})`;

/** a style attribute: fill, then stroke and its width; lines are round-capped and round-joined */
const s = (fill: string | null, stroke?: string | null, width?: number, extra = "") =>
  `style="fill:${fill ?? "none"};stroke:${stroke ?? "none"}${width ? `;stroke-width:${width}` : ""};stroke-linecap:round;stroke-linejoin:round${extra ? `;${extra}` : ""}"`;
const rim = (shape: string) => shape.replace("/>", ` ${s(null, SHELL, FINE, "stroke-opacity:.5")}/>`);
const hex = (x: number, y: number, r = 9) => {
  const h = r * 0.866;
  return `M${x - r} ${y}L${x - r / 2} ${y - h}L${x + r / 2} ${y - h}L${x + r} ${y}L${x + r / 2} ${y + h}L${x - r / 2} ${y + h}Z`;
};
/** a little pixel picture: one letter per square, a colour per letter */
const pixels = (rows: string[], x0: number, y0: number, cell: number, colors: Record<string, string>) =>
  rows.flatMap((row, r) => [...row].map((ch, c) => (colors[ch] ? `<rect x="${x0 + c * cell + 0.4}" y="${y0 + r * cell + 0.4}" width="${cell - 0.8}" height="${cell - 0.8}" rx="0.8" ${s(colors[ch])}/>` : ""))).join("");

export const PERSONA_ICONS: Record<string, string> = {
  // a panel on a dark door: the start's circle, a line out through the frame's notch, one square
  isola: [
    `<rect x="3" y="3" width="42" height="42" rx="8" ${s(SUMI)}/>`,
    rim(`<rect x="3" y="3" width="42" height="42" rx="8"/>`),
    `<rect x="9" y="9" width="30" height="30" rx="2" ${s(null, SHELL, HAIR, "stroke-opacity:.35")}/>`,
    `<path d="M14 34V24H24V14H34V6" ${s(null, SHELL, BOLD)}/>`,
    `<circle cx="14" cy="34" r="5.5" ${s(SHELL)}/>`,
    `<rect x="27" y="26" width="7.5" height="7.5" rx="1.5" ${s(wash("yellow"))}/>`,
  ].join(""),

  // one black stone where two lines of a board cross
  pebble: [
    `<circle cx="24" cy="24" r="21" ${s(SHELL, SUMI, FINE)}/>`,
    `<path d="M24 8V40M8 24H40" ${s(null, SUMI, HAIR, "stroke-opacity:.5")}/>`,
    `<circle cx="25" cy="25" r="10" ${s(SUMI)}/>`,
    `<path d="M19.5 21.5a7 7 0 0 1 4.5-4" ${s(null, SHELL, FINE, "stroke-opacity:.45")}/>`,
  ].join(""),

  // a hotel key fob with a three-by-three grid on it, one square filled in
  "night-clerk": [
    `<path d="M24 3L42 24L24 45L6 24Z" ${s(wash("red"), SUMI, MEDIUM)}/>`,
    `<circle cx="24" cy="12" r="3" ${s(PAPER, SUMI, FINE)}/>`,
    `<rect x="17" y="20" width="14" height="14" ${s(null, SHELL, FINE)}/>`,
    `<path d="M21.67 20V34M26.33 20V34M17 24.67H31M17 29.33H31" ${s(null, SHELL, HAIR)}/>`,
    `<rect x="17" y="20" width="4.67" height="4.67" ${s(SHELL)}/>`,
  ].join(""),

  // a patchwork of rectangles, as a Shikaku comes out
  "granny-rect": [
    `<rect x="4" y="4" width="40" height="40" rx="5" ${s(PAPER, INK, MEDIUM)}/>`,
    `<rect x="8" y="8" width="15" height="9" rx="1.2" ${s(wash("pink"), INK, FINE)}/>`,
    `<rect x="25.5" y="8" width="14.5" height="19" rx="1.2" ${s(wash("yellow"), INK, FINE)}/>`,
    `<rect x="8" y="19.5" width="7" height="20.5" rx="1.2" ${s(wash("blue"), INK, FINE)}/>`,
    `<rect x="17.5" y="19.5" width="5.5" height="20.5" rx="1.2" ${s(SHELL, INK, FINE)}/>`,
    `<rect x="25.5" y="29.5" width="14.5" height="10.5" rx="1.2" ${s(wash("green"), INK, FINE)}/>`,
  ].join(""),

  // a crescent moon over water
  lumen: [
    `<circle cx="24" cy="24" r="21" ${s(wash("blue"), INK, FINE)}/>`,
    `<circle cx="25" cy="19" r="10" ${s(SHELL)}/>`,
    `<circle cx="29.5" cy="15.5" r="8.6" ${s(wash("blue"))}/>`,
    `<path d="M10 33q4-3 8 0t8 0t8 0t5 0" ${s(null, SHELL, MEDIUM)}/>`,
    `<path d="M16 39q4-3 8 0t8 0" ${s(null, SHELL, MEDIUM, "stroke-opacity:.6")}/>`,
  ].join(""),

  // a signal flag (T: red, white and blue upright stripes)
  "captain-tally": [
    `<path d="M7 9H17.7V39H7a2 2 0 0 1-2-2V11a2 2 0 0 1 2-2Z" ${s(wash("red"))}/>`,
    `<rect x="17.7" y="9" width="12.6" height="30" ${s(SHELL)}/>`,
    `<path d="M30.3 9H41a2 2 0 0 1 2 2V37a2 2 0 0 1-2 2H30.3Z" ${s(wash("blue"))}/>`,
    `<rect x="5" y="9" width="38" height="30" rx="2" ${s(null, SUMI, MEDIUM)}/>`,
  ].join(""),

  // a round window of four panes, twins across the corners
  "bramble-and-burr": [
    `<circle cx="24" cy="24" r="20" ${s(PAPER)}/>`,
    `<path d="M24 24V4A20 20 0 0 0 4 24Z" ${s(wash("green"))}/>`,
    `<path d="M24 24H44A20 20 0 0 0 24 4Z" ${s(wash("purple"))}/>`,
    `<path d="M24 24V44A20 20 0 0 0 44 24Z" ${s(wash("green"))}/>`,
    `<path d="M24 24H4A20 20 0 0 0 24 44Z" ${s(wash("purple"))}/>`,
    `<path d="M24 4V44M4 24H44" ${s(null, INK, MEDIUM)}/>`,
    `<circle cx="24" cy="24" r="20" ${s(null, INK, MEDIUM)}/>`,
  ].join(""),

  // a station clock at 6:52
  "six-fifty-two": [
    `<circle cx="24" cy="24" r="20" ${s(PAPER, INK, MEDIUM)}/>`,
    `<path d="M24 7.5V11M40.5 24H37M24 40.5V37M7.5 24H11" ${s(null, INK, FINE)}/>`,
    `<path d="M24 24L19.6 33" ${s(null, INK, BOLD)}/>`,
    `<path d="M24 24L12.9 14" ${s(null, INK, MEDIUM)}/>`,
    `<path d="M24 24L32 10.1" ${s(null, SEAL, FINE)}/>`,
    `<circle cx="24" cy="24" r="2.4" ${s(SEAL)}/>`,
  ].join(""),

  // a specimen label with an L-tetromino pinned to it
  quillwort: [
    `<rect x="7" y="4" width="34" height="40" rx="3" ${s(PAPER, INK, MEDIUM)}/>`,
    `<rect x="16" y="9" width="7" height="7" ${s(wash("green"), INK, FINE)}/>`,
    `<rect x="16" y="16" width="7" height="7" ${s(wash("green"), INK, FINE)}/>`,
    `<rect x="16" y="23" width="7" height="7" ${s(wash("green"), INK, FINE)}/>`,
    `<rect x="23" y="23" width="7" height="7" ${s(wash("green"), INK, FINE)}/>`,
    `<circle cx="30" cy="12" r="2.4" ${s(SEAL)}/>`,
    `<path d="M13 37H35" ${s(null, INK, HAIR)}/>`,
  ].join(""),

  // a blue and white tile
  ottoline: [
    `<rect x="4" y="4" width="40" height="40" rx="1.5" ${s(SHELL)}/>`,
    `<path d="M4 14A10 10 0 0 0 14 4H4ZM34 4A10 10 0 0 0 44 14V4ZM44 34A10 10 0 0 0 34 44H44ZM14 44A10 10 0 0 0 4 34V44Z" ${s(wash("blue"))}/>`,
    `<path d="M24 11L37 24L24 37L11 24Z" ${s(wash("blue"), INK, FINE)}/>`,
    `<circle cx="24" cy="24" r="4.5" ${s(SHELL, INK, FINE)}/>`,
    `<rect x="4" y="4" width="40" height="40" rx="1.5" ${s(null, INK, MEDIUM)}/>`,
  ].join(""),

  // three cells of a honeycomb
  higgledy: [
    `<path d="${hex(19.5, 18.2)}" ${s(wash("yellow"), INK, MEDIUM)}/>`,
    `<path d="${hex(19.5, 33.8)}" ${s(wash("yellow"), INK, MEDIUM)}/>`,
    `<path d="${hex(33, 26)}" ${s(wash("orange"), INK, MEDIUM)}/>`,
    `<circle cx="33" cy="26" r="2" ${s(INK)}/>`,
  ].join(""),

  // a seal: an E built of rectangles
  ennor: [
    `<rect x="5" y="5" width="38" height="38" rx="4" ${s(SEAL)}/>`,
    `<rect x="8.5" y="8.5" width="31" height="31" rx="2" ${s(null, SHELL, FINE)}/>`,
    `<rect x="14" y="13" width="5.5" height="22" rx="1" ${s(SHELL)}/>`,
    `<rect x="14" y="13" width="20" height="5.5" rx="1" ${s(SHELL)}/>`,
    `<rect x="14" y="21.25" width="14" height="5.5" rx="1" ${s(SHELL)}/>`,
    `<rect x="14" y="29.5" width="20" height="5.5" rx="1" ${s(SHELL)}/>`,
  ].join(""),

  // a tulip in squares, as a nonogram draws it
  "hester-vane": [
    `<rect x="4" y="4" width="40" height="40" rx="5" ${s(PAPER, INK, MEDIUM)}/>`,
    pixels(["p.p.p", "ppppp", ".ppp.", "g.g..", ".gg.."], 9, 9, 6, { p: wash("pink"), g: wash("green") }),
  ].join(""),

  // a plume
  "freddie-plume": [
    `<circle cx="24" cy="24" r="20" ${s(PAPER, INK, MEDIUM)}/>`,
    `<path d="M14 36C15 24 24 13 35 10C33 21 26 31 14 36Z" ${s(wash("purple"), INK, FINE)}/>`,
    `<path d="M22.8 25.6l4.6 1.4M19.6 30.2l4 1" ${s(null, INK, HAIR)}/>`,
    `<path d="M11.5 38.5C18 29 26 19 34.5 10.5" ${s(null, INK, MEDIUM)}/>`,
  ].join(""),

  // a schoolroom slate in its wooden frame: a two-by-two board in chalk, and a chalk arrow
  // pointing at one square
  slate: [
    `<rect x="3" y="5" width="42" height="38" rx="5" ${s(wash("orange"), SUMI, FINE)}/>`,
    `<rect x="8" y="10" width="32" height="28" rx="2" ${s(SUMI)}/>`,
    `<path d="M12 15H26V29H12ZM19 15V29M12 22H26" ${s(null, SHELL, FINE, "stroke-opacity:.8")}/>`,
    `<rect x="20.6" y="23.6" width="3.8" height="3.8" rx="0.8" ${s(SHELL)}/>`,
    `<path d="M36 34L27.5 26.5M27.5 26.5H32.3M27.5 26.5V31.3" ${s(null, SHELL, MEDIUM)}/>`,
  ].join(""),

  // a small screen with a hum on it
  "percival-hum": [
    `<rect x="4" y="6" width="40" height="31" rx="6" ${s(SUMI)}/>`,
    rim(`<rect x="4" y="6" width="40" height="31" rx="6"/>`),
    `<path d="M9.5 21.5c2.5-8 5-8 7.5 0s5 8 7.5 0s5-8 7.5 0s4 6.5 6 0" ${s(null, wash("green"), MEDIUM)}/>`,
    `<path d="M24 37V42M17 42.5H31" ${s(null, "var(--ink,#26398f)", MEDIUM)}/>`,
  ].join(""),
};

/** An AI creator's icon as a whole SVG, or null for anyone else. */
export function personaIcon(handle: string): string | null {
  const body = PERSONA_ICONS[handle];
  return body ? `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${body}</svg>` : null;
}
