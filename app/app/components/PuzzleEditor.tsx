// The visual puzzle editor: everything a grid puzzle (src/engine) can contain, edited by clicking
// instead of typing. It is the only way creators change a puzzle, so it must stay complete:
//
//   ** Whenever the engine gains something (a genre, a clue kind, a rule block or setting, a style
//   ** option, a mark), add it here too. The tables below are typed against the engine's own lists
//   ** (GenreName, Given["kind"], RuleName, keyof GridStyle, MarkKind, keyof GridSpec), so the build
//   ** fails until every new name has an entry. (See docs/grid-engine.md, "The visual editor".)
import { useState } from "react";
import { genres, type GenreName } from "~site/engine/puzzle.ts";
import { runsOf, type RuleName } from "~site/engine/rules.ts";
import type { Given, GridSpec, GridStyle, MarkKind, RuleSpec, Side } from "~site/engine/types.ts";
import { KIND_NAMES } from "~/games/kinds";
import { FigureEditor, squaresFigure } from "./FigureEditor";

type RC = [number, number];
type ClueKind = Given["kind"];

// ---- coverage tables (one entry for every name the engine knows) ----

/** Every part of a puzzle description, and where this editor edits it. */
export const SPEC_PARTS: Record<keyof GridSpec, string> = {
  genre: "the game type menu", size: "Rows / Columns", givens: "the clue tools", rules: "Rules",
  style: "Look", picture: "the picture painter (Nonogram)", marks: "Look › what the player draws",
  figure: "the figure editor (Three Coats)", hearts: "Hearts (paint puzzles)", areas: "the area painter",
};

/** Every clue kind: its tool label, and whether it sits in a cell, on a border, beside a line, on a
 *  corner, or in the outside edge. */
const CLUES: Record<ClueKind, { label: string; on: "cell" | "border" | "line" | "corner" | "edge" | "cells" | "point" }> = {
  number: { label: "Number", on: "cell" },
  block: { label: "Rock", on: "cell" },
  symbol: { label: "Symbol", on: "cell" },
  compass: { label: "Compass", on: "cell" },
  wall: { label: "Wall", on: "border" },
  twins: { label: "◆ Same shape", on: "border" },
  opposites: { label: "◇ Different shape", on: "border" },
  runs: { label: "Clue numbers", on: "line" },
  total: { label: "Row / column totals", on: "line" },
  count: { label: "Corner number", on: "corner" },
  dots: { label: "Paint dots", on: "cell" },
  pearl: { label: "Pearl", on: "cell" },
  first: { label: "Letter outside", on: "edge" },
  skyscraper: { label: "Number outside", on: "edge" },
  thermo: { label: "Thermometer", on: "cells" },
  galaxy: { label: "Galaxy circle", on: "point" },
  door: { label: "Door", on: "edge" },
};

/** The clue tools each genre shows first (every other clue kind is under "More clues"). */
const GENRE_CLUES: Record<GenreName, ClueKind[]> = {
  slitherlink: ["number"],
  nurikabe: ["number"],
  "simple-loop": ["block", "wall"],
  "simple-path": ["door", "block", "wall"],
  "star-battle": [],
  akari: ["block", "number"],
  numberlink: ["number"],
  cave: ["number"],
  "square-jam": ["number"],
  "wittgenstein-briquet": ["number"],
  hitori: ["number"],
  minesweeper: ["number"],
  "spiral-galaxies": ["galaxy"],
  "thermo-sudoku": ["number", "thermo"],
  skyscrapers: ["skyscraper", "number"],
  "easy-as-abc": ["first"],
  aquarium: ["total"],
  masyu: ["pearl"],
  shikaku: ["number"],
  "irregular-sudoku": ["number"],
  nonogram: ["runs"],
  sudoku: ["number"],
  panes: ["number", "symbol", "compass", "twins", "opposites", "block"],
  maze: ["count", "door", "wall"],
  coats: ["dots"],
};

type Setting =
  | { key: string; label: string; type: "number" }
  | { key: string; label: string; type: "choice"; choices: string[] }
  | { key: string; label: string; type: "flag" }
  | { key: string; label: string; type: "pair" };

/** Every rule block, in plain words, with every setting it takes. */
const RULES: Record<RuleName, { label: string; settings: Setting[] }> = {
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
  "color-count": { label: "How many of each color", settings: [{ key: "red", label: "red", type: "number" }, { key: "yellow", label: "yellow", type: "number" }, { key: "blue", label: "blue", type: "number" }] },
};

/** Every style option. */
const STYLE: Record<keyof GridStyle, { label: string; type: "color" | "colors" | "number" | "choice" | "text"; choices?: string[] }> = {
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
const MARKS: Record<MarkKind, string> = {
  fence: "lines along cell edges", loop: "lines through cell centers", shade: "shading", regions: "regions", digit: "digits",
  paint: "painting (red, yellow, blue)",
};

const LETTERS = "abcdefghijklmnopqrstuvwxyz";
/** A pale tint per area letter, so neighbouring areas are easy to tell apart. */
const areaColor = (k: string) => `hsl(${(LETTERS.indexOf(k.toLowerCase()) * 137) % 360} 70% 90%)`;
const S = 44, PAD = 24;
const same = (a: RC, b: RC) => a[0] === b[0] && a[1] === b[1];
const onBorder = (g: Given, a: RC, b: RC) => g.at === "border" && ((same(g.cells[0], a) && same(g.cells[1], b)) || (same(g.cells[0], b) && same(g.cells[1], a)));
const runsText = (v: number[] | undefined) => (v ?? [0]).join(" ");
const onEdge = ([r, c]: RC, side: Side, rows: number, cols: number) =>
  side === "top" ? r === 0 : side === "bottom" ? r === rows - 1 : side === "left" ? c === 0 : c === cols - 1;
const parseRuns = (t: string) => { const n = t.trim().split(/[\s,]+/).filter(Boolean).map(Number).filter((x) => Number.isInteger(x) && x >= 0); return n.length ? n : [0]; };

/** `advanced`: also the Rules and Look sections (otherwise Rules only for Panes, or a puzzle that
 *  already has rules of its own; a creator fixing a reading shouldn't need either). */
export function PuzzleEditor({ spec, onChange, advanced = false }: { spec: GridSpec; onChange: (spec: GridSpec) => void; advanced?: boolean }) {
  const genre = (spec.genre ?? "simple-loop") as GenreName;
  const [rows, cols] = spec.size;
  const givens = spec.givens ?? [];
  const firstTools = GENRE_CLUES[genre] ?? [];
  const cellTools = (Object.keys(CLUES) as ClueKind[]).filter((k) => CLUES[k].on !== "line");
  const [more, setMore] = useState(false);
  const shownTools = more ? cellTools : firstTools.filter((k) => CLUES[k].on !== "line");
  const picture = spec.picture;
  const [tool, setTool] = useState<ClueKind | "paint" | "erase" | "area">(picture ? "paint" : spec.areas && !shownTools.length ? "area" : shownTools[0] ?? "erase");
  const [areaInk, setAreaInk] = useState("a");
  const areas = spec.areas;
  const areaLetters = [...new Set((areas ?? []).join(""))].sort();
  const needsAreas = genres[genre]?.rules.some((r) => r.rule === "shaded-per-area" || r.rule === "water") || genre === "irregular-sudoku";
  const [number, setNumber] = useState(1);
  const [role, setRole] = useState<"in" | "out">("in");
  const [pearl, setPearl] = useState<"white" | "black">("white");
  const [thermo, setThermo] = useState<RC[]>([]);   // a thermometer being drawn, bulb first
  const letters = spec.style?.symbols ?? (genres[genre]?.style as { symbols?: string } | undefined)?.symbols;
  const [dots, setDots] = useState<number[]>([1]);
  const paintColors = spec.style?.palette?.length ? spec.style.palette : ["#ef5a6a", "#f7cf3d", "#3fb0e6"];
  const paints = (spec.marks ?? (genres[genre]?.marks as MarkKind[] | undefined) ?? []).includes("paint");
  const [symbol, setSymbol] = useState("★");
  const [compass, setCompass] = useState({ n: "", e: "", s: "", w: "" });
  const [ink, setInk] = useState(() => (picture ? Object.keys(picture.palette).find((k) => k !== ".") ?? "a" : "a"));
  const set = (patch: Partial<GridSpec>) => onChange({ ...spec, ...patch });
  const setGivens = (g: Given[]) => set({ givens: g });

  // ---- size: grow or shrink at the bottom / right; clues that fall off go ----
  function resize(dr: number, dc: number) {
    const r = Math.max(2, Math.min(30, rows + dr)), c = Math.max(2, Math.min(30, cols + dc));
    const inside = ([y, x]: RC) => y < r && x < c;
    const kept = givens.filter((g) => g.at === "cell" ? inside(g.cell) : g.at === "border" ? g.cells.every(inside)
      : g.at === "corner" ? g.corner[0] <= r && g.corner[1] <= c
        : g.at === "edge" ? inside(g.cell) && onEdge(g.cell, g.side, r, c)
          : g.at === "cells" ? g.cells.every(inside) : g.at === "point" ? g.point[0] < 2 * r && g.point[1] < 2 * c
            : g.index < (g.at === "row" ? r : c));
    set({
      size: [r, c], givens: kept,
      ...(picture ? { picture: { ...picture, rows: Array.from({ length: r }, (_, y) => (picture.rows[y] ?? "").padEnd(c, ".").slice(0, c)) } } : {}),
      ...(areas ? { areas: Array.from({ length: r }, (_, y) => { const row = areas[Math.min(y, areas.length - 1)]; return row.padEnd(c, row.at(-1)).slice(0, c); }) } : {}),
    });
  }

  // ---- clicking the grid: near a border edits the border, otherwise the cell ----
  function click(e: React.MouseEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const scale = (cols * S + 2 * PAD) / box.width;
    const x = (e.clientX - box.left) * scale - PAD, y = (e.clientY - box.top) * scale - PAD;
    // corners and the outside edge (mazes) can be clicked from just outside the grid too
    const vr = Math.round(y / S), vc = Math.round(x / S);
    const nearCorner = vr >= 0 && vc >= 0 && vr <= rows && vc <= cols && Math.hypot(x - vc * S, y - vr * S) < S * 0.3 ? [vr, vc] as RC : null;
    const edgeCell: RC = [Math.max(0, Math.min(rows - 1, Math.floor(y / S))), Math.max(0, Math.min(cols - 1, Math.floor(x / S)))];
    const dist: [Side, number][] = [["top", y], ["bottom", rows * S - y], ["left", x], ["right", cols * S - x]];
    const [side, away] = dist.reduce((a, b) => (b[1] < a[1] ? b : a));
    const nearEdge = away < S * 0.3 ? { cell: edgeCell, side } : null;
    const atEdge = (g: Given) => g.at === "edge" && nearEdge && same(g.cell, nearEdge.cell) && g.side === nearEdge.side;
    const atCorner = (g: Given) => g.at === "corner" && nearCorner && same(g.corner, nearCorner);
    if (tool === "count") {
      if (!nearCorner) return;
      const had = givens.find(atCorner);
      return setGivens([...givens.filter((g) => !atCorner(g)), ...(had && had.kind === "count" && had.value === number ? [] : [{ at: "corner", corner: nearCorner, kind: "count", value: number } as Given])]);
    }
    if (tool === "door") {
      if (!nearEdge) return;
      const had = givens.find(atEdge);
      const rest = givens.filter((g) => !atEdge(g) && !(g.kind === "door" && g.role === role));   // one way in, one way out
      return setGivens([...rest, ...(had && had.kind === "door" && had.role === role ? [] : [{ at: "edge", ...nearEdge, kind: "door", role } as Given])]);
    }
    if (tool === "first" || tool === "skyscraper") {
      if (!nearEdge) return;
      const had = givens.find(atEdge);
      return setGivens([...givens.filter((g) => !atEdge(g)), ...(had && had.kind === tool && had.value === number ? [] : [{ at: "edge", ...nearEdge, kind: tool, value: number } as Given])]);
    }
    // galaxy circles sit on cell centres, edge midpoints or corners (half-cell steps)
    const py = Math.max(1, Math.min(2 * rows - 1, Math.round(y / (S / 2)))), px = Math.max(1, Math.min(2 * cols - 1, Math.round(x / (S / 2))));
    const atPoint = (g: Given) => g.at === "point" && g.point[0] === py && g.point[1] === px;
    if (tool === "galaxy") return setGivens(givens.some(atPoint) ? givens.filter((g) => !atPoint(g)) : [...givens, { at: "point", point: [py, px], kind: "galaxy" }]);
    if (tool === "erase" && givens.some(atPoint) && Math.hypot(x - (px * S) / 2, y - (py * S) / 2) < S * 0.2) return setGivens(givens.filter((g) => !atPoint(g)));
    if (tool === "erase" && (givens.some(atCorner) || givens.some(atEdge))) return setGivens(givens.filter((g) => !atCorner(g) && !atEdge(g)));
    const c = Math.floor(x / S), r = Math.floor(y / S);
    if (r < 0 || c < 0 || r >= rows || c >= cols) return;
    const fx = x / S - c, fy = y / S - r, edge = 0.22;
    const border: [RC, RC] | null =
      fx > 1 - edge && c + 1 < cols ? [[r, c], [r, c + 1]] : fx < edge && c > 0 ? [[r, c - 1], [r, c]]
        : fy > 1 - edge && r + 1 < rows ? [[r, c], [r + 1, c]] : fy < edge && r > 0 ? [[r - 1, c], [r, c]] : null;
    const cell: RC = [r, c];

    if (tool === "area") {
      if (!areas) return;
      return set({ areas: areas.map((row, y) => y !== r ? row : row.slice(0, c) + areaInk + row.slice(c + 1)) });
    }
    if (tool === "paint") {
      if (!picture) return;
      const rowsNow = picture.rows.map((row, y) => y !== r ? row : row.slice(0, c) + (row[c] === ink ? "." : ink) + row.slice(c + 1));
      return set({ picture: { ...picture, rows: rowsNow } });
    }
    if (tool === "thermo") {
      const last = thermo.at(-1);
      if (thermo.some((t) => same(t, cell))) return;
      if (last && Math.max(Math.abs(last[0] - r), Math.abs(last[1] - c)) !== 1) return;   // each cell next to the one before
      return setThermo([...thermo, cell]);
    }
    if (tool === "erase") {
      if (border && givens.some((g) => onBorder(g, ...border))) return setGivens(givens.filter((g) => !onBorder(g, ...border)));
      const onThermo = (g: Given) => g.at === "cells" && g.cells.some((t) => same(t, cell));
      if (givens.some(onThermo) && !givens.some((g) => g.at === "cell" && same(g.cell, cell))) return setGivens(givens.filter((g) => !onThermo(g)));
      return setGivens(givens.filter((g) => !(g.at === "cell" && same(g.cell, cell))));
    }
    if (CLUES[tool].on === "border") {
      if (!border) return;
      const had = givens.some((g) => onBorder(g, ...border) && g.kind === tool);
      return setGivens([...givens.filter((g) => !onBorder(g, ...border)), ...(had ? [] : [{ at: "border", cells: border, kind: tool } as Given])]);
    }
    const placed: Given =
      tool === "block" ? { at: "cell", cell, kind: "block" }
        : tool === "number" ? { at: "cell", cell, kind: "number", value: number }
          : tool === "symbol" ? { at: "cell", cell, kind: "symbol", value: symbol }
          : tool === "dots" ? { at: "cell", cell, kind: "dots", value: dots }
          : tool === "pearl" ? { at: "cell", cell, kind: "pearl", value: pearl }
            : { at: "cell", cell, kind: "compass", value: Object.fromEntries(Object.entries(compass).filter(([, v]) => v !== "").map(([k, v]) => [k, Number(v)])) };
    // a number and a black cell can share a cell (Akari); anything else replaces what's there
    const pairs = (a: Given, b: Given) => (a.kind === "number" && b.kind === "block") || (a.kind === "block" && b.kind === "number");
    const here = givens.filter((g) => g.at === "cell" && same(g.cell, cell));
    const identical = here.some((g) => JSON.stringify(g) === JSON.stringify(placed));
    const kept = here.filter((g) => !identical && pairs(g, placed));
    setGivens([...givens.filter((g) => !(g.at === "cell" && same(g.cell, cell))), ...kept, ...(identical ? here.filter((g) => JSON.stringify(g) !== JSON.stringify(placed)) : [placed])]);
  }

  // ---- nonogram clue numbers (when there's no picture) ----
  const runsAt = (at: "row" | "col", index: number) =>
    (givens.find((g) => g.at === at && g.index === index) as Extract<Given, { kind: "runs" }> | undefined)?.value;
  const setRuns = (at: "row" | "col", index: number, text: string) =>
    setGivens([...givens.filter((g) => !(g.at === at && g.index === index)), { at, index, kind: "runs", value: parseRuns(text) }]);
  const nonogram = genre === "nonogram";
  // numbers beside the rows and above the columns: a nonogram's runs, or totals (Aquarium)
  const lineClue: "runs" | "total" | null = nonogram && !picture ? "runs"
    : GENRE_CLUES[genre]?.includes("total") || givens.some((g) => g.kind === "total") ? "total" : null;
  const lineText = (at: "row" | "col", index: number) => {
    const g = givens.find((x) => x.at === at && x.index === index);
    return lineClue === "runs" ? runsText(runsAt(at, index)) : g?.kind === "total" ? String(g.value) : "";
  };
  const setLine = (at: "row" | "col", index: number, text: string) => {
    if (lineClue === "runs") return setRuns(at, index, text);
    const v = parseInt(text, 10), rest = givens.filter((g) => !(g.at === at && g.index === index));
    setGivens(Number.isInteger(v) && v >= 0 ? [...rest, { at, index, kind: "total", value: v }] : rest);
  };
  function toPicture() {
    set({ givens: givens.filter((g) => g.at !== "row" && g.at !== "col"), picture: { rows: Array.from({ length: rows }, () => ".".repeat(cols)), palette: { ".": "#ffffff", a: "#26398f" } } });
    setTool("paint"); setInk("a");
  }
  function toNumbers() {
    const on = (picture?.rows ?? []).map((row) => [...row].map((ch) => ch !== "."));
    const lines: Given[] = picture ? [
      ...on.map((row, r): Given => ({ at: "row", index: r, kind: "runs", value: runsOf(row) })),
      ...Array.from({ length: cols }, (_, c): Given => ({ at: "col", index: c, kind: "runs", value: runsOf(on.map((row) => row[c] ?? false)) })),
    ] : [];
    const { picture: _gone, ...rest } = spec;
    onChange({ ...rest, givens: [...givens.filter((g) => g.at !== "row" && g.at !== "col"), ...lines] });
  }

  // ---- the game type: Three Coats is drawn as a figure of pieces, everything else on a grid ----
  function changeGenre(next: GenreName) {
    if (next === genre) return;
    if (next === "coats" && !spec.figure) {
      const pieces = squaresFigure(3, 3);
      return onChange({ genre: next, size: [1, pieces.length], figure: { pieces } });
    }
    if (next !== "coats" && spec.figure) {
      const { figure: _f, hearts: _h, ...rest } = spec;
      return onChange({ ...rest, genre: next, size: [5, 5], givens: [] });
    }
    set({ genre: next });
  }

  // ---- rules beyond the genre's own ----
  const extra = spec.rules ?? [];
  const setRules = (r: RuleSpec[]) => set({ rules: r.length ? r : undefined });
  const presets = (genres[genre]?.rules ?? []) as RuleSpec[];

  // ---- look ----
  const style = spec.style ?? {};
  const setStyle = (k: keyof GridStyle, v: unknown) => {
    const next = { ...style, [k]: v };
    if (v === undefined || v === "") delete next[k];
    set({ style: Object.keys(next).length ? next : undefined });
  };

  const W = cols * S + 2 * PAD, H = rows * S + 2 * PAD;
  const at = (r: number, c: number) => ({ x: PAD + c * S, y: PAD + r * S });
  const palette = picture?.palette ?? {};

  return (
    <div className="givens-editor">
      <div className="ge-bar">
        <label>Game type
          <select value={genre} onChange={(e) => changeGenre(e.target.value as GenreName)}>
            {(Object.keys(GENRE_CLUES) as GenreName[]).map((g) => <option key={g} value={g}>{KIND_NAMES[g]}</option>)}
          </select>
        </label>
        {!spec.figure && <span className="ge-size">
          Rows <button type="button" onClick={() => resize(-1, 0)} aria-label="Fewer rows">−</button><b>{rows}</b><button type="button" onClick={() => resize(1, 0)} aria-label="More rows">+</button>
          Columns <button type="button" onClick={() => resize(0, -1)} aria-label="Fewer columns">−</button><b>{cols}</b><button type="button" onClick={() => resize(0, 1)} aria-label="More columns">+</button>
        </span>}
      </div>

      {spec.figure ? <FigureEditor spec={spec} set={set} /> : <>
      {nonogram && (
        <div className="ge-bar">
          <span className="ge-tools" role="group" aria-label="Picture or numbers">
            <button type="button" aria-pressed={!!picture} onClick={() => !picture && toPicture()}>Draw the picture</button>
            <button type="button" aria-pressed={!picture} onClick={() => picture && toNumbers()}>Type clue numbers</button>
          </span>
          {picture && <label>Picture title <input className="wide" value={picture.title ?? ""} maxLength={60}
            onChange={(e) => set({ picture: { ...picture, title: e.target.value || undefined } })} /></label>}
        </div>
      )}

      {picture && (
        <div className="ge-bar">
          <span className="ge-tools" role="group" aria-label="Paint color">
            {Object.keys(palette).filter((k) => k !== ".").map((k) => (
              <span key={k} className="swatch-edit">
                <button type="button" aria-pressed={tool === "paint" && ink === k} aria-label={`Paint with color ${k}`}
                  onClick={() => { setTool("paint"); setInk(k); }} style={{ background: palette[k] }} />
                <input type="color" aria-label={`Color ${k}`} value={palette[k]} onChange={(e) => set({ picture: { ...picture, palette: { ...palette, [k]: e.target.value } } })} />
                <button type="button" className="x" aria-label={`Remove color ${k}`} onClick={() => {
                  const { [k]: _gone, ...rest } = palette;
                  set({ picture: { ...picture, palette: rest, rows: picture.rows.map((row) => row.replaceAll(k, ".")) } });
                }}>×</button>
              </span>
            ))}
            <button type="button" onClick={() => {
              const k = [...LETTERS].find((l) => !(l in palette));
              if (k) { set({ picture: { ...picture, palette: { ...palette, [k]: "#d8443a" } } }); setTool("paint"); setInk(k); }
            }}>+ Color</button>
          </span>
          <label>Background <input type="color" value={palette["."] ?? "#ffffff"} onChange={(e) => set({ picture: { ...picture, palette: { ...palette, ".": e.target.value } } })} /></label>
        </div>
      )}

      {(areas || needsAreas) && (
        <div className="ge-bar">
          {areas ? (
            <span className="ge-tools" role="group" aria-label="Areas">
              {areaLetters.map((k) => (
                <button key={k} type="button" aria-pressed={tool === "area" && areaInk === k} onClick={() => { setTool("area"); setAreaInk(k); }}>
                  <i className="fe-swatch" style={{ background: areaColor(k) }} /> Area {k.toUpperCase()}
                </button>
              ))}
              <button type="button" onClick={() => { const k = [...LETTERS].find((l) => !areaLetters.includes(l)); if (k) { setTool("area"); setAreaInk(k); } }}>+ New area</button>
              {!needsAreas && <button type="button" className="link" onClick={() => { const { areas: _a, ...rest } = spec; onChange(rest); setTool("erase"); }}>Remove areas</button>}
            </span>
          ) : (
            <button type="button" onClick={() => { set({ areas: Array.from({ length: rows }, (_, y) => LETTERS[y % 26].repeat(cols)) }); setTool("area"); }}>Add outlined areas</button>
          )}
          {tool === "area" && <span className="hint">Painting area {areaInk.toUpperCase()}: click cells to move them into it. Each area must be one connected piece.</span>}
        </div>
      )}
      {!needsAreas && !areas && !picture && !spec.figure && <p className="hint"><button type="button" className="link" onClick={() => { set({ areas: Array.from({ length: rows }, (_, y) => LETTERS[y % 26].repeat(cols)) }); setTool("area"); }}>Add outlined areas</button> (for puzzles whose rules use them)</p>}

      {!picture && (
        <div className="ge-bar">
          <span className="ge-tools" role="group" aria-label="Tool">
            {shownTools.map((t) => <button key={t} type="button" aria-pressed={tool === t} onClick={() => setTool(t)}>{CLUES[t].label}</button>)}
            <button type="button" aria-pressed={tool === "erase"} onClick={() => setTool("erase")}>Erase</button>
            <button type="button" className="link" onClick={() => setMore(!more)}>{more ? "Fewer clues" : "More clues"}</button>
          </span>
          {tool === "dots" && (
            <span className="ge-tools" role="group" aria-label="Dots">
              {paintColors.map((c, k) => <button key={k} type="button" onClick={() => setDots([...dots, k + 1])}>+ <i className="fe-swatch" style={{ background: c }} /></button>)}
              <span className="fe-dots">{dots.map((c, j) => <i key={j} className="fe-swatch" style={{ background: paintColors[c - 1] }} />)}</span>
              <button type="button" onClick={() => setDots(dots.slice(0, -1))} disabled={dots.length <= 1}>−</button>
            </span>
          )}
          {tool === "thermo" && (
            <span className="ge-tools">
              <span className="hint">{thermo.length ? `${thermo.length} cell${thermo.length === 1 ? "" : "s"}, bulb first.` : "Click the bulb, then each cell to the tip."}</span>
              <button type="button" disabled={thermo.length < 2} onClick={() => { setGivens([...givens, { at: "cells", cells: thermo, kind: "thermo" }]); setThermo([]); }}>Finish thermometer</button>
              {thermo.length > 0 && <button type="button" className="link" onClick={() => setThermo([])}>Cancel</button>}
            </span>
          )}
          {tool === "first" && letters && (
            <span className="ge-tools" role="group" aria-label="Letter">
              {[...letters].map((ch, k) => <button key={ch} type="button" aria-pressed={number === k + 1} onClick={() => setNumber(k + 1)}>{ch}</button>)}
            </span>
          )}
          {tool === "pearl" && (
            <span className="ge-tools" role="group" aria-label="Pearl">
              <button type="button" aria-pressed={pearl === "white"} onClick={() => setPearl("white")}>○ White</button>
              <button type="button" aria-pressed={pearl === "black"} onClick={() => setPearl("black")}>● Black</button>
            </span>
          )}
          {tool === "door" && (
            <span className="ge-tools" role="group" aria-label="Door">
              <button type="button" aria-pressed={role === "in"} onClick={() => setRole("in")}>Way in</button>
              <button type="button" aria-pressed={role === "out"} onClick={() => setRole("out")}>Way out</button>
            </span>
          )}
          {(tool === "number" || tool === "count" || tool === "skyscraper") && <label>Value <input type="number" min={0} max={30} value={number} onChange={(e) => setNumber(Number(e.target.value))} /></label>}
          {tool === "symbol" && <label>Symbol <input value={symbol} maxLength={2} onChange={(e) => setSymbol(e.target.value)} /></label>}
          {tool === "compass" && (
            <span className="ge-compass">{(["n", "e", "s", "w"] as const).map((k) =>
              <label key={k}>{k.toUpperCase()} <input type="number" min={0} max={30} value={compass[k]} onChange={(e) => setCompass({ ...compass, [k]: e.target.value })} /></label>)}
            </span>
          )}
        </div>
      )}
      <p className="hint">{tool === "area" ? "Click cells to put them in the chosen area." : tool === "paint" ? "Click cells to paint them; click again to clear." : tool === "erase" ? "Click a clue or a line mark to remove it." : tool === "count" ? "Click a corner where grid lines meet." : tool === "door" ? "Click the outside edge beside a cell." : !picture && CLUES[tool].on === "border" ? "Click the line between two cells." : "Click a cell; click again to remove."}</p>

      <div className={lineClue ? "ge-with-runs" : undefined}>
        {lineClue && (
          <div className="ge-col-runs" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            {Array.from({ length: cols }, (_, c) => <input key={c} aria-label={`Column ${c + 1} clue`} defaultValue={lineText("col", c)} onBlur={(e) => setLine("col", c, e.target.value)} />)}
          </div>
        )}
        <div className="ge-row-wrap">
          {lineClue && (
            <div className="ge-row-runs" style={{ gridTemplateRows: `repeat(${rows}, 1fr)` }}>
              {Array.from({ length: rows }, (_, r) => <input key={r} aria-label={`Row ${r + 1} clue`} defaultValue={lineText("row", r)} onBlur={(e) => setLine("row", r, e.target.value)} />)}
            </div>
          )}
          <svg className="ge-grid" viewBox={`0 0 ${W} ${H}`} onClick={click} role="img" aria-label="Puzzle editor">
            {Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => {
              const { x, y } = at(r, c);
              const ch = picture?.rows[r]?.[c];
              const ak = areas?.[r]?.[c];
              return <rect key={`${r}-${c}`} x={x} y={y} width={S} height={S} className="ge-cell" style={ch && ch !== "." ? { fill: palette[ch] ?? "#26398f" } : ak ? { fill: areaColor(ak) } : undefined} />;
            }))}
            {areas && Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => {
              const { x, y } = at(r, c), k = areas[r]?.[c];
              return <g key={`a${r}-${c}`}>
                {c + 1 < cols && areas[r][c + 1] !== k && <line x1={x + S} y1={y} x2={x + S} y2={y + S} className="ge-area" />}
                {r + 1 < rows && areas[r + 1]?.[c] !== k && <line x1={x} y1={y + S} x2={x + S} y2={y + S} className="ge-area" />}
              </g>;
            }))}
            {givens.map((g, i) => {
              if (g.at === "cell") {
                const { x, y } = at(...g.cell), cx = x + S / 2, cy = y + S / 2;
                if (g.kind === "dots") return <g key={i} className={g.hidden ? "ge-dots hidden" : "ge-dots"}>{g.value.map((c, j) =>
                  <circle key={j} cx={cx + (j - (g.value.length - 1) / 2) * 11} cy={cy} r={4.5} fill={paintColors[c - 1] ?? "#999"} />)}</g>;
                if (g.kind === "pearl") return <circle key={i} cx={cx} cy={cy} r={S * 0.28} className={`ge-pearl ${g.value}`} />;
                if (g.kind === "block") return <rect key={i} x={x + 2} y={y + 2} width={S - 4} height={S - 4} className="ge-rock" />;
                if (g.kind === "compass") {
                  const v = g.value;
                  return <g key={i} className="ge-text small">
                    {v.n !== undefined && <text x={cx} y={y + 11}>{v.n}</text>}{v.s !== undefined && <text x={cx} y={y + S - 7}>{v.s}</text>}
                    {v.w !== undefined && <text x={x + 9} y={cy + 4}>{v.w}</text>}{v.e !== undefined && <text x={x + S - 9} y={cy + 4}>{v.e}</text>}
                    <circle cx={cx} cy={cy} r={3} />
                  </g>;
                }
                const onRock = givens.some((o) => o.at === "cell" && o.kind === "block" && same(o.cell, g.cell));
                return <text key={i} x={cx} y={cy + 7} className={onRock ? "ge-text on-rock" : "ge-text"}>{String(g.value)}</text>;
              }
              if (g.at === "border") {
                const [[r1, c1], [r2, c2]] = g.cells;
                const a = at(Math.max(r1, r2), Math.max(c1, c2));
                const line = r1 === r2 ? { x1: a.x, y1: a.y, x2: a.x, y2: a.y + S } : { x1: a.x, y1: a.y, x2: a.x + S, y2: a.y };
                if (g.kind === "wall") return <line key={i} {...line} className="ge-wall" />;
                const mx = (line.x1 + line.x2) / 2, my = (line.y1 + line.y2) / 2, d = 9;
                return <path key={i} d={`M${mx} ${my - d}L${mx + d} ${my}L${mx} ${my + d}L${mx - d} ${my}Z`} className={g.kind === "twins" ? "ge-diamond filled" : "ge-diamond"} />;
              }
              if (g.at === "corner") {
                const { x, y } = at(...g.corner);
                return <g key={i} className="ge-corner"><circle cx={x} cy={y} r={10} /><text x={x} y={y + 5}>{g.value}</text></g>;
              }
              if (g.at === "cells") return <polyline key={i} points={g.cells.map(([r, c]) => { const a = at(r, c); return `${a.x + S / 2},${a.y + S / 2}`; }).join(" ")} className="ge-thermo" />;
              if (g.at === "point") return <circle key={i} cx={PAD + (g.point[1] * S) / 2} cy={PAD + (g.point[0] * S) / 2} r={7} className="ge-galaxy" />;
              if (g.at === "edge") {
                const { x, y } = at(...g.cell), [cx, cy] = [x + S / 2, y + S / 2];
                const [dx, dy] = g.side === "top" ? [0, -1] : g.side === "bottom" ? [0, 1] : g.side === "left" ? [-1, 0] : [1, 0];
                const [mx, my] = [cx + dx * S / 2, cy + dy * S / 2];
                if (g.kind !== "door") return <text key={i} x={mx + dx * 13} y={my + dy * 13 + 6} className="ge-text small outside">{g.kind === "first" ? (letters?.[g.value - 1] ?? g.value) : g.value}</text>;
                const [ax, ay, hx, hy] = g.role === "in" ? [mx + dx * 20, my + dy * 20, mx + dx * 3, my + dy * 3] : [mx + dx * 3, my + dy * 3, mx + dx * 20, my + dy * 20];
                const ux = Math.sign(hx - ax), uy = Math.sign(hy - ay), bx = hx - 6 * ux, by = hy - 6 * uy;
                return <g key={i} className="ge-door">
                  <line x1={mx - Math.abs(dy) * S / 2} y1={my - Math.abs(dx) * S / 2} x2={mx + Math.abs(dy) * S / 2} y2={my + Math.abs(dx) * S / 2} className="ge-gap" />
                  <path d={`M${ax} ${ay}L${hx} ${hy}M${bx - 5 * uy} ${by + 5 * ux}L${hx} ${hy}L${bx + 5 * uy} ${by - 5 * ux}`} />
                </g>;
              }
              return null;
            })}
            {thermo.length > 0 && <polyline points={thermo.map(([r, c]) => { const a = at(r, c); return `${a.x + S / 2},${a.y + S / 2}`; }).join(" ")} className="ge-thermo draft" />}
          </svg>
        </div>
      </div>
      {paints && (
        <div className="ge-bar"><label>Hearts <input type="number" min={0} max={9} value={spec.hearts ?? ""} onChange={(e) => set({ hearts: e.target.value === "" ? undefined : Number(e.target.value) })} /></label>
          <span className="hint">Mistakes allowed when painting; 0 lets players paint freely.</span></div>
      )}
      </>}

      {(advanced || genre === "panes" || extra.length > 0) && <details className="ge-section" open={genre === "panes" || extra.length > 0}>
        <summary>Rules</summary>
        {presets.length > 0 && <p className="hint">{KIND_NAMES[genre]} always has: {presets.map((r) => RULES[r.rule as RuleName]?.label ?? r.rule).join("; ")}.</p>}
        <div className="ge-rules">
          {extra.map((r, i) => {
            const def = RULES[r.rule as RuleName];
            const update = (k: string, v: unknown) => setRules(extra.map((x, j) => {
              if (j !== i) return x;
              const next: RuleSpec = { ...x, [k]: v };
              if (v === undefined || v === "" || v === false) delete next[k];
              return next;
            }));
            return (
              <span key={i} className="chip">
                {def?.label ?? r.rule}
                {def?.settings.map((s) => (
                  <label key={s.key} className="setting">{s.label}
                    {s.type === "number" && <input type="number" min={0} max={99} value={r[s.key] === undefined ? "" : Number(r[s.key])}
                      onChange={(e) => update(s.key, e.target.value === "" ? undefined : Number(e.target.value))} />}
                    {s.type === "flag" && <input type="checkbox" checked={!!r[s.key]} onChange={(e) => update(s.key, e.target.checked)} />}
                    {s.type === "choice" && (
                      <select value={String(r[s.key] ?? "")} onChange={(e) => update(s.key, e.target.value || undefined)}>
                        <option value="">default</option>{s.choices.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    )}
                    {s.type === "pair" && (
                      <input placeholder="e.g. 2 3" defaultValue={Array.isArray(r[s.key]) ? (r[s.key] as number[]).join(" ") : ""}
                        onBlur={(e) => { const p = e.target.value.trim().split(/[\s×x,]+/).map(Number).filter((n) => n > 0); update(s.key, p.length === 2 ? p : undefined); }} />
                    )}
                  </label>
                ))}
                <button type="button" aria-label={`Remove ${def?.label ?? r.rule}`} onClick={() => setRules(extra.filter((_, j) => j !== i))}>×</button>
              </span>
            );
          })}
          <select value="" aria-label="Add a rule" onChange={(e) => {
            const rule = e.target.value as RuleName;
            if (rule) setRules([...extra, rule === "size" ? { rule, is: 4 } : { rule }]);
          }}>
            <option value="">Add a rule…</option>
            {(Object.keys(RULES) as RuleName[]).map((r) => <option key={r} value={r}>{RULES[r].label}</option>)}
          </select>
        </div>
      </details>}

      {advanced && <details className="ge-section">
        <summary>Look</summary>
        <div className="ge-look">
          {(Object.keys(STYLE) as (keyof GridStyle)[]).map((k) => {
            const def = STYLE[k], v = style[k];
            return (
              <label key={k}>{def.label}
                {def.type === "color" && (
                  <span className="ge-inline">
                    <input type="color" value={typeof v === "string" ? v : "#26398f"} onChange={(e) => setStyle(k, e.target.value)} />
                    {v !== undefined && <button type="button" className="link" onClick={() => setStyle(k, undefined)}>default</button>}
                  </span>
                )}
                {def.type === "text" && <input value={typeof v === "string" ? v : ""} maxLength={9} onChange={(e) => setStyle(k, e.target.value.toUpperCase() || undefined)} />}
                {def.type === "number" && <input type="number" min={0} max={30} value={v === undefined ? "" : Number(v)} onChange={(e) => setStyle(k, e.target.value === "" ? undefined : Number(e.target.value))} />}
                {def.type === "choice" && (
                  <select value={String(v ?? "")} onChange={(e) => setStyle(k, e.target.value || undefined)}>
                    <option value="">default</option>{def.choices!.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}
                {def.type === "colors" && (
                  <span className="ge-inline">
                    {(Array.isArray(v) ? (v as string[]) : []).map((c, i, all) => (
                      <span key={i} className="swatch-edit">
                        <input type="color" value={c} aria-label={`Region color ${i + 1}`} onChange={(e) => setStyle(k, all.map((x, j) => (j === i ? e.target.value : x)))} />
                        <button type="button" className="x" aria-label={`Remove region color ${i + 1}`} onClick={() => setStyle(k, all.filter((_, j) => j !== i).length ? all.filter((_, j) => j !== i) : undefined)}>×</button>
                      </span>
                    ))}
                    <button type="button" onClick={() => setStyle(k, [...(Array.isArray(v) ? (v as string[]) : []), "#4f9fdc"])}>+ Color</button>
                  </span>
                )}
              </label>
            );
          })}
          <fieldset className="ge-marks">
            <legend>What the player draws <span className="hint">(the game type decides unless you change it)</span></legend>
            {(Object.keys(MARKS) as MarkKind[]).map((m) => {
              const current = spec.marks ?? (genres[genre]?.marks as MarkKind[] | undefined) ?? [];
              return (
                <label key={m} className="ge-inline">
                  <input type="checkbox" checked={current.includes(m)} onChange={(e) => {
                    const next = e.target.checked ? [...current, m] : current.filter((x) => x !== m);
                    const preset = (genres[genre]?.marks as MarkKind[] | undefined) ?? [];
                    set({ marks: next.length === preset.length && next.every((x) => preset.includes(x)) ? undefined : next });
                  }} /> {MARKS[m]}
                </label>
              );
            })}
          </fieldset>
        </div>
      </details>}
    </div>
  );
}
