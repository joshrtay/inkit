// What the editors can change, checked against everything the engine can express. Each table is
// typed against one of the engine's own lists (GridSpec's fields, clue kinds, rule blocks, style
// options, marks), so the type check fails until a new name has an entry here, and the entry says
// where creators (or admins) edit it.
//
//   ** Whenever the engine gains something, add it to these tables, to the editor that edits it,
//   ** and to the sketch reader (app/lib/read-sketch.server.ts). See docs/grid-engine.md.
import type { RuleName } from "~site/engine/rules.ts";
import type { Given, GridSpec, GridStyle, MarkKind, RuleSpec } from "~site/engine/types.ts";

/** The on-puzzle editor's tools (components/BoardEditor.tsx). */
export type ToolId = "number" | "block" | "wall" | "pearl" | "galaxy" | "thermo" | "door" | "outside-number" | "outside-letter"
  | "corner" | "total" | "area" | "symbol" | "compass" | "diamond" | "palisade" | "erase"
  // Panes: a sign or a number on a border, a watchtower on a corner, the shape bank
  | "inequality" | "difference" | "watchtower" | "bank"
  // panels: the line's start, ends, gaps and dots, then the symbols in the cells
  | "start" | "end" | "gap" | "dot" | "square" | "star" | "triangle" | "shape" | "eraser"
  // Binairo and Colour Balance: a printed color in a square
  | "paint"
  // lattices (Distance Path): dots on the points, and the path's lengths
  | "peg" | "lengths";

/** Every part of a puzzle description, and where it's edited. */
export const SPEC_PARTS: Record<keyof GridSpec, string> = {
  genre: "the puzzle type menu (a re-read as that type)", size: "Rows / Columns (or Size)", givens: "the type's tools on the board",
  rules: "Star Battle's stars; a panel's symmetry; Colour Balance's shares and extra rules; the Rules panel (Panes, and admins)",
  style: "the Look panel (admins); Colour Balance's colors (its shares)", picture: "Picture, and painting (Nonogram)",
  marks: "the Look panel (admins)", geometry: "the puzzle type (hexagons: Hex Hidoku, Missing Number; a lattice: Distance Path)", figure: "the figure editor (Three Coats)", hearts: "the figure editor (Three Coats)", areas: "the Areas tool",
  entries: "the Numbers box in the toolbar (Number Fill-In)",
};

/** Every clue kind and the tool that places it: a BoardEditor tool, Nonogram's own numbers, or
 *  Three Coats' figure editor. */
export const CLUE_TOOLS: Record<Given["kind"], ToolId | "nonogram" | "figure"> = {
  number: "number", block: "block", symbol: "symbol", compass: "compass", palisade: "palisade", wall: "wall", twins: "diamond", opposites: "diamond",
  inequality: "inequality", difference: "difference", watchtower: "watchtower", bank: "bank",
  runs: "nonogram", total: "total", count: "corner", dots: "figure", pearl: "pearl", first: "outside-letter",
  skyscraper: "outside-number", thermo: "thermo", galaxy: "galaxy", door: "door",
  start: "start", end: "end", gap: "gap", hexagon: "dot", square: "square", star: "star", triangle: "triangle", shape: "shape", eraser: "eraser",
  color: "paint",
  peg: "peg", lengths: "lengths",
};

export type Setting =
  | { key: string; label: string; type: "number" }
  | { key: string; label: string; type: "choice"; choices: string[]; /** what no choice means (default: "default") */ none?: string }
  | { key: string; label: string; type: "flag" }
  | { key: string; label: string; type: "pair" }
  /** whole numbers, one or more (line-shares' parts) */
  | { key: string; label: string; type: "list" };

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
  "one-each": { label: "One clue per region (Solitude)", settings: [{ key: "of", label: "of", type: "choice", choices: ["number", "symbol", "any"] }] },
  twins: { label: "◆ joins same shapes", settings: [] },
  opposites: { label: "◇ joins different shapes", settings: [] },
  rectangles: { label: "Every region is a rectangle", settings: [] },
  squares: { label: "Every region is a square", settings: [] },
  "no-four-corners": { label: "Four regions never meet at a point", settings: [{ key: "outline", label: "the outline and holes count (Bricky)", type: "flag" }] },
  "side-clue": { label: "A number is its square's side", settings: [] },
  galaxies: { label: "Regions symmetric about their circles", settings: [] },
  "all-different": { label: "All regions differ in shape", settings: [] },
  compass: { label: "Compasses count their region", settings: [] },
  "neighbors-differ": { label: "Neighbouring regions differ in shape (Mingle Shape)", settings: [] },
  "one-of-each": { label: "One symbol of each color per region (Rose Windows)", settings: [] },
  "cell-borders": { label: "Palisade marks show their square's borders", settings: [] },
  "no-t-junctions": { label: "Borders never meet in a T; the outline counts (Loopy)", settings: [] },
  "no-rectangles": { label: "No region is a rectangle (Non-Boxy)", settings: [] },
  "all-same": { label: "Every region has the same shape (Match)", settings: [] },
  "neighbors-differ-size": { label: "Neighbouring regions differ in size (Size Separation)", settings: [] },
  "shape-bank": { label: "Every region is a shape from the bank (Shape Bank)", settings: [] },
  "region-shape": { label: "A shape in a square is its region's shape (Polyomino)", settings: [] },
  "size-compare": { label: "A < sign points to the smaller region (Inequality)", settings: [] },
  "size-difference": { label: "A number on a border is the regions' size difference (Difference)", settings: [] },
  "regions-at-corner": { label: "A watchtower counts the regions at its corner", settings: [] },
  "corner-count": { label: "Corner numbers count their walls", settings: [] },
  "perfect-maze": { label: "Walls make a maze between two doors", settings: [] },
  painted: { label: "Paint every piece", settings: [] },
  "neighbor-dots": { label: "Dots ask for neighbours of their color", settings: [] },
  "panel-line": { label: "A line from a start circle to an end on the edge", settings: [{ key: "symmetry", label: "two lines, mirrored", type: "choice", choices: ["left-right", "up-down", "turn"], none: "no (one line)" }] },
  "panel-symbols": { label: "The symbols in the cells say where the line goes", settings: [] },
  "number-path": { label: "Numbers 1 to the last, each touching the next (Hidoku)", settings: [{ key: "diagonals", label: "touching at a corner counts (squares)", type: "flag" }] },
  "smallest-missing": { label: "Each number is the smallest its neighbours lack (Missing Number)", settings: [] },
  "distance-path": { label: "One path through the dots, with the listed lengths (Distance Path)", settings: [{ key: "moves", label: "segments run", type: "choice", choices: ["queen", "knight"], none: "any way" }] },
  "color-count": { label: "How many of each color", settings: [{ key: "red", label: "red", type: "number" }, { key: "yellow", label: "yellow", type: "number" }, { key: "blue", label: "blue", type: "number" }] },
  "line-shares": { label: "Each row and column has its share of each color", settings: [{ key: "parts", label: "shares, one per color (1 1 = half and half)", type: "list" }] },
  "no-three-in-a-row": { label: "No three in a row the same color", settings: [] },
  "unique-lines": { label: "No two rows (or columns) painted the same", settings: [] },
  "fill-in": { label: "Every number on the list fits across or down, once", settings: [] },
};

/** What's wrong with a rule's settings: one it doesn't take (a sketch reader's made-up `of: "each"`,
 *  a typo like `ma: 4`), or a value it can't have. Empty when they're all fine. */
export function settingProblems(spec: RuleSpec): string[] {
  const def = (RULES as Record<string, { label: string; settings: Setting[] } | undefined>)[spec.rule];
  if (!def) return [];   // an unknown rule is reported by the engine
  const out: string[] = [];
  const known = def.settings.map((x) => x.key).join(", ");
  for (const [key, v] of Object.entries(spec)) {
    if (key === "rule") continue;
    // color-count also counts palette colors by number (c1, c2...)
    const setting = def.settings.find((x) => x.key === key) ?? (spec.rule === "color-count" && /^c\d+$/.test(key) ? { key, label: key, type: "number" as const } : undefined);
    if (!setting) { out.push(`The rule "${spec.rule}" has no setting "${key}" (${known ? `its settings: ${known}` : "it takes none"}).`); continue; }
    const ok = setting.type === "number" ? typeof v === "number" && Number.isInteger(v) && v >= 0
      : setting.type === "flag" ? typeof v === "boolean"
      : setting.type === "choice" ? setting.choices.includes(v as string)
      : Array.isArray(v) && (setting.type === "list" ? v.length > 0 : v.length === 2) && v.every((x) => Number.isInteger(x) && x > 0);
    if (!ok) out.push(`The rule "${spec.rule}" can't have ${key} ${JSON.stringify(v)} (${setting.type === "choice" ? `one of: ${setting.choices.join(", ")}` : setting.type === "number" ? "a whole number" : setting.type === "flag" ? "true or false" : setting.type === "list" ? "whole numbers" : "two whole numbers"}).`);
  }
  return out;
}

/** Every style option. */
export const STYLE: Record<keyof GridStyle, { label: string; type: "color" | "colors" | "number" | "choice" | "text"; choices?: string[] }> = {
  symbols: { label: "Digits shown as these symbols (e.g. ABC; a fill-in's 0123456789)", type: "text" },
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
  paint: "painting (the palette's colors: Three Coats' pieces, or squares)",
};
