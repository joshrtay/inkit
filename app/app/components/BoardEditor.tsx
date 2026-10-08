// The on-puzzle editor: the puzzle drawn as the player will see it, edited in place with the few
// tools its type needs. The page around it (GameEditor) owns undo, the one-solution check and
// Claude's doubts; this draws the board, the cells the clues can't pin down (nonograms), and a pin
// on each doubt's spot, and puts its tools in the page's toolbar.
//
// Every grid type has its tools here (TOOLS); Three Coats, drawn as pieces rather than a grid,
// uses its own figure editor (FigureEditor). Which tool places each kind of clue is checked
// against the engine in editor/coverage.ts. Each tool is one way of touching the board: a number
// typed into a square, a rock toggled, a wall clicked between two squares, a thermometer dragged
// from its bulb, an area painted, a number or letter typed outside the grid...
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { genres, makePuzzle, type GenreName } from "~site/engine/puzzle.ts";
import { solveLine } from "~site/engine/rules.ts";
import { SYMMETRIES, type Symmetry } from "~site/engine/panel.ts";
import { SYMBOL_COLORS, type Given, type GridSpec, type LineColor, type Puzzle, type Side, type SymbolColor } from "~site/engine/types.ts";
import { symbolSvg } from "~site/game-types/grid/panel-draw.ts";
import { pictureLayout, pictureSvg, type Room } from "~site/game-types/grid/picture.ts";
import "~site/game-types/grid/styles.css";
import type { Doubt } from "~/games/doubts";
import type { ToolId } from "~/editor/coverage";
import * as ops from "~/editor/ops";
import { onBorder, same, type RC } from "~/editor/ops";

type Spec = GridSpec;

/** A doubt's pin on the board: `n` is its number in the list; `active` while it's hovered there. */
export interface Pin extends Omit<Doubt, "text" | "done"> { n: number; active?: boolean }

// ---- the tools ----


const TOOL_LABELS: Record<ToolId, string> = {
  number: "Number", block: "Rock", wall: "Wall", pearl: "Pearl", galaxy: "Circle", thermo: "Thermometer", door: "Door",
  "outside-number": "Number outside", "outside-letter": "Letter outside", corner: "Corner number", total: "Line total",
  area: "Areas", symbol: "Symbol", compass: "Compass", diamond: "◆ / ◇", erase: "Erase",
  start: "Start", end: "End", gap: "Gap", dot: "Dot", square: "Square", star: "Star", triangle: "Triangle", shape: "Shape", eraser: "Eraser",
};

const TOOL_HINTS: Record<ToolId, string> = {
  number: "Click a square and type its number (Enter or the arrow keys move on)",
  block: "Click or drag across squares to add or remove rocks",
  wall: "Click the line between two squares to add or remove a wall",
  pearl: "Click a square: white pearl, black pearl, none",
  galaxy: "Click a square's centre, a line or a corner to add or remove a circle",
  thermo: "Drag from the bulb to the tip; click a thermometer to remove it",
  door: "Click just outside the grid: way in, way out, none",
  "outside-number": "Click just outside a row or column and type its number",
  "outside-letter": "Click just outside a row or column and type its letter",
  corner: "Click where grid lines meet and type the number",
  total: "Click beside a row or above a column and type how many",
  area: "Pick an area, then click or drag squares into it",
  symbol: "Click a square to add or remove a symbol",
  compass: "Click a square to set its compass numbers",
  diamond: "Click the line between two squares: ◆ same shape, ◇ different shape, none",
  erase: "Click any clue to remove it",
  start: "Click where grid lines meet to add or remove a start circle",
  end: "Click a corner on the outside edge to add or remove an end",
  gap: "Click a stretch of grid line to break it, or mend it",
  dot: "Click where grid lines meet, or halfway along a line, to add or remove a dot",
  square: "Pick a color, then click a square to add or remove a colored square",
  star: "Pick a color, then click a square to add or remove a star",
  triangle: "Click a square: one triangle, two, three, none",
  shape: "Pick a shape, then click a square to add or remove it",
  eraser: "Click a square to add or remove an eraser",
};

/** A panel's tools: the line's start, end, gaps and dots, then the symbol its type teaches, then
 *  the others (every symbol works in every panel), then Erase. */
const LINE_TOOLS: ToolId[] = ["start", "end", "gap", "dot"];
const SYMBOL_TOOLS: ToolId[] = ["square", "star", "triangle", "shape", "eraser"];
const panelTools = (own: ToolId | null): ToolId[] => [...LINE_TOOLS, ...(own ? [own] : []), ...SYMBOL_TOOLS.filter((t) => t !== own), "erase"];

/** Each grid type's tools, most used first (Three Coats has its own editor). Typed against the
 *  engine's genres, so a new genre needs its tools here before the build passes. */
export const TOOLS: Record<Exclude<GenreName, "coats">, ToolId[]> = {
  slitherlink: ["number", "erase"],
  nurikabe: ["number", "erase"],
  "simple-loop": ["block", "wall", "erase"],
  "simple-path": ["door", "block", "wall", "erase"],
  "star-battle": ["area"],
  akari: ["block", "number", "erase"],
  numberlink: ["number", "erase"],
  cave: ["number", "erase"],
  "square-jam": ["number", "erase"],
  "wittgenstein-briquet": ["number", "erase"],
  hitori: ["number", "erase"],
  minesweeper: ["number", "erase"],
  "spiral-galaxies": ["galaxy"],
  "thermo-sudoku": ["number", "thermo", "erase"],
  skyscrapers: ["outside-number", "number", "erase"],
  "easy-as-abc": ["outside-letter", "erase"],
  aquarium: ["area", "total", "erase"],
  masyu: ["pearl"],
  shikaku: ["number", "erase"],
  "irregular-sudoku": ["area", "number", "erase"],
  nonogram: [],
  sudoku: ["number", "erase"],
  panes: ["number", "symbol", "compass", "diamond", "block", "erase"],
  maze: ["corner", "wall", "door", "erase"],
  "panel-dots": panelTools(null),
  "panel-squares": panelTools("square"),
  "panel-stars": panelTools("star"),
  "panel-triangles": panelTools("triangle"),
  "panel-shapes": panelTools("shape"),
  "panel-erasers": panelTools("eraser"),
  "panel-symmetry": panelTools(null),
};

export const hasBoardEditor = (genre: string | undefined) => !!genre && genre in TOOLS;

/** Types whose grid is always square (and the sizes a sudoku comes in). */
const SQUARE = new Set(["sudoku", "irregular-sudoku", "thermo-sudoku", "skyscrapers", "easy-as-abc", "star-battle"]);
const SUDOKU_SIZES: Record<string, number[]> = { sudoku: [4, 6, 9], "thermo-sudoku": [4, 6, 9] };

const LETTERS = "abcdefghijklmnopqrstuvwxyz";
const AREA_HUES = (k: string) => (LETTERS.indexOf(k.toLowerCase()) * 137) % 360;
const runsText = (v: number[] | undefined) => (v ?? [0]).join(" ");
const parseRuns = (t: string) => { const n = t.trim().split(/[\s,]+/).filter(Boolean).map(Number).filter((x) => Number.isInteger(x) && x >= 0); return n.length ? n : [0]; };
const sameColor = (s: string | undefined, t: string) => !!s && s.toLowerCase() === t.toLowerCase();
const SYMMETRY_LABELS: Record<Symmetry, string> = { "left-right": "Left–right", "up-down": "Up–down", turn: "Turned" };
const capital = (w: string) => w[0].toUpperCase() + w.slice(1);
/** A panel symbol drawn small, for a button. */
const SymbolIcon = ({ x }: { x: Parameters<typeof symbolSvg>[0] }) => (
  <span className="grid-game be-icon" aria-hidden="true"><svg viewBox="0 0 32 32" dangerouslySetInnerHTML={{ __html: symbolSvg(x, 16, 16, 40) }} /></span>
);
const STEPS: Record<string, RC> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

/** A nonogram's cells that solving one line at a time can't decide (null: the clues contradict). */
function undecidedCells(p: Puzzle): number[] | null {
  const g = p.grid, known = new Array<number>(g.cellCount).fill(-1);
  const lines = [
    ...[...p.rowRuns].map(([r, clue]) => ({ clue, cells: Array.from({ length: g.cols }, (_, c) => g.cell(r, c)) })),
    ...[...p.colRuns].map(([c, clue]) => ({ clue, cells: Array.from({ length: g.rows }, (_, r) => g.cell(r, c)) })),
  ];
  for (let changed = true; changed;) {
    changed = false;
    for (const { clue, cells } of lines) {
      const res = solveLine(clue, cells.map((i) => known[i]));
      if (!res) return null;
      res.forEach((v, k) => { if (v !== -1 && known[cells[k]] === -1) { known[cells[k]] = v; changed = true; } });
    }
  }
  return known.flatMap((v, i) => (v === -1 ? [i] : []));
}

/** What a typed value is for: a square's number, a line's numbers, a number or letter outside... */
type Typing =
  | { kind: "number"; cell: RC }
  | { kind: "runs"; at: "row" | "col"; index: number }
  | { kind: "total"; at: "row" | "col"; index: number }
  | { kind: "outside"; cell: RC; side: Side; letter: boolean }
  | { kind: "corner"; corner: RC }
  | { kind: "compass"; cell: RC };

export function BoardEditor({ spec, onChange, tools, ambiguous, flash = 0, pins = [] }: {
  spec: Spec;
  /** `continuing`: part of the same stroke as the last change (one undo step for a whole drag) */
  onChange: (s: Spec, continuing?: boolean) => void;
  /** where the tools go (the page's toolbar) */
  tools: HTMLElement | null;
  /** the check found more than one solution: mark the cells the clues can't pin down (nonograms) */
  ambiguous: boolean;
  /** bumped to make the marked cells flash */
  flash?: number;
  pins?: Pin[];
}) {
  const genre = (spec.genre ?? "simple-loop") as Exclude<GenreName, "coats">;
  const toolList = TOOLS[genre] ?? ["number", "erase"];
  const [tool, setTool] = useState<ToolId>(toolList[0] ?? "erase");
  useEffect(() => { if (!toolList.includes(tool)) setTool(toolList[0] ?? "erase"); }, [genre]); // eslint-disable-line react-hooks/exhaustive-deps
  const [ink, setInk] = useState(() => Object.entries(spec.picture?.palette ?? {}).find(([k]) => k !== ".")?.[1] ?? "#26398f");
  const [area, setArea] = useState(() => spec.areas?.[0]?.[0] ?? "a");
  // panels: the color squares and stars are placed in, a symmetry panel's dot color, the shape
  const [symColor, setSymColor] = useState<Record<"square" | "star", SymbolColor>>({ square: "black", star: "orange" });
  const [dotColor, setDotColor] = useState<LineColor | undefined>(undefined);
  const [shapeAt, setShapeAt] = useState(0);
  const [turns, setTurns] = useState(0);
  const [canTurn, setCanTurn] = useState(false);
  const [hollow, setHollow] = useState(false);
  const [typing, setTyping] = useState<(Typing & { value: string }) | null>(null);
  const [flashing, setFlashing] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const typed = useRef<HTMLInputElement>(null);
  type Stroke = { kind: "paint"; value: string; palette: Record<string, string> } | { kind: "block"; on: boolean } | { kind: "area" } | { kind: "thermo"; cells: RC[] };
  const stroke = useRef<Stroke | null>(null);
  const [drawing, setDrawing] = useState<RC[] | null>(null);   // a thermometer being dragged

  const [rows, cols] = spec.size, picture = spec.picture, areas = spec.areas;
  const palette = picture?.palette ?? {};
  const nonogram = genre === "nonogram";
  const panel = genre.startsWith("panel-"), symmetry = panel ? ops.symmetryOf(spec) : null;
  const shapeCells = Array.from({ length: turns }).reduce<RC[]>((cs) => ops.turnShape(cs), ops.SHAPES[shapeAt].cells);
  const shapeSymbol: ops.PanelSymbol = { kind: "shape", value: shapeCells, ...(canTurn ? { rotate: true } : {}), ...(hollow ? { negative: true } : {}) };
  const letters = spec.style?.symbols ?? (genres[genre]?.style as { symbols?: string } | undefined)?.symbols ?? "ABCDEFGHI";

  // leave room outside the grid where clues can be added there
  const room: Room = toolList.includes("outside-number") || toolList.includes("outside-letter") ? { top: 38, left: 38, right: 38, bottom: 38 }
    : toolList.includes("door") ? { top: 50, left: 50, right: 54, bottom: 54 }
      : toolList.includes("total") ? { top: 40, left: 40 } : {};

  // drawn even while unfinished (a maze missing a door, an area in two pieces), so it can be fixed
  let puzzle: Puzzle | null = null, problem = "";
  try { puzzle = makePuzzle(spec, { unfinished: true }); } catch (e) { problem = (e as Error).message; }
  const undecided = useMemo(() => (puzzle && puzzle.rowRuns.size ? undecidedCells(puzzle) ?? [] : []), [spec]); // eslint-disable-line react-hooks/exhaustive-deps
  const svg = useMemo(() => (puzzle ? pictureSvg(puzzle, null, "The puzzle", { picture: true, undecided: ambiguous ? undecided : [], room }) : ""),
    [spec, ambiguous, undecided]); // eslint-disable-line react-hooks/exhaustive-deps
  const lay = puzzle && pictureLayout(puzzle, room);
  useEffect(() => {
    if (!flash) return;
    setFlashing(true);
    const t = setTimeout(() => setFlashing(false), 1300);
    return () => clearTimeout(t);
  }, [flash]);

  // the newest version, updated as soon as it changes: a drag's steps build on each other even
  // before the page has drawn the last one
  const latest = useRef(spec);
  latest.current = spec;
  const change = (next: Spec, continuing = false) => { latest.current = next; onChange(next, continuing); };

  // ---- where a pointer is, in the board's units ----
  const boardSvg = () => box.current?.querySelector(".grid-game svg") as SVGSVGElement | null;
  const hitAt = (clientX: number, clientY: number) => {
    const el = boardSvg();
    if (!el || !lay) return null;
    const pt = el.createSVGPoint(); pt.x = clientX; pt.y = clientY;
    const { x, y } = pt.matrixTransform(el.getScreenCTM()!.inverse());
    const gx = (x - lay.ML) / lay.S, gy = (y - lay.MT) / lay.S;   // in squares, from the grid's top-left
    return { gx, gy, r: Math.floor(gy), c: Math.floor(gx) };
  };
  type Hit = NonNullable<ReturnType<typeof hitAt>>;
  const inGrid = (h: Hit) => h.r >= 0 && h.c >= 0 && h.r < rows && h.c < cols;
  /** the line between two squares nearest the pointer (inside the grid) */
  const borderAt = (h: Hit): [RC, RC] | null => {
    if (!inGrid(h)) return null;
    const fx = h.gx - h.c, fy = h.gy - h.r;
    const near = [
      { d: 1 - fx, b: h.c + 1 < cols ? [[h.r, h.c], [h.r, h.c + 1]] : null },
      { d: fx, b: h.c > 0 ? [[h.r, h.c - 1], [h.r, h.c]] : null },
      { d: 1 - fy, b: h.r + 1 < rows ? [[h.r, h.c], [h.r + 1, h.c]] : null },
      { d: fy, b: h.r > 0 ? [[h.r - 1, h.c], [h.r, h.c]] : null },
    ].filter((n) => n.b).sort((a, b) => a.d - b.d)[0];
    return near ? (near.b as [RC, RC]) : null;
  };
  /** the slot just outside the grid beside a row or column */
  const outsideAt = (h: Hit): { cell: RC; side: Side } | null => {
    const { gx, gy } = h;
    const inRows = gy >= 0 && gy < rows, inCols = gx >= 0 && gx < cols;
    if (inRows && gx < 0 && gx > -1.4) return { cell: [Math.floor(gy), 0], side: "left" };
    if (inRows && gx >= cols && gx < cols + 1.4) return { cell: [Math.floor(gy), cols - 1], side: "right" };
    if (inCols && gy < 0 && gy > -1.4) return { cell: [0, Math.floor(gx)], side: "top" };
    if (inCols && gy >= rows && gy < rows + 1.4) return { cell: [rows - 1, Math.floor(gx)], side: "bottom" };
    return null;
  };
  const cornerAt = (h: Hit): RC | null => {
    const r = Math.round(h.gy), c = Math.round(h.gx);
    return r >= 0 && c >= 0 && r <= rows && c <= cols && Math.hypot(h.gy - r, h.gx - c) < 0.35 ? [r, c] : null;
  };
  /** half-square steps: [2r+1, 2c+1] is a square's centre */
  const pointAt = (h: Hit): RC => [Math.max(1, Math.min(2 * rows - 1, Math.round(h.gy * 2))), Math.max(1, Math.min(2 * cols - 1, Math.round(h.gx * 2)))];

  // ---- typing a value into the board ----
  const toPx = (x: number, y: number) => {
    const el = boardSvg(), b = box.current?.getBoundingClientRect();
    if (!el || !b || !lay) return { left: 0, top: 0 };
    const r = el.getBoundingClientRect();
    return { left: r.left - b.left + (x / lay.W) * r.width, top: r.top - b.top + (y / lay.H) * r.height };
  };
  const cellCenter = ([r, c]: RC) => (lay ? { x: lay.ML + (c + 0.5) * lay.S, y: lay.MT + (r + 0.5) * lay.S } : { x: 0, y: 0 });
  const typingSpot = (t: Typing) => {
    if (!lay) return { x: 0, y: 0 };
    const { S, ML, MT } = lay;
    switch (t.kind) {
      case "number": case "compass": return cellCenter(t.cell);
      case "runs": case "total": return t.at === "row" ? { x: ML - S * 0.6, y: MT + (t.index + 0.5) * S } : { x: ML + (t.index + 0.5) * S, y: MT - S * 0.5 };
      case "outside": {
        const { x, y } = cellCenter(t.cell), d = S * 0.9;
        return t.side === "top" ? { x, y: y - d } : t.side === "bottom" ? { x, y: y + d } : t.side === "left" ? { x: x - d, y } : { x: x + d, y };
      }
      case "corner": return { x: ML + t.corner[1] * S, y: MT + t.corner[0] * S };
    }
  };
  const valueOf = (t: Typing, gs: Given[] = latest.current.givens ?? []): string => {
    switch (t.kind) {
      case "number": { const g = gs.find((x) => x.at === "cell" && same(x.cell, t.cell) && x.kind === "number"); return g && g.kind === "number" ? String(g.value) : ""; }
      case "runs": { const g = gs.find((x) => x.at === t.at && x.index === t.index && x.kind === "runs"); return g && g.kind === "runs" ? runsText(g.value) : ""; }
      case "total": { const g = gs.find((x) => x.at === t.at && x.index === t.index && x.kind === "total"); return g && g.kind === "total" ? String(g.value) : ""; }
      case "outside": {
        const g = gs.find((x) => x.at === "edge" && same(x.cell, t.cell) && x.side === t.side && x.kind !== "door");
        return g && g.at === "edge" && g.kind !== "door" ? (t.letter ? letters[g.value - 1] ?? "" : String(g.value)) : "";
      }
      case "corner": { const g = gs.find((x) => x.at === "corner" && same(x.corner, t.corner)); return g && g.kind === "count" ? String(g.value) : ""; }
      case "compass": {
        const g = gs.find((x) => x.at === "cell" && same(x.cell, t.cell) && x.kind === "compass");
        return g && g.kind === "compass" ? (["n", "e", "s", "w"] as const).map((d) => g.value[d] ?? "-").join(" ") : "";
      }
    }
  };
  const startTyping = (t: Typing) => setTyping({ ...t, value: valueOf(t) });
  /** the value typed, applied; then (a square's number) on to the next square */
  function applyTyping(t: Typing, text: string, advance: boolean) {
    const cur = latest.current;
    const v = text.trim(), n = parseInt(v, 10), num = Number.isInteger(n) && n >= 0 ? n : null;
    let next = cur;
    switch (t.kind) {
      case "number": next = ops.setNumber(cur, t.cell, num); break;
      case "runs": next = ops.setLine(cur, t.at, t.index, { kind: "runs", value: parseRuns(v) }); break;
      case "total": next = ops.setLine(cur, t.at, t.index, num === null ? null : { kind: "total", value: num }); break;
      case "outside": {
        const k = letters.toLowerCase().indexOf(v.toLowerCase());
        const value = !v ? null : t.letter ? (v.length === 1 && k >= 0 ? k + 1 : num) : num;
        next = ops.setOutside(cur, t.cell, t.side, t.letter ? "first" : "skyscraper", value);
        break;
      }
      case "corner": next = ops.setCorner(cur, t.corner, num); break;
      case "compass": {
        const parts = v.split(/[\s,]+/).filter(Boolean), value: Record<string, number> = {};
        (["n", "e", "s", "w"] as const).forEach((d, k) => { const x = parseInt(parts[k] ?? "", 10); if (Number.isInteger(x) && x >= 0) value[d] = x; });
        next = ops.setCompass(cur, t.cell, value);
        break;
      }
    }
    if (next !== cur) change(next);
    if (advance && t.kind === "number") {
      const k = t.cell[0] * cols + t.cell[1] + 1;
      if (k < rows * cols) {
        const nt: Typing = { kind: "number", cell: [Math.floor(k / cols), k % cols] };
        setTyping({ ...nt, value: valueOf(nt, next.givens ?? []) });
        return;
      }
    }
    setTyping(null);
  }

  // ---- touching the board ----
  /** the clue nearest the pointer, removed (null: nothing there) */
  const erasedAt = (h: Hit): Spec | null => {
    const cur = latest.current;
    const o = outsideAt(h), cn = cornerAt(h), b = borderAt(h), pt = pointAt(h);
    const keep = (pred: (g: Given) => boolean) => { const next = ops.removeGivens(cur, pred); return next !== cur ? next : null; };
    const nearLine = Math.min(Math.abs(h.gx - Math.round(h.gx)), Math.abs(h.gy - Math.round(h.gy))) < 0.2;
    const ln = ops.lineNear(cur.size, h.gx, h.gy, 0.2);
    const corner = (c: RC) => { const next = ops.eraseCorner(cur, c); return next !== cur ? next : null; };
    return (cn && corner(cn))
      ?? (ln && keep((g) => ops.onLine(g, ln)))
      ?? (o && keep((g) => g.at === "edge" && same(g.cell, o.cell) && g.side === o.side))
      ?? (Math.hypot(h.gy * 2 - pt[0], h.gx * 2 - pt[1]) < 0.5 ? keep((g) => g.at === "point" && same(g.point, pt)) : null)
      ?? (b && nearLine ? keep((g) => onBorder(g, ...b)) : null)
      ?? (inGrid(h) ? keep((g) => g.at === "cell" && same(g.cell, [h.r, h.c])) : null)
      ?? (inGrid(h) ? keep((g) => g.at === "cells" && g.cells.some((x) => same(x, [h.r, h.c]))) : null)
      ?? (h.gx < 0 && h.r >= 0 && h.r < rows ? keep((g) => g.at === "row" && g.index === h.r) : null)
      ?? (h.gy < 0 && h.c >= 0 && h.c < cols ? keep((g) => g.at === "col" && g.index === h.c) : null);
  };

  function down(evt: React.PointerEvent) {
    if ((evt.target as Element).closest(".be-clue")) return;
    const h = hitAt(evt.clientX, evt.clientY);
    if (!h || !lay) return;
    evt.preventDefault();   // keeps focus where it is (a box opened below would lose it)
    // a value being typed is kept (the box doesn't lose focus, so it wouldn't save itself)
    if (typing && typed.current) applyTyping(typing, typed.current.value, false);
    const cell: RC = [h.r, h.c];
    const capture = () => (evt.target as Element).setPointerCapture?.(evt.pointerId);
    const gs = latest.current.givens ?? [];

    if (nonogram) {
      if (inGrid(h) && picture) {
        // a fill tool: a square fills with the color, or clears if it's that color already
        const here = picture.rows[h.r]?.[h.c] ?? ".";
        let pal = palette, letter = Object.keys(pal).find((k) => k !== "." && sameColor(pal[k], ink));
        if (!letter) { letter = [...LETTERS].find((l) => !(l in pal))!; pal = { ...pal, [letter]: ink }; }
        stroke.current = { kind: "paint", value: here === letter ? "." : letter, palette: pal };
        paintAt(h, false); capture();
      } else if (!picture && h.gx < 0 && h.r >= 0 && h.r < rows) startTyping({ kind: "runs", at: "row", index: h.r });
      else if (!picture && h.gy < 0 && h.c >= 0 && h.c < cols) startTyping({ kind: "runs", at: "col", index: h.c });
      return;
    }
    switch (tool) {
      case "number": if (inGrid(h)) startTyping({ kind: "number", cell }); return;
      case "compass": if (inGrid(h)) startTyping({ kind: "compass", cell }); return;
      case "block": {
        if (!inGrid(h)) return;
        stroke.current = { kind: "block", on: !ops.hasBlock(latest.current, cell) }; blockAt(h, false); capture(); return;
      }
      case "symbol": if (inGrid(h)) change(ops.toggleSymbol(latest.current, cell)); return;
      case "pearl": if (inGrid(h)) change(ops.cyclePearl(latest.current, cell)); return;
      case "wall": case "diamond": { const b = borderAt(h); if (b) change(ops.toggleBorder(latest.current, ...b, tool)); return; }
      case "galaxy": if (h.gx >= 0 && h.gy >= 0 && h.gx <= cols && h.gy <= rows) change(ops.toggleGalaxy(latest.current, pointAt(h))); return;
      case "thermo": {
        if (!inGrid(h)) return;
        stroke.current = { kind: "thermo", cells: [cell] }; setDrawing([cell]); capture(); return;
      }
      case "door": { const o = outsideAt(h); if (o) change(ops.cycleDoor(latest.current, o.cell, o.side)); return; }
      case "outside-number": case "outside-letter": { const o = outsideAt(h); if (o) startTyping({ kind: "outside", ...o, letter: tool === "outside-letter" }); return; }
      case "corner": { const cn = cornerAt(h); if (cn) startTyping({ kind: "corner", corner: cn }); return; }
      case "total": {
        if (h.gx < 0 && h.r >= 0 && h.r < rows) startTyping({ kind: "total", at: "row", index: h.r });
        else if (h.gy < 0 && h.c >= 0 && h.c < cols) startTyping({ kind: "total", at: "col", index: h.c });
        return;
      }
      case "area": if (inGrid(h) && areas) { stroke.current = { kind: "area" }; areaAt(h, false); capture(); } return;
      case "erase": { const next = erasedAt(h); if (next) change(next); return; }
      // panels: the line's parts on corners and stretches of line, symbols in squares
      case "start": case "end": {
        const cn = ops.cornerNear(spec.size, h.gx, h.gy);
        if (cn) change(tool === "start" ? ops.toggleStart(latest.current, cn) : ops.toggleEnd(latest.current, cn));
        return;
      }
      case "gap": { const ln = ops.lineNear(spec.size, h.gx, h.gy, 0.4); if (ln) change(ops.toggleGap(latest.current, ln)); return; }
      case "dot": { const at = ops.dotSpotNear(spec.size, h.gx, h.gy); if (at) change(ops.toggleDot(latest.current, at, symmetry ? dotColor : undefined)); return; }
      case "square": case "star": if (inGrid(h)) change(ops.toggleCellSymbol(latest.current, cell, { kind: tool, color: symColor[tool] })); return;
      case "triangle": if (inGrid(h)) change(ops.cycleTriangle(latest.current, cell)); return;
      case "shape": if (inGrid(h)) change(ops.toggleCellSymbol(latest.current, cell, shapeSymbol)); return;
      case "eraser": if (inGrid(h)) change(ops.toggleCellSymbol(latest.current, cell, { kind: "eraser" })); return;
    }
  }
  function move(evt: React.PointerEvent) {
    const s = stroke.current;
    if (!s) return;
    const h = hitAt(evt.clientX, evt.clientY);
    if (!h || !inGrid(h)) return;
    if (s.kind === "paint") paintAt(h, true);
    else if (s.kind === "block") blockAt(h, true);
    else if (s.kind === "area") areaAt(h, true);
    else {
      const last = s.cells.at(-1)!, cell: RC = [h.r, h.c];
      if (same(last, cell)) return;
      if (s.cells.length > 1 && same(s.cells.at(-2)!, cell)) s.cells.pop();   // dragging back undoes the last step
      else if (Math.max(Math.abs(last[0] - h.r), Math.abs(last[1] - h.c)) === 1 && !s.cells.some((x) => same(x, cell))) s.cells.push(cell);
      setDrawing([...s.cells]);
    }
  }
  function up() {
    const s = stroke.current;
    stroke.current = null;
    if (s?.kind === "thermo") {
      setDrawing(null);
      // a drag draws a thermometer; a click removes the one there
      change(s.cells.length >= 2 ? ops.addThermo(latest.current, s.cells) : ops.removeThermoAt(latest.current, s.cells[0]));
    }
  }
  function paintAt(h: Hit, continuing: boolean) {
    const s = stroke.current;
    if (!s || s.kind !== "paint" || !inGrid(h)) return;
    const next = ops.paintSquare(latest.current, [h.r, h.c], s.value, s.palette);
    if (next !== latest.current) change(next, continuing);
  }
  function blockAt(h: Hit, continuing: boolean) {
    const s = stroke.current;
    if (!s || s.kind !== "block" || !inGrid(h)) return;
    const next = ops.setBlock(latest.current, [h.r, h.c], s.on);
    if (next !== latest.current) change(next, continuing);
  }
  function areaAt(h: Hit, continuing: boolean) {
    if (!inGrid(h)) return;
    const next = ops.paintArea(latest.current, [h.r, h.c], area);
    if (next !== latest.current) change(next, continuing);
  }
  const resizeTo = (r: number, c: number) => change(ops.resize(spec, r, c));
  const areaLetters = [...new Set((areas ?? []).join(""))].sort();
  const newArea = () => { const k = [...LETTERS].find((l) => !areaLetters.includes(l)); if (k) { setArea(k); setTool("area"); } };
  const addAreas = () => { change(ops.addAreas(spec)); setArea("b"); setTool("area"); };
  const stars = ops.starsOf(spec);

  // ---- doubts: where each is (the box it's about) and its pin just off that box ----
  const target = (p: Pin) => {
    if (!lay) return null;
    const { S, ML, MT } = lay;
    const r0 = p.row ?? 0, r1 = p.row2 ?? r0, c0 = p.col ?? 0, c1 = p.col2 ?? c0;
    const gx = (c: number) => ML + c * S, gy = (r: number) => MT + r * S;
    switch (p.place) {
      case "cell": return { box: [gx(c0), gy(r0), S, S], pin: [gx(c0) + S, gy(r0)] };
      // a nonogram line's numbers are 22 apart, the last 14 before the grid (picture.ts): the pin
      // goes just before the first of them; for other types, just outside the grid
      case "row-clue": {
        const left = nonogram ? ML - 14 - ((puzzle!.rowRuns.get(r0)?.length ?? 1) - 1) * 22 - 11 : ML - S * 0.9;
        return { box: [left, gy(r0) + S * 0.12, ML - 4 - left, S * 0.76], pin: [left - 9, gy(r0) + S / 2] };
      }
      case "column-clue": {
        const top = nonogram ? MT - 14 - ((puzzle!.colRuns.get(c0)?.length ?? 1) - 1) * 22 - 13 : MT - S * 0.9;
        return { box: [gx(c0) + S * 0.12, top, S * 0.76, MT - 4 - top], pin: [gx(c0) + S / 2, top - 9] };
      }
      case "rows": return { box: [ML, gy(r0), cols * S, (r1 - r0 + 1) * S], pin: [ML + cols * S, gy(r0) + ((r1 - r0 + 1) * S) / 2] };
      case "columns": return { box: [gx(c0), MT, (c1 - c0 + 1) * S, rows * S], pin: [gx(c0) + ((c1 - c0 + 1) * S) / 2, MT + rows * S] };
      case "area": return { box: [gx(c0), gy(r0), (c1 - c0 + 1) * S, (r1 - r0 + 1) * S], pin: [gx(c1 + 1), gy(r0)] };
      default: return null;
    }
  };
  const placed = pins.flatMap((p) => { const t = target(p); return t ? [{ p, ...t }] : []; });

  // ---- the toolbar: general to specific (what the player gets, the size, then the tools) ----
  const sizes = SUDOKU_SIZES[genre];
  const showAreas = toolList.includes("area") && (tool === "area" || toolList.length === 1);
  const toolbar = (
    <div className="be-tools">
      {nonogram && (
        <span className="be-group be-seg" role="group" aria-label="What the player gets">
          <button type="button" className="be-btn" aria-pressed={!!picture} onClick={() => !picture && change(ops.toPicture(spec))}
            title="Paint the picture; the numbers follow it">Picture</button>
          <button type="button" className="be-btn" aria-pressed={!picture} onClick={() => picture && change(ops.toNumbers(spec))}
            title="Type each row's and column's numbers yourself">Numbers only</button>
        </span>
      )}
      {sizes ? (
        <span className="be-group be-seg" role="group" aria-label="Size">
          {sizes.map((n) => <button key={n} type="button" className="be-btn" aria-pressed={rows === n && cols === n} onClick={() => resizeTo(n, n)}>{n}×{n}</button>)}
        </span>
      ) : SQUARE.has(genre) ? (
        <span className="be-group be-size">Size <button type="button" className="be-btn" onClick={() => resizeTo(rows - 1, rows - 1)} aria-label="Smaller">−</button><b>{rows}</b><button type="button" className="be-btn" onClick={() => resizeTo(rows + 1, rows + 1)} aria-label="Bigger">+</button></span>
      ) : (
        <>
          <span className="be-group be-size">Rows <button type="button" className="be-btn" onClick={() => resizeTo(rows - 1, cols)} aria-label="Fewer rows">−</button><b>{rows}</b><button type="button" className="be-btn" onClick={() => resizeTo(rows + 1, cols)} aria-label="More rows">+</button></span>
          <span className="be-group be-size">Columns <button type="button" className="be-btn" onClick={() => resizeTo(rows, cols - 1)} aria-label="Fewer columns">−</button><b>{cols}</b><button type="button" className="be-btn" onClick={() => resizeTo(rows, cols + 1)} aria-label="More columns">+</button></span>
        </>
      )}
      {genre === "star-battle" && (
        <span className="be-group be-seg" role="group" aria-label="Stars in each row, column and area">
          {[1, 2, 3].map((n) => <button key={n} type="button" className="be-btn" aria-pressed={stars === n} onClick={() => change(ops.setStars(spec, n))}>{n} star{n > 1 ? "s" : ""}</button>)}
        </span>
      )}
      {symmetry && genre === "panel-symmetry" && (
        <span className="be-group be-seg" role="group" aria-label="Mirrored">
          {SYMMETRIES.map((m) => <button key={m} type="button" className="be-btn" aria-pressed={symmetry === m} onClick={() => change(ops.setSymmetry(spec, m))}
            title="The two lines are mirror images this way">{SYMMETRY_LABELS[m]}</button>)}
        </span>
      )}
      {nonogram && picture && (
        <label className="be-group be-color" title="The color squares fill with (click a square again to clear it)">
          Color <span className="be-pot" style={{ "--c": ink } as React.CSSProperties}><input type="color" value={ink} onChange={(e) => setInk(e.target.value)} /></span>
        </label>
      )}
      {toolList.length > 1 && (
        <span className="be-group be-seg" role="group" aria-label="Tool">
          {toolList.map((t) => <button key={t} type="button" className="be-btn" aria-pressed={tool === t} title={TOOL_HINTS[t]} onClick={() => setTool(t)}>{TOOL_LABELS[t]}</button>)}
        </span>
      )}
      {(tool === "square" || tool === "star") && (
        <span className="be-group be-swatches" role="group" aria-label={`${TOOL_LABELS[tool]} color`}>
          {SYMBOL_COLORS.map((c) => <button key={c} type="button" className="be-swatch" aria-pressed={symColor[tool] === c} aria-label={capital(c)} title={capital(c)}
            onClick={() => setSymColor({ ...symColor, [tool]: c })}><SymbolIcon x={{ kind: tool, color: c }} /></button>)}
        </span>
      )}
      {tool === "dot" && symmetry && (
        <span className="be-group be-seg" role="group" aria-label="Dot color">
          {([undefined, "blue", "yellow"] as const).map((c) => <button key={c ?? "plain"} type="button" className="be-btn" aria-pressed={dotColor === c}
            title={c ? `Passed by the ${c} line` : "Passed by either line"} onClick={() => setDotColor(c)}>{c ? capital(c) : "Plain"}</button>)}
        </span>
      )}
      {tool === "shape" && (
        <span className="be-group be-shapes" role="group" aria-label="Shape">
          {ops.SHAPES.map((x, k) => <button key={x.name} type="button" className="be-swatch" aria-pressed={shapeAt === k} aria-label={x.name} title={x.name}
            onClick={() => { setShapeAt(k); setTurns(0); }}><SymbolIcon x={{ kind: "shape", value: x.cells }} /></button>)}
          <button type="button" className="be-btn be-turn" onClick={() => setTurns((turns + 1) % 4)} title="Turn the shape a quarter turn">
            <SymbolIcon x={shapeSymbol} /> Turn</button>
          <button type="button" className="be-btn" aria-pressed={canTurn} onClick={() => setCanTurn(!canTurn)}
            title="The shape may be turned to fit (drawn tilted)">Can turn</button>
          <button type="button" className="be-btn" aria-pressed={hollow} onClick={() => setHollow(!hollow)}
            title="A hollow shape takes cells away from the others">Hollow</button>
        </span>
      )}
      {showAreas && (areas ? (
        <span className="be-group be-areas" role="group" aria-label="Area to paint">
          {areaLetters.map((k) => <button key={k} type="button" className="be-area" aria-pressed={area === k} aria-label={`Area ${k.toUpperCase()}`}
            style={{ "--h": AREA_HUES(k) } as React.CSSProperties} onClick={() => { setArea(k); setTool("area"); }}>{k.toUpperCase()}</button>)}
          {!areaLetters.includes(area) && <span className="be-area new" aria-pressed="true" style={{ "--h": AREA_HUES(area) } as React.CSSProperties}>{area.toUpperCase()}</span>}
          <button type="button" className="be-btn" onClick={newArea} title="Start a new area, then paint its squares">+ Area</button>
        </span>
      ) : <button type="button" className="be-btn" onClick={addAreas}>Add areas</button>)}
    </div>
  );
  const hint = nonogram ? (picture ? "" : "Click a row's or column's numbers to type them") : TOOL_HINTS[tool];

  // ---- drawn over the board: guides, area tints, slots for clues outside, a thermometer being drawn ----
  const S = lay?.S ?? 48, ML = lay?.ML ?? 0, MT = lay?.MT ?? 0;
  const overlay = lay && (
    <svg className="be-overlay" viewBox={`0 0 ${lay.W} ${lay.H}`} aria-hidden="true">
      {/* faint guide lines where the player's view has none (a maze's walls go on them) */}
      {genre === "maze" && <g className="be-guides">
        {Array.from({ length: rows + 1 }, (_, r) => <line key={`r${r}`} x1={ML} x2={ML + cols * S} y1={MT + r * S} y2={MT + r * S} />)}
        {Array.from({ length: cols + 1 }, (_, c) => <line key={`c${c}`} y1={MT} y2={MT + rows * S} x1={ML + c * S} x2={ML + c * S} />)}
      </g>}
      {areas && showAreas && areas.flatMap((row, r) => [...row].map((k, c) =>
        <rect key={`a${r}-${c}`} x={ML + c * S} y={MT + r * S} width={S} height={S} style={{ fill: `hsl(${AREA_HUES(k)} 75% 55% / .3)` }} />))}
      {(tool === "outside-number" || tool === "outside-letter" || tool === "door") && [
        ...Array.from({ length: cols }, (_, k) => [[k + 0.5, -0.75], [k + 0.5, rows + 0.75]]).flat(),
        ...Array.from({ length: rows }, (_, k) => [[-0.75, k + 0.5], [cols + 0.75, k + 0.5]]).flat(),
      ].map(([cx, cy], i) => <circle key={i} className="be-slot" cx={ML + cx * S} cy={MT + cy * S} r={S * 0.2} />)}
      {tool === "corner" && Array.from({ length: (rows + 1) * (cols + 1) }, (_, i) => (
        <circle key={i} className="be-slot small" cx={ML + (i % (cols + 1)) * S} cy={MT + Math.floor(i / (cols + 1)) * S} r={4} />
      ))}
      {panel && (tool === "start" || tool === "end" || tool === "dot") && Array.from({ length: (rows + 1) * (cols + 1) }, (_, i) => [Math.floor(i / (cols + 1)), i % (cols + 1)] as RC)
        .filter((x) => tool !== "end" || ops.onEdge(spec.size, x))
        .map(([r, c]) => <circle key={`v${r}-${c}`} className="be-slot small" cx={ML + c * S} cy={MT + r * S} r={4} />)}
      {panel && (tool === "gap" || tool === "dot") && [
        ...Array.from({ length: (rows + 1) * cols }, (_, i) => [Math.floor(i / cols), (i % cols) + 0.5]),
        ...Array.from({ length: rows * (cols + 1) }, (_, i) => [Math.floor(i / (cols + 1)) + 0.5, i % (cols + 1)]),
      ].map(([r, c]) => <circle key={`l${r}-${c}`} className="be-slot small" cx={ML + c * S} cy={MT + r * S} r={3} />)}
      {drawing && (
        <g className="be-thermo-draft">
          <polyline points={drawing.map(([r, c]) => `${ML + (c + 0.5) * S},${MT + (r + 0.5) * S}`).join(" ")} />
          <circle cx={ML + (drawing[0][1] + 0.5) * S} cy={MT + (drawing[0][0] + 0.5) * S} r={S * 0.3} />
        </g>
      )}
      {typing && (() => { const { x, y } = typingSpot(typing); return <circle className="be-typing" cx={x} cy={y} r={S * 0.42} />; })()}
      {placed.filter(({ p }) => p.active).map(({ p, box: [x, y, w, h] }) => <rect key={`d${p.n}`} className="be-doubt" x={x} y={y} width={w} height={h} rx={S * 0.08} />)}
    </svg>
  );

  const at = typing && toPx(typingSpot(typing).x, typingSpot(typing).y);
  const typingLabel = !typing ? "" : typing.kind === "number" ? `Row ${typing.cell[0] + 1}, column ${typing.cell[1] + 1}`
    : typing.kind === "runs" || typing.kind === "total" ? (typing.at === "row" ? `Row ${typing.index + 1}` : `Column ${typing.index + 1}`)
      : typing.kind === "outside" ? `${typing.letter ? "Letter" : "Number"} outside`
        : typing.kind === "corner" ? "Corner number" : "North east south west (- for none)";

  return (
    <div className={`board-editor${flashing ? " flashing" : ""}`}>
      {tools && createPortal(toolbar, tools)}
      <div className="be-board" ref={box} data-layout={lay ? JSON.stringify({ ...lay, rows, cols }) : undefined}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        {svg ? <div className="grid-game pic" dangerouslySetInnerHTML={{ __html: svg }} /> : <p className="error">{problem}</p>}
        {overlay}
        {lay && placed.map(({ p, pin: [x, y] }) => (
          <span key={p.n} className={`be-pin${p.active ? " active" : ""}`} aria-hidden="true"
            style={{ left: `${(x / lay.W) * 100}%`, top: `${(y / lay.H) * 100}%` }}>{p.n}</span>
        ))}
        {typing && at && (
          <form key={JSON.stringify([typing.kind, "cell" in typing ? typing.cell : "", "index" in typing ? typing.index : "", "corner" in typing ? typing.corner : "", "side" in typing ? typing.side : ""])}
            className="be-clue" style={{ left: at.left, top: at.top }} onSubmit={(e) => {
              e.preventDefault();
              applyTyping(typing, String(new FormData(e.currentTarget).get("v")), true);
            }}>
            <label>{typingLabel}
              <input ref={typed} name="v" autoFocus autoComplete="off" defaultValue={typing.value} onFocus={(e) => e.currentTarget.select()}
                inputMode={typing.kind === "number" || typing.kind === "total" || typing.kind === "corner" || (typing.kind === "outside" && !typing.letter) ? "numeric" : "text"}
                onBlur={(e) => applyTyping(typing, e.currentTarget.value, false)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") { e.currentTarget.value = typing.value; setTyping(null); return; }
                  // arrow keys move between squares (saving what's typed)
                  const step = STEPS[e.key];
                  if (step && typing.kind === "number") {
                    e.preventDefault();
                    const r = Math.max(0, Math.min(rows - 1, typing.cell[0] + step[0])), c = Math.max(0, Math.min(cols - 1, typing.cell[1] + step[1]));
                    applyTyping(typing, e.currentTarget.value, false);
                    const nt: Typing = { kind: "number", cell: [r, c] };
                    setTyping({ ...nt, value: valueOf(nt) });
                  }
                }} />
            </label>
          </form>
        )}
      </div>
      {hint && <p className="be-hint">{hint}</p>}
    </div>
  );
}
