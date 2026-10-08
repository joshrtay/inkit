// What the editors can change, checked against everything the engine can express. Each table is
// typed against one of the engine's own lists (GridSpec's fields, clue kinds, rule blocks, style
// options, marks), so the type check fails until a new name has an entry here, and the entry says
// where creators (or admins) edit it.
//
//   ** Whenever the engine gains something, add it to these tables, to the editor that edits it,
//   ** and to the sketch reader (app/lib/read-sketch.server.ts). See docs/grid-engine.md.
import type { RuleName } from "~site/engine/rules.ts";
import type { Given, GridSpec, GridStyle, MarkKind } from "~site/engine/types.ts";

/** The on-puzzle editor's tools (components/BoardEditor.tsx). */
export type ToolId = "number" | "block" | "wall" | "pearl" | "galaxy" | "thermo" | "door" | "outside-number" | "outside-letter"
  | "corner" | "total" | "area" | "symbol" | "compass" | "diamond" | "erase"
  // panels: the line's start, ends, gaps and dots, then the symbols in the cells
  | "start" | "end" | "gap" | "dot" | "square" | "star" | "triangle" | "shape" | "eraser";

/** Every part of a puzzle description, and where it's edited. */
export const SPEC_PARTS: Record<keyof GridSpec, string> = {
  genre: "the puzzle type menu (a re-read as that type)", size: "Rows / Columns (or Size)", givens: "the type's tools on the board",
  rules: "Star Battle's stars; a panel's symmetry; the Rules panel (Panes, and admins)", style: "the Look panel (admins)", picture: "Picture, and painting (Nonogram)",
  marks: "the Look panel (admins)", figure: "the figure editor (Three Coats)", hearts: "the figure editor (Three Coats)", areas: "the Areas tool",
};

/** Every clue kind and the tool that places it: a BoardEditor tool, Nonogram's own numbers, or
 *  Three Coats' figure editor. */
export const CLUE_TOOLS: Record<Given["kind"], ToolId | "nonogram" | "figure"> = {
  number: "number", block: "block", symbol: "symbol", compass: "compass", wall: "wall", twins: "diamond", opposites: "diamond",
  runs: "nonogram", total: "total", count: "corner", dots: "figure", pearl: "pearl", first: "outside-letter",
  skyscraper: "outside-number", thermo: "thermo", galaxy: "galaxy", door: "door",
  start: "start", end: "end", gap: "gap", hexagon: "dot", square: "square", star: "star", triangle: "triangle", shape: "shape", eraser: "eraser",
};

export type Setting =
  | { key: string; label: string; type: "number" }
  | { key: string; label: string; type: "choice"; choices: string[]; /** what no choice means (default: "default") */ none?: string }
  | { key: string; label: string; type: "flag" }
  | { key: string; label: string; type: "pair" };

/** Every rule block, in plain words, with every setting it takes. */
export const RULES: Record<RuleName, { label: string; settings: Setting[] }> = {
  loop: { label: "One loop", settings: [{ key: "of", label: "drawn", type: "choice", choices: ["fence", "loop"] }, { key: "cover", label: "through every open cell", type: "flag" }] },
  path: { label: "One path from the way in to the way out", settings: [{ key: "cover", label: "through every open cell", type: "flag" }] },
  links: { label: "Join matching numbers with lines", settings: [{ key: "cover", label: "every cell used", type: "flag" }] },
  pearls: { label: "Pearls: straight through white, turn on black", settings: [] },
  sides: { label: "Numbers count the loop's sides", settings: [] },
  runs: { label: "Row and column clue numbers", settings: [] },
  latin: { label: "Each digit once per row and column", settings: [] },
  boxes: { label: "Each digit once per box", settings: [{ key: "box", label: "box rows × columns", type: "pair" }] },
  "shaded-per-line": { label: "Shaded (stars) per row and column", settings: [{ key: "n", label: "how many", type: "number" }] },
  "shaded-per-area": { label: "Shaded (stars) per outlined area", settings: [{ key: "n", label: "how many", type: "number" }] },
  "no-touch": { label: "Shaded cells (stars) never touch, even diagonally", settings: [] },
  lit: { label: "Bulbs light every white cell, never each other", settings: [] },
  "adjacent-count": { label: "Numbers count the shaded cells (bulbs) beside them", settings: [] },
  "unshaded-connected": { label: "White cells connect", settings: [] },
  "shaded-to-edge": { label: "Every shaded group reaches the edge", settings: [] },
  sight: { label: "Numbers count the white cells they see", settings: [] },
  water: { label: "Shaded cells are water that settles in its tank", settings: [] },
  "line-totals": { label: "Numbers count shaded cells per row / column", settings: [] },
  bars: { label: "Shaded cells are straight blocks", settings: [{ key: "length", label: "block length", type: "number" }] },
  "no-adjacent": { label: "Shaded cells never share a side", settings: [] },
  "unique-unshaded": { label: "Unshaded numbers differ in each row and column", settings: [] },
  "mine-count": { label: "Numbers count mines around them (diagonals too)", settings: [] },
  letters: { label: "Each letter once per row and column (some cells empty)", settings: [{ key: "count", label: "how many letters", type: "number" }] },
  "first-seen": { label: "Letters outside are the first seen", settings: [] },
  skyscrapers: { label: "Numbers outside count buildings seen", settings: [] },
  thermo: { label: "Digits rise along thermometers", settings: [] },
  connected: { label: "Shaded cells connect", settings: [] },
  "no-pool": { label: "No 2×2 shaded block", settings: [] },
  size: { label: "Region size", settings: [{ key: "is", label: "exactly", type: "number" }, { key: "min", label: "at least", type: "number" }, { key: "max", label: "at most", type: "number" }] },
  "size-clue": { label: "A number is its region's size", settings: [] },
  "one-each": { label: "One clue per region", settings: [{ key: "of", label: "of", type: "choice", choices: ["number", "symbol"] }] },
  twins: { label: "◆ joins same shapes", settings: [] },
  opposites: { label: "◇ joins different shapes", settings: [] },
  rectangles: { label: "Every region is a rectangle", settings: [] },
  squares: { label: "Every region is a square", settings: [] },
  "no-four-corners": { label: "Four regions never meet at a point", settings: [] },
  "side-clue": { label: "A number is its square's side", settings: [] },
  galaxies: { label: "Regions symmetric about their circles", settings: [] },
  "all-different": { label: "All regions differ in shape", settings: [] },
  compass: { label: "Compasses count their region", settings: [] },
  "corner-count": { label: "Corner numbers count their walls", settings: [] },
  "perfect-maze": { label: "Walls make a maze between two doors", settings: [] },
  painted: { label: "Paint every piece", settings: [] },
  "neighbor-dots": { label: "Dots ask for neighbours of their color", settings: [] },
  "panel-line": { label: "A line from a start circle to an end on the edge", settings: [{ key: "symmetry", label: "two lines, mirrored", type: "choice", choices: ["left-right", "up-down", "turn"], none: "no (one line)" }] },
  "panel-symbols": { label: "The symbols in the cells say where the line goes", settings: [] },
  "color-count": { label: "How many of each color", settings: [{ key: "red", label: "red", type: "number" }, { key: "yellow", label: "yellow", type: "number" }, { key: "blue", label: "blue", type: "number" }] },
};

/** Every style option. */
export const STYLE: Record<keyof GridStyle, { label: string; type: "color" | "colors" | "number" | "choice" | "text"; choices?: string[] }> = {
  symbols: { label: "Digits shown as letters (e.g. ABC)", type: "text" },
  ink: { label: "Ink", type: "color" },
  wash: { label: "Shading / loop color", type: "color" },
  grid: { label: "Grid", type: "choice", choices: ["lines", "dots"] },
  major: { label: "Heavy line every", type: "number" },
  empty: { label: "Known-empty mark", type: "choice", choices: ["dot", "x"] },
  shaded: { label: "Shaded cells look like", type: "choice", choices: ["wash", "star", "bulb", "water", "mine"] },
  palette: { label: "Region colors", type: "colors" },
};

/** Every kind of mark a player can put down (a genre picks its own; Look can override). */
export const MARKS: Record<MarkKind, string> = {
  fence: "lines along cell edges", loop: "lines through cell centers", shade: "shading", regions: "regions", digit: "digits",
  paint: "painting (red, yellow, blue)",
};
