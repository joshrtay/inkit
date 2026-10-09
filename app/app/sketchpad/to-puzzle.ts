// The drawing → puzzle converter (docs/creation-flow.md, "The converter"): the sketchpad's drawing
// (model.ts) read as a puzzle of one type, deterministically, with no AI. The drawing is the source
// of truth; the puzzle's sketch is always this function's output. from-puzzle.ts's toDrawing is its
// inverse, and the round trip (tests/unit/to-puzzle.test.ts) holds for every example puzzle.
//
//   convert(drawing, genre, settings?) → { spec, used, problems }
//
// Each genre has a profile: the parts of a puzzle its drawing makes (clue kinds, outlined areas, a
// fill-in's list ...). Each part has a reader that takes the drawing's items it understands (a
// number written in a square, a stone, a bold line along the grid lines) and turns them into the
// puzzle. Whatever no reader takes is a problem: it doesn't fit the type, or it isn't on the grid.
// Problems never block converting: what doesn't fit is left out of the puzzle and flagged.
//
//   ** Typed against the engine's lists: a new genre fails the type check until it has a profile
//   ** (PROFILES), and a new clue kind until it has a reader (READERS). See CLAUDE.md.
//
// Pure: no DOM. Fast: one pass over the items per reader.
import { genres, makePuzzle, normalShape, type GenreName } from "~site/engine/puzzle.ts";
import { blockFor, colorName, standardBox, symbolOf, TILE_COLORS, TILE_KINDS, tileCount, tileKinds } from "~site/engine/rules.ts";
import { regionsOf } from "~site/engine/derive.ts";
import { emptyBoard, type Given, type GridSpec, type GridStyle, type Puzzle, type RuleSpec, type Side } from "~site/engine/types.ts";
import { kindName } from "~/games/kinds";
import * as m from "./model";

// ---- what comes out ----

/** What's wrong with the drawing, and where. `items`: the drawing's items it's about (the anchor
 *  for a mark on the paper); `cells`: the grid's squares involved, [row, column] (rule hints point
 *  at these). Kinds:
 *  - `off-type`: on the grid, but not part of this type (a crest in a Sudoku); left out of the puzzle
 *  - `off-grid`: not on the grid (or not where this type has places); left out
 *  - `ambiguous`: read one way, but it could mean another (a thermometer with no bulb); fix to be sure
 *  - `grid`: no grid, or the grid's look isn't the type's
 *  - `unsupported`: the type (RYB) or clue (a palisade mark) can't be drawn in paint yet
 *  - `incomplete`: the puzzle is missing something it needs (a maze's second door)
 *  - `rule`: the clues break a rule already ("Two 5s in row 6"): the verdict is "No solution" */
export interface Problem {
  kind: "off-type" | "off-grid" | "ambiguous" | "grid" | "unsupported" | "incomplete" | "rule";
  text: string;
  items: number[];
  cells?: [number, number][];
}

/** The type's settings that aren't drawn: the Rules panel (a puzzle's own rules) and the Look
 *  panel (style); they go into the puzzle as they are. */
export type Settings = Pick<GridSpec, "rules" | "style" | "marks" | "hearts">;

export interface Conversion {
  /** the puzzle, or null when there's none to make (no grid; a type paint can't make yet) */
  spec: GridSpec | null;
  /** the items that went into the puzzle */
  used: Set<number>;
  problems: Problem[];
}

/** The problems that mean the puzzle has no solution as drawn (the verdict says "No solution"). */
export const breaksRules = (problems: Problem[]) => problems.some((p) => p.kind === "rule");

// ---- profiles: what each type's drawing makes ----

/** A part of a puzzle a drawing can make: a clue kind, or one of the spec's own parts. */
export type Part = Given["kind"] | "areas" | "entries" | "picture" | "box-lines" | "major-lines";

/** `reads`: the parts, each read by its reader (READERS) in READ_ORDER, so where two could take
 *  an item the order decides (a door's arrow before walls; a sudoku's box lines before areas).
 *  `look`: the grid's look in paint (the type fixes it). `lines`: what to say about lines the
 *  type has no use for. */
export interface Profile { reads: Part[]; look?: m.Grid["shape"] | "tracks" | "lines"; lines?: string }

const SUDOKU: Part[] = ["number", "box-lines", "areas"];
/** Every genre's profile; null: paint can't make this type yet. */
export const PROFILES: Record<GenreName, Profile | null> = {
  slitherlink: { reads: ["number"] },
  nurikabe: { reads: ["number"] },
  "simple-loop": { reads: ["block", "wall"] },
  "simple-path": { reads: ["door", "block", "wall"] },
  "star-battle": { reads: ["areas"] },
  akari: { reads: ["block", "number"] },
  shikaku: { reads: ["number"] },
  numberlink: { reads: ["number"] },
  masyu: { reads: ["pearl"] },
  cave: { reads: ["number"] },
  aquarium: { reads: ["areas", "total"] },
  "square-jam": { reads: ["number"] },
  "wittgenstein-briquet": { reads: ["number"] },
  hitori: { reads: ["number"] },
  minesweeper: { reads: ["number"] },
  "spiral-galaxies": { reads: ["galaxy"] },
  "thermo-sudoku": { reads: [...SUDOKU, "thermo"] },
  skyscrapers: { reads: ["number", "skyscraper"] },
  "easy-as-abc": { reads: ["number", "first"] },
  "irregular-sudoku": { reads: SUDOKU },
  nonogram: { reads: ["runs", "picture", "major-lines"] },
  sudoku: { reads: SUDOKU },
  maze: { reads: ["door", "count", "wall"] },
  // RYB is a figure of pieces, not a grid: it stays on the figure editor until paint can draw it
  coats: null,
  panel: { reads: ["start", "end", "hexagon", "gap", "square", "star", "triangle", "shape", "eraser"], look: "tracks",
    lines: "The player draws the line: break a track with the eraser instead" },
  panes: { reads: ["block", "number", "symbol", "compass", "palisade", "wall", "twins", "opposites", "inequality", "difference", "watchtower", "shape", "bank"] },
  "binary-puzzle": { reads: ["color"] },
  "abstract-art": { reads: ["color"] },
  "fill-in": { reads: ["block", "number", "entries"] },
  hidoku: { reads: ["block", "number"] },
  "honeycomb-paths": { reads: ["block", "number"], look: "hex" },
  hive: { reads: ["block", "number"], look: "hex" },
  "pythagorean-paths": { reads: ["peg", "lengths"], look: "dots" },
  fillomino: { reads: ["number"] },
  "sum-blobs": { reads: ["number"] },
  "polyomino-packing": { reads: ["block", "bank"] },
  "connect-the-critters": { reads: ["symbol", "bank"] },
  "find-the-cut-line": { reads: ["block"] },
  "twins-and-triplets": { reads: ["block", "number"] },
};

// ---- where things are ----

interface P { r: number; c: number }
type Edge = { side: "top" | "left"; r: number; c: number };
type StrokePart =
  | { kind: "edges"; edges: Edge[]; len: number; claimed?: boolean }
  | { kind: "centres"; cells: [number, number][]; len: number; claimed?: boolean }
  | { kind: "off"; len: number; claimed?: boolean };
type Stroke = Extract<m.Item, { kind: "pen" | "line" }>;
type Text = Extract<m.Item, { kind: "text" }>;
type StampItem = Extract<m.Item, { kind: "stamp" }>;

/** How close a loose point must be to a place to be read as on it, in squares. */
const SNAP = 0.25;
/** A stroke's samples are this far apart, in squares. */
const STEP = 1 / 6;
/** A sample this close to a grid line is on it. */
const ON_LINE = 0.15;
/** A part of a mixed stroke shorter than this is a slip of the pen, and ignored. */
const SLIP = 0.75;

const SIDES = { top: [-1, 0], bottom: [1, 0], left: [0, -1], right: [0, 1] } as const;

class Ctx {
  readonly g: m.Grid; readonly rows: number; readonly cols: number; readonly hex: boolean;
  /** the items no reader has taken yet */
  readonly free = new Map<number, m.Item>();
  readonly strokes = new Map<number, StrokePart[]>();
  readonly out: { given: Given; items: number[] }[] = [];
  readonly used = new Set<number>();
  readonly problems: Problem[] = [];
  areas?: string[]; entries?: string[]; picture?: GridSpec["picture"];

  constructor(readonly d: m.Drawing, readonly genre: GenreName, readonly profile: Profile, readonly rules: RuleSpec[], readonly style: GridStyle) {
    this.g = d.grid!; this.rows = this.g.rows; this.cols = this.g.cols; this.hex = this.g.shape === "hex";
    for (const it of d.items) {
      this.free.set(it.id, it);
      if (it.kind === "pen" || it.kind === "line") this.strokes.set(it.id, this.hex ? [{ kind: "off", len: 1 }] : resolveStroke(strokePoints(this, it), this.rows, this.cols));
    }
  }
  get name() { return kindName(this.genre); }
  rule(name: string) { return this.rules.find((s) => s.rule === name); }

  /** An item goes into the puzzle. */
  take(...ids: number[]) { for (const id of ids) { this.free.delete(id); this.used.add(id); } }
  /** A clue made from these items; strokes stay free until each of their parts is settled (claim). */
  give(given: Given, ...items: number[]) {
    this.out.push({ given, items });
    for (const id of items) if (this.strokes.has(id)) this.used.add(id); else this.take(id);
  }
  problem(kind: Problem["kind"], text: string, items: number[], cells?: [number, number][]) {
    this.problems.push({ kind, text, items, ...(cells ? { cells } : {}) });
  }

  /** The free items of a kind. */
  each<K extends m.Item["kind"]>(kind: K): Extract<m.Item, { kind: K }>[] {
    return [...this.free.values()].filter((it): it is Extract<m.Item, { kind: K }> => it.kind === kind);
  }
  stamps(...kinds: m.StampKind[]) { return this.each("stamp").filter((s) => kinds.includes(s.stamp)); }

  /** Where an anchor is, in squares from the grid's top-left corner. */
  at(a: m.Anchor): P { const p = m.pointOf(this.g, a); return { r: (p.y - this.g.y) / this.g.S, c: (p.x - this.g.x) / this.g.S }; }
  inside(r: number, c: number) { return r >= 0 && c >= 0 && r < this.rows && c < this.cols; }

  /** The square an anchor is on (the grid's, or the ring just outside it): a square's centre, or a
   *  loose point close to one. */
  cell(a: m.Anchor): [number, number] | null {
    if (a.at === "cell") return [a.r, a.c];
    if (a.at !== "grid" && a.at !== "page") return null;
    const p = this.at(a);
    if (this.hex) {
      const near = m.cellAt(this.g, m.pointOf(this.g, a));
      if (!near) return null;
      const q = this.at(near);
      return Math.hypot(q.r - p.r, q.c - p.c) <= SNAP ? [near.r, near.c] : null;
    }
    const r = Math.floor(p.r), c = Math.floor(p.c);
    return Math.hypot(p.r - r - 0.5, p.c - c - 0.5) <= SNAP && r >= -1 && c >= -1 && r <= this.rows && c <= this.cols ? [r, c] : null;
  }
  /** A square inside the grid. */
  gridCell(a: m.Anchor) { const x = this.cell(a); return x && this.inside(...x) ? x : null; }
  /** A corner where grid lines meet. */
  corner(a: m.Anchor): [number, number] | null {
    if (this.hex) return null;
    if (a.at === "corner") return [a.r, a.c];
    if (a.at !== "grid" && a.at !== "page") return null;
    const p = this.at(a), r = Math.round(p.r), c = Math.round(p.c);
    return Math.hypot(p.r - r, p.c - c) <= SNAP && r >= 0 && c >= 0 && r <= this.rows && c <= this.cols ? [r, c] : null;
  }
  /** The middle of a stretch of grid line. */
  edge(a: m.Anchor): Edge | null {
    if (this.hex) return null;
    if (a.at === "edge") return { side: a.side, r: a.r, c: a.c };
    if (a.at !== "grid" && a.at !== "page") return null;
    const p = this.at(a);
    const top = { side: "top" as const, r: Math.round(p.r), c: Math.floor(p.c) }, left = { side: "left" as const, r: Math.floor(p.r), c: Math.round(p.c) };
    for (const e of [top, left]) {
      const mid = e.side === "top" ? { r: e.r, c: e.c + 0.5 } : { r: e.r + 0.5, c: e.c };
      if (Math.hypot(p.r - mid.r, p.c - mid.c) <= SNAP && edgeOnGrid(e, this.rows, this.cols)) return e;
    }
    return null;
  }
  /** An edge's two cells (either may be outside the grid). */
  edgeCells(e: Edge): [[number, number], [number, number]] {
    return e.side === "top" ? [[e.r - 1, e.c], [e.r, e.c]] : [[e.r, e.c - 1], [e.r, e.c]];
  }
  interior(e: Edge) { return e.side === "top" ? e.r > 0 && e.r < this.rows : e.c > 0 && e.c < this.cols; }
  edgeCorners(e: Edge): [[number, number], [number, number]] {
    return e.side === "top" ? [[e.r, e.c], [e.r, e.c + 1]] : [[e.r, e.c], [e.r + 1, e.c]];
  }

  /** The free texts, with where they are. */
  texts() { return this.each("text").map((t) => ({ t, p: this.at(t.at) })); }

  /** The free stroke parts of these kinds, with their strokes. */
  parts<K extends StrokePart["kind"]>(kind: K, only?: (s: Stroke) => boolean) {
    const out: { s: Stroke; part: Extract<StrokePart, { kind: K }> }[] = [];
    for (const [id, parts] of this.strokes) {
      const s = this.free.get(id) as Stroke | undefined;
      if (!s || (only && !only(s))) continue;
      for (const part of parts) if (part.kind === kind && !part.claimed) out.push({ s, part: part as Extract<StrokePart, { kind: K }> });
    }
    return out;
  }
  /** A stroke part goes into the puzzle; the stroke is used once any part is (settled at the end). */
  claim(s: Stroke, part: StrokePart) { part.claimed = true; this.used.add(s.id); }
  /** A whole stroke goes into the puzzle (a door's arrow, a compass's cross). */
  takeStroke(s: Stroke) { for (const part of this.strokes.get(s.id) ?? []) part.claimed = true; this.take(s.id); }
}

const edgeOnGrid = (e: Edge, rows: number, cols: number) => e.side === "top"
  ? e.r >= 0 && e.r <= rows && e.c >= 0 && e.c < cols : e.r >= 0 && e.r < rows && e.c >= 0 && e.c <= cols;
const edgeKey = (e: Edge) => `${e.side}${e.r},${e.c}`;

function strokePoints(cx: Ctx, s: Stroke): P[] {
  return (s.kind === "pen" ? s.points : [s.from, s.to]).map((a) => cx.at(a));
}

// ---- resolving pen lines ----

/** What a stroke follows, part by part: grid lines (as the stretches it covers), square centres
 *  (as the squares it joins), or neither. Sampled every ⅙ square; a part of a mixed stroke under
 *  ¾ square is a slip and left out (its `len` says so). */
export function resolveStroke(pts: P[], rows: number, cols: number): StrokePart[] {
  const samples: P[] = pts.length ? [pts[0]] : [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(Math.hypot(b.r - a.r, b.c - a.c) / STEP));
    for (let k = 1; k <= n; k++) samples.push({ r: a.r + ((b.r - a.r) * k) / n, c: a.c + ((b.c - a.c) * k) / n });
  }
  const total = pts.slice(1).reduce((s, b, i) => s + Math.hypot(b.r - pts[i].r, b.c - pts[i].c), 0);
  if (samples.length < 2 || total < 0.2) return [{ kind: "off", len: total }];
  const near = (v: number) => Math.abs(v - Math.round(v));
  const label = (p: P): "L" | "C" | "O" => {
    const inside = p.r >= -ON_LINE && p.c >= -ON_LINE && p.r <= rows + ON_LINE && p.c <= cols + ON_LINE;
    if (inside && Math.min(near(p.r), near(p.c)) <= ON_LINE) return "L";
    return p.r > 0 && p.c > 0 && p.r < rows && p.c < cols ? "C" : "O";
  };
  // runs of one label, each with its samples and length
  type Run = { l: "L" | "C" | "O"; s: P[] };
  let runs: Run[] = [];
  for (const p of samples) {
    const l = label(p), last = runs[runs.length - 1];
    if (last && last.l === l) last.s.push(p); else runs.push({ l, s: [p] });
  }
  const lenOf = (r: Run) => r.s.length * STEP;
  // a stroke across the squares crosses grid lines briefly; a stroke along a line wobbles off it briefly
  const merge = () => {
    const out: Run[] = [];
    for (const r of runs) { const last = out[out.length - 1]; if (last && last.l === r.l) last.s.push(...r.s); else out.push(r); }
    runs = out;
  };
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i], before = runs[i - 1]?.l, after = runs[i + 1]?.l;
    if (r.l === "L" && lenOf(r) < SLIP && (before ?? after) === "C" && (after ?? before) === "C") r.l = "C";
  }
  merge();
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i], before = runs[i - 1]?.l, after = runs[i + 1]?.l;
    if (r.l !== "L" && lenOf(r) < 0.5 && before === "L" && after === "L") r.l = "L";
  }
  merge();
  const parts = runs.map((run): StrokePart => {
    const len = lenOf(run);
    if (run.l === "L") {
      const seen = new Map<string, Edge>();
      for (const p of run.s) {
        const dr = near(p.r), dc = near(p.c);
        if (dr <= ON_LINE && dc <= ON_LINE) continue;   // at a corner: on both lines
        const e: Edge = dr <= dc ? { side: "top", r: Math.round(p.r), c: Math.floor(p.c) } : { side: "left", r: Math.floor(p.r), c: Math.round(p.c) };
        if (edgeOnGrid(e, rows, cols)) seen.set(edgeKey(e), e);
      }
      return seen.size ? { kind: "edges", edges: [...seen.values()], len } : { kind: "off", len };
    }
    if (run.l === "C") {
      // the squares whose centres it passes near, in the order it reaches them
      const cells: [number, number][] = [];
      for (const p of run.s) {
        const r = Math.floor(p.r), c = Math.floor(p.c);
        if (Math.hypot(p.r - r - 0.5, p.c - c - 0.5) <= 0.3 && !cells.some(([y, x]) => y === r && x === c)) cells.push([r, c]);
      }
      const joined = cells.length >= 2 && cells.every(([r, c], k) => !k || Math.max(Math.abs(r - cells[k - 1][0]), Math.abs(c - cells[k - 1][1])) === 1);
      return joined ? { kind: "centres", cells, len } : { kind: "off", len };
    }
    return { kind: "off", len };
  });
  if (parts.length > 1) for (const p of parts) if (p.len < SLIP) p.claimed = true;   // slips: nothing to read, nothing to flag
  return parts;
}

// ---- reading numbers ----

const INT = /^\d+$/;
/** A number written in a square, as the type writes them: its symbols (Easy as ABC's letters, a
 *  fill-in's 0-9), an Akari cipher's letter, or digits. */
function numberOf(cx: Ctx, text: string): Given | null {
  const t = text.trim();
  if (cx.style.symbols) { const k = cx.style.symbols.indexOf(t); return t.length === 1 && k >= 0 ? { at: "cell", cell: [0, 0], kind: "number", value: k + 1 } : null; }
  if (cx.genre === "akari" && /^[A-Z]$/.test(t)) return { at: "cell", cell: [0, 0], kind: "number", value: 0, letter: t };
  return INT.test(t) ? { at: "cell", cell: [0, 0], kind: "number", value: Number(t) } : null;
}
/** Numbers written in one place, separated by spaces or commas ("1 2", "3,1"). */
const numbersIn = (t: string) => t.split(/[\s,]+/).filter(Boolean);

/** A list's word as a length ("√5" is 5, "2" is 4). */
function lengthOf(w: string): number | null {
  const root = /^√(\d+)$/.exec(w);
  if (root) return Number(root[1]);
  return INT.test(w) ? Number(w) ** 2 : null;
}

/** Where the type's colours go: wash names against its palette. */
function paletteNames(cx: Ctx): string[] {
  const p = { style: cx.style } as Puzzle;
  return Array.from({ length: cx.style.palette?.length || 2 }, (_, k) => colorName(p, k + 1));
}
const WASH_HEX: Record<m.WashColor, string> = { red: "#ef5a6a", orange: "#f29a38", yellow: "#f7cf3d", green: "#7cc68f", blue: "#3fb0e6", purple: "#a77bd6", pink: "#f07ab8" };

// ---- the readers: drawing items → parts of the puzzle ----

type Reader = (cx: Ctx) => void;

/** Texts in squares of the grid, each square's newest, with the others flagged. */
function cellTexts(cx: Ctx, accept: (t: Text) => boolean) {
  const by = new Map<string, Text[]>();
  for (const { t } of cx.texts()) {
    const at = cx.gridCell(t.at);
    if (at && accept(t)) by.set(`${at}`, [...(by.get(`${at}`) ?? []), t]);
  }
  return [...by.values()].map((ts) => {
    if (ts.length > 1) cx.problem("ambiguous", "Two things written in one square: only the last one counts", ts.map((t) => t.id), [cx.gridCell(ts[0].at)!]);
    for (const t of ts.slice(0, -1)) cx.take(t.id);
    return { t: ts[ts.length - 1], cell: cx.gridCell(ts[0].at)! };
  });
}
/** Stamps in squares of the grid. */
const cellStamps = (cx: Ctx, ...kinds: m.StampKind[]) =>
  cx.stamps(...kinds).flatMap((s) => { const cell = cx.gridCell(s.at); return cell ? [{ s, cell }] : []; });
/** Texts in the ring of squares just outside the grid, with the side they're on and the square they look into. */
function ringTexts(cx: Ctx) {
  return cx.texts().flatMap(({ t }) => {
    const at = cx.cell(t.at);
    if (!at || cx.inside(...at)) return [];
    const [r, c] = at, inRow = r >= 0 && r < cx.rows, inCol = c >= 0 && c < cx.cols;
    const side: Side | null = inCol && r === -1 ? "top" : inCol && r === cx.rows ? "bottom" : inRow && c === -1 ? "left" : inRow && c === cx.cols ? "right" : null;
    if (!side) return [];
    const cell: [number, number] = side === "top" ? [0, c] : side === "bottom" ? [cx.rows - 1, c] : side === "left" ? [r, 0] : [r, cx.cols - 1];
    return [{ t, side, cell }];
  });
}
/** Small writing on a corner or on a stretch of grid line. */
const cornerTexts = (cx: Ctx) => cx.texts().flatMap(({ t }) => { const corner = t.at.at === "cell" || t.at.at === "inset" ? null : cx.corner(t.at); return corner ? [{ t, corner }] : []; });
const edgeTexts = (cx: Ctx) => cx.texts().flatMap(({ t }) => { const e = t.at.at === "cell" || t.at.at === "inset" ? null : cx.edge(t.at); return e ? [{ t, e }] : []; });
/** Writing under the grid (a fill-in's list, a lattice's lengths): loose, below the last row. */
const belowTexts = (cx: Ctx) => cx.texts().filter(({ t, p }) => p.r > cx.rows + 0.05 && t.at.at !== "cell").map(({ t }) => t);

/** Text read as a number clue; a reader for the kinds a number goes in. */
const numberReader: Reader = (cx) => {
  const tiles = cx.rule("tiles") ?? (cx.genre === "twins-and-triplets" ? genres["twins-and-triplets"].rules[0] : undefined);
  if (tiles) {
    // Twins and Triplets: a tile is its shape's stamp in its colour
    for (const { s, cell } of cellStamps(cx, ...TILE_KINDS)) {
      const k = TILE_KINDS.indexOf(s.stamp as typeof TILE_KINDS[number]), c = TILE_COLORS.indexOf((s.color ?? "") as typeof TILE_COLORS[number]);
      if (k >= tileKinds(tiles) || c < 0 || c * tileKinds(tiles) + k >= tileCount(tiles)) continue;
      cx.give({ at: "cell", cell, kind: "number", value: c * tileKinds(tiles) + k + 1 }, s.id);
    }
    return;
  }
  for (const { t, cell } of cellTexts(cx, (t) => !!numberOf(cx, t.text))) {
    const n = numberOf(cx, t.text)!;
    cx.give({ ...n, cell } as Given, t.id);
  }
};

export const READERS: Record<Part, Reader | null> = {
  number: numberReader,
  block: (cx) => { for (const { s, cell } of cellStamps(cx, "rock")) cx.give({ at: "cell", cell, kind: "block" }, s.id); },
  // a ★ stamp; a coloured stone (a rose, Panes); a word or sign written in a square
  symbol: (cx) => {
    for (const { s, cell } of cellStamps(cx, "star")) cx.give({ at: "cell", cell, kind: "symbol", value: "★" }, s.id);
    for (const { s, cell } of cellStamps(cx, "stone")) if (s.color && s.color !== "black") cx.give({ at: "cell", cell, kind: "symbol", value: s.color }, s.id);
    for (const { t, cell } of cellTexts(cx, (t) => !INT.test(t.text.trim()))) cx.give({ at: "cell", cell, kind: "symbol", value: t.text.trim() }, t.id);
  },
  // small numbers at a square's sides (n, e, s, w), and the fine cross between them
  compass: (cx) => {
    const by = new Map<string, { cell: [number, number]; value: Record<string, number>; ids: number[] }>();
    for (const { t } of cx.texts()) {
      if (t.at.at !== "inset" || !["n", "e", "s", "w"].includes(t.at.spot) || !INT.test(t.text.trim()) || !cx.inside(t.at.r, t.at.c)) continue;
      const k = `${t.at.r},${t.at.c}`, e = by.get(k) ?? { cell: [t.at.r, t.at.c] as [number, number], value: {}, ids: [] };
      e.value[t.at.spot] = Number(t.text.trim()); e.ids.push(t.id); by.set(k, e);
    }
    for (const e of by.values()) {
      cx.give({ at: "cell", cell: e.cell, kind: "compass", value: e.value }, ...e.ids);
      // the cross: short strokes inside the square
      for (const s of [...cx.each("pen"), ...cx.each("line")]) {
        const pts = strokePoints(cx, s);
        if (pts.every((p) => Math.floor(p.r) === e.cell[0] && Math.floor(p.c) === e.cell[1])) cx.takeStroke(s);
      }
    }
  },
  // the palisade stamp: how many of the square's sides are borders, and whether two are opposite
  palisade: (cx) => {
    for (const { s, cell } of cellStamps(cx, "palisade")) {
      const value = Math.max(0, Math.min(4, s.count ?? 2));
      cx.give({ at: "cell", cell, kind: "palisade", value, ...(value === 2 && s.opposite ? { opposite: true } : {}) }, s.id);
    }
  },
  pearl: (cx) => {
    for (const { s, cell } of cellStamps(cx, "stone")) {
      const c = s.color ?? "black";
      if (c === "black" || c === "white") cx.give({ at: "cell", cell, kind: "pearl", value: c }, s.id);
    }
  },
  dots: null,       // RYB's (figures aren't in paint yet)
  // lines along the grid lines, inside the grid (the outline is the grid's own)
  wall: (cx) => {
    for (const { s, part } of cx.parts("edges")) {
      cx.claim(s, part);
      for (const e of part.edges) if (cx.interior(e)) cx.give({ at: "border", cells: cx.edgeCells(e), kind: "wall" }, s.id);
    }
  },
  twins: (cx) => { for (const s of cx.stamps("diamond")) { const e = cx.edge(s.at); if (e && cx.interior(e)) cx.give({ at: "border", cells: cx.edgeCells(e), kind: "twins" }, s.id); } },
  opposites: (cx) => { for (const s of cx.stamps("open-diamond")) { const e = cx.edge(s.at); if (e && cx.interior(e)) cx.give({ at: "border", cells: cx.edgeCells(e), kind: "opposites" }, s.id); } },
  // < > across an upright line, ∧ ∨ across a level one: pointing at the smaller region
  inequality: (cx) => {
    // the stamp: its point toward the line's first square (left, above), or its second when flipped
    for (const s of cx.stamps("inequality")) {
      const e = cx.edge(s.at);
      if (!e || !cx.interior(e)) continue;
      const [a, b] = cx.edgeCells(e);
      cx.give({ at: "border", cells: s.flip ? [b, a] : [a, b], kind: "inequality" }, s.id);
    }
    for (const { t, e } of edgeTexts(cx)) {
      const sign = t.text.trim(), [a, b] = cx.edgeCells(e);
      if (!cx.interior(e)) continue;
      const across = { "<": "a", ">": "b" }[sign], down = { "∧": "a", "^": "a", "∨": "b", v: "b" }[sign];
      const first = e.side === "left" ? across : down;
      if (first) cx.give({ at: "border", cells: first === "a" ? [a, b] : [b, a], kind: "inequality" }, t.id);
    }
  },
  difference: (cx) => { for (const { t, e } of edgeTexts(cx)) if (cx.interior(e) && INT.test(t.text.trim())) cx.give({ at: "border", cells: cx.edgeCells(e), kind: "difference", value: Number(t.text.trim()) }, t.id); },
  count: (cx) => { for (const { t, corner } of cornerTexts(cx)) if (INT.test(t.text.trim())) cx.give({ at: "corner", corner, kind: "count", value: Number(t.text.trim()) }, t.id); },
  watchtower: (cx) => { for (const { t, corner } of cornerTexts(cx)) if (INT.test(t.text.trim())) cx.give({ at: "corner", corner, kind: "watchtower", value: Number(t.text.trim()) }, t.id); },
  // shapes off the grid: the shape bank
  bank: (cx) => { for (const s of cx.stamps("shape")) if (!cx.gridCell(s.at) && s.cells?.length) cx.give({ at: "aside", kind: "bank", value: normalShape(s.cells) }, s.id); },
  peg: (cx) => { for (const { s, cell } of cellStamps(cx, "stone")) if ((s.color ?? "black") === "black") cx.give({ at: "cell", cell, kind: "peg" }, s.id); },
  lengths: (cx) => {
    const ts = belowTexts(cx), words = ts.flatMap((t) => numbersIn(t.text));
    const value = words.map(lengthOf);
    if (!ts.length || value.some((v) => v === null)) return;
    cx.give({ at: "aside", kind: "lengths", value: value as number[] }, ...ts.map((t) => t.id));
  },
  // an arrow across the outside edge: its shaft from the edge outward, its head where it points
  door: (cx) => {
    const strokes = [...cx.each("line"), ...cx.each("pen")];
    const ends = (s: Stroke) => { const pts = strokePoints(cx, s); return [pts[0], pts[pts.length - 1]]; };
    const close = (a: P, b: P, d = 0.12) => Math.hypot(a.r - b.r, a.c - b.c) <= d;
    for (const s of strokes) {
      if (!cx.free.has(s.id)) continue;
      const [a, b] = ends(s);
      // which end is on the outline, at the middle of a square's side, and the other end straight out from it
      const onEdge = (p: P, q: P): { side: Side; cell: [number, number] } | null => {
        for (const side of Object.keys(SIDES) as Side[]) {
          const [dr, dc] = SIDES[side];
          const line = side === "top" ? 0 : side === "bottom" ? cx.rows : side === "left" ? 0 : cx.cols;
          const along = dr ? p.c : p.r, across = dr ? p.r : p.c, k = Math.floor(along);
          const limit = dr ? cx.cols : cx.rows;
          if (Math.abs(across - line) > 0.2 || k < 0 || k >= limit || Math.abs(along - k - 0.5) > 0.3) continue;
          const out = dr ? (q.r - p.r) * dr : (q.c - p.c) * dc, sideways = dr ? Math.abs(q.c - p.c) : Math.abs(q.r - p.r);
          if (out < 0.4 || sideways > out * 0.5) continue;
          return { side, cell: side === "top" ? [0, k] : side === "bottom" ? [cx.rows - 1, k] : side === "left" ? [k, 0] : [k, cx.cols - 1] };
        }
        return null;
      };
      const there = onEdge(a, b) ? { ...onEdge(a, b)!, edge: a, far: b } : onEdge(b, a) ? { ...onEdge(b, a)!, edge: b, far: a } : null;
      if (!there) continue;
      // the head: short strokes from one end of the shaft
      const heads = strokes.filter((h) => h !== s && cx.free.has(h.id) && (() => {
        const [p, q] = ends(h), short = Math.hypot(p.r - q.r, p.c - q.c) < 0.6;
        return short && [there.edge, there.far].some((e) => close(p, e) || close(q, e));
      })());
      const atEdge = heads.filter((h) => ends(h).some((p) => close(p, there.edge))).length;
      const atFar = heads.length - atEdge;
      const role = atEdge > atFar ? "in" : atFar > atEdge ? "out" : (close(ends(s)[1], there.edge) ? "in" : "out");
      cx.takeStroke(s);
      for (const h of heads) cx.takeStroke(h);
      if (atEdge === atFar) cx.problem("ambiguous", "Which way does this door go? Give its arrow a head", [s.id, ...heads.map((h) => h.id)], [there.cell]);
      cx.give({ at: "edge", cell: there.cell, side: there.side, kind: "door", role }, s.id);
    }
  },
  first: (cx) => {
    const symbols = cx.style.symbols ?? "ABCDEFGHIJ";
    for (const { t, side, cell } of ringTexts(cx)) { const k = symbols.indexOf(t.text.trim()); if (k >= 0 && t.text.trim().length === 1) cx.give({ at: "edge", cell, side, kind: "first", value: k + 1 }, t.id); }
  },
  skyscraper: (cx) => { for (const { t, side, cell } of ringTexts(cx)) if (INT.test(t.text.trim())) cx.give({ at: "edge", cell, side, kind: "skyscraper", value: Number(t.text.trim()) }, t.id); },
  // the thermometer tool's; or a line through square centres, from the bulb (a stone at one end)
  thermo: (cx) => {
    for (const t of cx.each("thermo")) {
      if (t.cells.length < 2 || !t.cells.every(([r, c]) => cx.inside(r, c))) continue;
      cx.give({ at: "cells", cells: t.cells.map(([r, c]) => [r, c] as [number, number]), kind: "thermo" }, t.id);
    }
    for (const { s, part } of cx.parts("centres")) {
      if (!part.cells.every(([r, c]) => cx.inside(r, c))) continue;
      const bulbAt = (cell: [number, number]) => cellStamps(cx, "stone").find((x) => x.cell[0] === cell[0] && x.cell[1] === cell[1]);
      const first = bulbAt(part.cells[0]), last = bulbAt(part.cells[part.cells.length - 1]);
      const cells = !first && last ? [...part.cells].reverse() : part.cells;
      cx.claim(s, part);
      if (!!first === !!last) cx.problem("ambiguous", first ? "A bulb at both ends: which end is the bulb?" : "Which end is the bulb? Stamp a stone on it", [s.id], cells);
      const bulb = first ?? last;
      if (bulb) cx.take(bulb.s.id);
      cx.give({ at: "cells", cells, kind: "thermo" }, s.id);
    }
  },
  galaxy: (cx) => {
    for (const s of cx.stamps("galaxy")) {
      const cell = cx.gridCell(s.at), corner = s.at.at === "edge" ? null : cx.corner(s.at), e = s.at.at === "corner" ? null : cx.edge(s.at);
      const point: [number, number] | null = cell ? [2 * cell[0] + 1, 2 * cell[1] + 1] : corner ? [2 * corner[0], 2 * corner[1]]
        : e ? (e.side === "top" ? [2 * e.r, 2 * e.c + 1] : [2 * e.r + 1, 2 * e.c]) : null;
      if (point && point[0] >= 1 && point[1] >= 1 && point[0] <= 2 * cx.rows - 1 && point[1] <= 2 * cx.cols - 1) cx.give({ at: "point", point, kind: "galaxy" }, s.id);
    }
  },
  // a nonogram's numbers: beside each row (left to right), above each column (top down)
  runs: (cx) => {
    const rows = new Map<number, { t: Text; k: number }[]>(), cols = new Map<number, { t: Text; k: number }[]>();
    for (const { t, p } of cx.texts()) {
      const words = numbersIn(t.text);
      if (!words.length || !words.every((w) => INT.test(w))) continue;
      if (p.c < 0 && p.r >= 0 && p.r < cx.rows) rows.set(Math.floor(p.r), [...(rows.get(Math.floor(p.r)) ?? []), { t, k: p.c }]);
      else if (p.r < 0 && p.c >= 0 && p.c < cx.cols) cols.set(Math.floor(p.c), [...(cols.get(Math.floor(p.c)) ?? []), { t, k: p.r }]);
    }
    for (const [at, map] of [["row", rows], ["col", cols]] as const) for (const [index, ts] of map) {
      ts.sort((a, b) => a.k - b.k);
      const value = ts.flatMap(({ t }) => numbersIn(t.text).map(Number));
      cx.give({ at, index, kind: "runs", value: value.length > 1 ? value.filter((v) => v) : value }, ...ts.map(({ t }) => t.id));
    }
  },
  // a count beside a row (left) or above a column (top)
  total: (cx) => {
    for (const { t, side, cell } of ringTexts(cx)) {
      if (!INT.test(t.text.trim()) || (side !== "left" && side !== "top")) continue;
      cx.give(side === "left" ? { at: "row", index: cell[0], kind: "total", value: Number(t.text.trim()) } : { at: "col", index: cell[1], kind: "total", value: Number(t.text.trim()) }, t.id);
    }
  },
  // ---- panels ----
  start: (cx) => { for (const s of cx.stamps("start")) { const corner = cx.corner(s.at); if (corner) cx.give({ at: "corner", corner, kind: "start", ...lineColor(s.color) }, s.id); } },
  end: (cx) => {
    for (const s of cx.stamps("end")) {
      const corner = cx.corner(s.at);
      if (corner && (corner[0] === 0 || corner[1] === 0 || corner[0] === cx.rows || corner[1] === cx.cols)) cx.give({ at: "corner", corner, kind: "end" }, s.id);
    }
  },
  hexagon: (cx) => {
    for (const s of cx.stamps("hoshi")) {
      const corner = s.at.at === "edge" ? null : cx.corner(s.at), e = corner ? null : cx.edge(s.at);
      if (corner) cx.give({ at: "corner", corner, kind: "hexagon", ...lineColor(s.color) }, s.id);
      else if (e) cx.give({ at: "line", corners: cx.edgeCorners(e), kind: "hexagon", ...lineColor(s.color) }, s.id);
    }
  },
  gap: (cx) => { for (const it of cx.each("gap")) cx.give({ at: "line", corners: cx.edgeCorners(it.at), kind: "gap" }, it.id); },
  square: (cx) => { for (const { s, cell } of cellStamps(cx, "stone")) cx.give({ at: "cell", cell, kind: "square", color: s.color ?? "black" }, s.id); },
  star: (cx) => { for (const { s, cell } of cellStamps(cx, "crest")) cx.give({ at: "cell", cell, kind: "star", color: s.color ?? "orange" }, s.id); },
  triangle: (cx) => { for (const { s, cell } of cellStamps(cx, "triangle")) cx.give({ at: "cell", cell, kind: "triangle", value: s.count ?? 1, ...(s.color ? { color: s.color } : {}) }, s.id); },
  shape: (cx) => {
    for (const { s, cell } of cellStamps(cx, "shape")) cx.give({ at: "cell", cell, kind: "shape", value: normalShape(s.cells ?? [[0, 0]]),
      ...(s.rotate ? { rotate: true } : {}), ...(s.hollow ? { negative: true } : {}), ...(s.color ? { color: s.color } : {}) }, s.id);
  },
  eraser: (cx) => { for (const { s, cell } of cellStamps(cx, "eraser")) cx.give({ at: "cell", cell, kind: "eraser", ...(s.color ? { color: s.color } : {}) }, s.id); },
  // a square washed in one of the type's colours
  color: (cx) => {
    const names = paletteNames(cx);
    for (const w of cx.each("wash")) {
      const cell = cx.gridCell(w.at), k = names.indexOf(w.color);
      if (cell && k >= 0) cx.give({ at: "cell", cell, kind: "color", value: k + 1 }, w.id);
    }
  },
  // ---- the spec's own parts ----
  // bold borders along the grid lines, flood-filled into areas
  areas: (cx) => {
    const found = cx.parts("edges");
    if (!found.length) return;
    const cut = new Set<string>();
    for (const { s, part } of found) { cx.claim(s, part); for (const e of part.edges) cut.add(edgeKey(e)); }
    const { rows, cols } = cx, of = new Array<number>(rows * cols).fill(-1);
    let n = 0;
    for (let i = 0; i < rows * cols; i++) {
      if (of[i] >= 0) continue;
      of[i] = n;
      const stack = [i];
      while (stack.length) {
        const j = stack.pop()!, r = Math.floor(j / cols), c = j % cols;
        const next: [number, number, Edge][] = [[r - 1, c, { side: "top", r, c }], [r + 1, c, { side: "top", r: r + 1, c }], [r, c - 1, { side: "left", r, c }], [r, c + 1, { side: "left", r, c: c + 1 }]];
        for (const [y, x, e] of next) if (cx.inside(y, x) && of[y * cols + x] < 0 && !cut.has(edgeKey(e))) { of[y * cols + x] = n; stack.push(y * cols + x); }
      }
      n++;
    }
    // a line with the same area on both sides closes nothing off
    for (const { s, part } of found) {
      const loose = part.edges.filter((e) => { if (!cx.interior(e)) return false; const [[a, b], [y, x]] = cx.edgeCells(e); return of[a * cols + b] === of[y * cols + x]; });
      if (loose.length === part.edges.filter((e) => cx.interior(e)).length && loose.length) cx.problem("ambiguous", "This line doesn't close off an area", [s.id], loose.map((e) => cx.edgeCells(e)[1]));
    }
    if (n < 2) return;
    const names = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    if (n > names.length) { cx.problem("ambiguous", `${n} areas: more than a puzzle can have`, found.map((f) => f.s.id)); return; }
    cx.areas = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => names[of[r * cols + c]]).join(""));
  },
  // a fill-in's list, under the grid
  entries: (cx) => {
    const ts = belowTexts(cx), symbols = cx.style.symbols ?? "0123456789";
    const words = ts.flatMap((t) => numbersIn(t.text));
    if (!ts.length || !words.every((w) => [...w].every((ch) => symbols.includes(ch)))) return;
    cx.take(...ts.map((t) => t.id));
    cx.entries = words;
  },
  // a nonogram's picture, washed in: its numbers are worked out from it
  picture: (cx) => {
    const washes = cx.each("wash").flatMap((w) => { const cell = cx.gridCell(w.at); return cell ? [{ w, cell }] : []; });
    if (!washes.length) return;
    const letter = (c: m.WashColor) => (c === "pink" ? "k" : c[0]);
    const rows = Array.from({ length: cx.rows }, () => Array<string>(cx.cols).fill("."));
    const palette: Record<string, string> = {};
    for (const { w, cell: [r, c] } of washes) { rows[r][c] = letter(w.color); palette[letter(w.color)] = WASH_HEX[w.color]; }
    cx.take(...washes.map((x) => x.w.id));
    cx.picture = { rows: rows.map((r) => r.join("")), palette };
  },
  // a sudoku's box lines: medium lines along the grid lines, where the boxes setting puts them
  "box-lines": (cx) => {
    const own = cx.rule("boxes")?.box as [number, number] | undefined;
    const box = cx.rows === cx.cols ? (own && own[0] * own[1] === cx.cols && own[0] > 1 && own[1] > 1 ? own : standardBox(cx.cols)) : null;
    for (const { s, part } of cx.parts("edges", (s) => s.weight === "medium")) {
      cx.claim(s, part);
      const off = part.edges.filter((e) => cx.interior(e) && (!box || (e.side === "top" ? e.r % box[0] : e.c % box[1])));
      if (off.length) cx.problem("ambiguous", box ? `Not a box line: the boxes are ${box[0]} × ${box[1]} (set in Rules)` : `A ${cx.rows} × ${cx.cols} grid has no boxes`, [s.id], off.map((e) => cx.edgeCells(e)[1]));
    }
  },
  // a nonogram's heavier line every 5 squares: the type's own, so nothing to read
  "major-lines": (cx) => {
    const k = cx.style.major ?? 5;
    for (const { s, part } of cx.parts("edges")) if (part.edges.every((e) => (e.side === "top" ? e.r : e.c) % k === 0)) cx.claim(s, part);
  },
};

/** The order readers run in: where two could take an item, the first does. */
const READ_ORDER: Part[] = [
  "door", "compass", "thermo", "box-lines", "major-lines",
  "block", "number", "symbol", "palisade", "pearl", "dots", "peg", "square", "star", "triangle", "shape", "eraser",
  "wall", "areas", "twins", "opposites", "inequality", "difference", "count", "watchtower", "bank",
  "first", "skyscraper", "total", "runs", "galaxy", "start", "end", "hexagon", "gap", "color", "picture", "lengths", "entries",
];

const lineColor = (c: m.SymbolColor | undefined) => (c === "blue" || c === "yellow" ? { color: c } : {});

// ---- what's left: the problems ----

const STAMP_WORDS: Record<m.StampKind, string> = {
  stone: "A stone", star: "A star", rock: "A shaded square", x: "An X", dot: "A dot", galaxy: "A circle", diamond: "A ◆", "open-diamond": "A ◇",
  hoshi: "A dot on the line", start: "A start", end: "An end", crest: "A crest", triangle: "A triangle", shape: "A shape", eraser: "An eraser",
  inequality: "A < sign", palisade: "A palisade mark", thermo: "A thermometer",
};
function words(it: m.Item): string {
  switch (it.kind) {
    case "text": return `Writing ("${it.text}")`;
    case "stamp": return STAMP_WORDS[it.stamp];
    case "wash": case "brush": return "A wash";
    case "gap": return "A gap in a line";
    case "pen": case "line": return "A line";
    case "thermo": return "A thermometer";
  }
}

/** Is an item somewhere the grid has places (in it, on its lines, or the ring just outside)? */
function onGrid(cx: Ctx, it: m.Item): boolean {
  const near = (a: m.Anchor) => {
    if (a.at === "cell" || a.at === "corner" || a.at === "edge" || a.at === "inset") return true;
    const p = cx.at(a);
    return p.r >= -1 && p.c >= -1 && p.r <= cx.rows + 1 && p.c <= cx.cols + 1;
  };
  switch (it.kind) {
    case "text": case "stamp": return near(it.at);
    case "wash": case "gap": case "thermo": return true;
    case "brush": case "pen": return it.points.some(near);
    case "line": return near(it.from) && near(it.to);
  }
}

function leftovers(cx: Ctx) {
  const name = cx.name;
  for (const it of cx.free.values()) {
    if (it.kind === "pen" || it.kind === "line") {
      const parts = cx.strokes.get(it.id) ?? [];
      const open = parts.filter((p) => !p.claimed);
      if (!open.length) { cx.used.add(it.id); continue; }
      if (parts.some((p) => p.claimed)) cx.used.add(it.id);
      if (open.some((p) => p.kind === "off")) cx.problem("off-grid", "This line isn't on the grid", [it.id]);
      else cx.problem("off-type", cx.profile.lines ?? (open.some((p) => p.kind === "edges") ? `Lines along the grid aren't part of ${name}` : `Lines through the squares aren't part of ${name}`), [it.id]);
      continue;
    }
    // writing above the grid is its title: left out, but not a problem
    if (it.kind === "text" && it.at.at !== "cell" && cx.at(it.at).r < 0) continue;
    if (!onGrid(cx, it)) { cx.problem("off-grid", `${words(it)} isn't on the grid`, [it.id]); continue; }
    if (it.kind === "text" && it.at.at === "cell" && !cx.inside(it.at.r, it.at.c)) { cx.problem("off-type", `${name} has no clues outside the grid`, [it.id]); continue; }
    if (it.kind === "stamp" && it.stamp === "shape" && !cx.gridCell(it.at) && !cx.profile.reads.includes("bank")) { cx.problem("off-type", `${name} has no shape bank`, [it.id]); continue; }
    const cell = it.kind === "text" || it.kind === "stamp" || it.kind === "wash" ? cx.gridCell(it.at) : null;
    const cells = it.kind === "thermo" ? it.cells.filter(([r, c]) => cx.inside(r, c)) : cell ? [cell] : undefined;
    cx.problem("off-type", `${words(it)} isn't part of ${name}`, [it.id], cells?.length ? cells : undefined);
  }
}

// ---- rule hints: clues that already break a rule ----

const COUNT_WORDS = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
/** Clues that break a rule as given, found with the engine's own checks on a board holding just the
 *  clues ("Two 5s in row 6"). Digit puzzles: repeats in a row, column or box, digits out of range,
 *  thermometers that don't rise, a number path's repeats. Each with the squares involved. */
export function ruleHints(p: Puzzle): { text: string; cells: number[] }[] {
  if (!p.marks.includes("digit")) return [];
  const g = p.grid, b = emptyBoard(g), out: { text: string; cells: number[] }[] = [];
  const show = (d: number) => symbolOf(p, d);
  const big: number[] = [];
  for (const [i, gs] of p.cellGivens) for (const gv of gs) if (gv.kind === "number") {
    if (gv.value >= 1 && gv.value <= p.digits) b.digit[i] = gv.value; else big.push(i);
  }
  for (const i of big) {
    const gv = p.cellGivens.get(i)!.find((x) => x.kind === "number") as Extract<Given, { kind: "number" }>;
    out.push({ text: `${gv.value} is too big: the numbers here run 1 to ${p.digits}`, cells: [i] });
  }
  /** "Two 5s in row 6": a group of repeated clues, by digit */
  const repeats = (cells: number[], where: string) => {
    const by = new Map<number, number[]>();
    for (const i of cells) if (b.digit[i]) by.set(b.digit[i], [...(by.get(b.digit[i]) ?? []), i]);
    for (const [d, cs] of by) if (cs.length > 1) out.push({ text: `${COUNT_WORDS[cs.length] ?? cs.length} ${show(d)}s ${where}`, cells: cs });
  };
  const lineOf = (cells: number[]) => {
    const rcs = cells.map((i) => g.rc(i));
    return rcs.every(([r]) => r === rcs[0][0]) ? `in row ${rcs[0][0] + 1}` : rcs.every(([, c]) => c === rcs[0][1]) ? `in column ${rcs[0][1] + 1}` : "in a line";
  };
  const regions = () => regionsOf(p, b);
  for (const s of p.rules) {
    if (s.rule === "latin" || s.rule === "boxes") {
      for (const pr of blockFor(s).check(s, p, b, regions)) {
        if (!pr.cells?.length || pr.cells.some((i) => !b.digit[i])) continue;   // "fill every cell": not a clash
        repeats(pr.cells, s.rule === "latin" ? lineOf(pr.cells) : p.areas ? "in an area" : "in a box");
      }
    } else if (s.rule === "thermo") {
      // the engine's check sees neighbours only; clues further apart must rise by their distance at least
      for (const t of p.thermos) {
        const bad = new Set<number>();
        t.forEach((i, k) => t.forEach((j, l) => { if (k < l && b.digit[i] && b.digit[j] && b.digit[j] - b.digit[i] < l - k) { bad.add(i); bad.add(j); } }));
        if (bad.size) out.push({ text: "These can't rise along the thermometer", cells: t.filter((i) => bad.has(i)) });
      }
    } else if (s.rule === "letters") {
      // each letter once a row and column: the same as latin's repeats
      for (let r = 0; r < g.rows; r++) repeats(Array.from({ length: g.cols }, (_, c) => g.cell(r, c)), `in row ${r + 1}`);
      for (let c = 0; c < g.cols; c++) repeats(Array.from({ length: g.rows }, (_, r) => g.cell(r, c)), `in column ${c + 1}`);
    } else if (s.rule === "number-path" || s.rule === "tiles") {
      repeats(Array.from({ length: g.cellCount }, (_, i) => i), "");
    }
  }
  return out.map((h) => ({ ...h, text: h.text.trim() }));
}

// ---- convert ----

/** The drawing as a puzzle of this type. */
export function convert(d: m.Drawing, genre: GenreName, settings: Settings = {}): Conversion {
  const profile = PROFILES[genre];
  if (!profile) return { spec: null, used: new Set(), problems: [{ kind: "unsupported", text: `${kindName(genre)} isn't made in paint yet: use its own editor`, items: [] }] };
  if (!d.grid) return { spec: null, used: new Set(), problems: [{ kind: "grid", text: "Draw a grid first", items: [] }] };
  const own = new Set((settings.rules ?? []).map((s) => s.rule));
  const rules = [...genres[genre].rules.filter((s) => !own.has(s.rule)), ...(settings.rules ?? [])] as RuleSpec[];
  const style = { ...genres[genre].style, ...settings.style } as GridStyle;
  const cx = new Ctx(d, genre, profile, rules, style);

  const look = profile.look ?? "lines";
  if (m.lookOf(d.grid) !== look) cx.problem("grid", `${cx.name} is drawn ${({ lines: "with lines", tracks: "as tracks", hex: "on hexagons", dots: "on dots" } as const)[look]}`, []);
  for (const part of READ_ORDER) if (profile.reads.includes(part)) READERS[part]?.(cx);
  leftovers(cx);

  const given = cx.out.map((x) => x.given);
  const spec: GridSpec = {
    genre, size: [cx.rows, cx.cols], ...settings,
    ...(given.length ? { givens: given } : {}),
    ...(cx.areas ? { areas: cx.areas } : {}), ...(cx.entries ? { entries: cx.entries } : {}), ...(cx.picture ? { picture: cx.picture } : {}),
  };
  // the engine's own checks: a puzzle missing something, and clues that break a rule
  let puzzle: Puzzle | null = null;
  try { makePuzzle(spec); } catch (e) { cx.problem("incomplete", (e as Error).message, []); }
  try { puzzle = makePuzzle(spec, { unfinished: true }); } catch { /* reported above */ }
  if (puzzle) {
    const g = puzzle.grid;
    for (const h of ruleHints(puzzle)) {
      const cells = h.cells.map((i) => g.rc(i));
      const items = cx.out.filter((x) => x.given.at === "cell" && cells.some(([r, c]) => r === (x.given as { cell: number[] }).cell[0] && c === (x.given as { cell: number[] }).cell[1])).flatMap((x) => x.items);
      cx.problem("rule", h.text, items, cells);
    }
  }
  return { spec, used: cx.used, problems: cx.problems };
}

// ---- comparing puzzles ----

const SAME_BOTH_WAYS = new Set(["wall", "twins", "opposites", "difference"]);
const cmp = (a: number[], b: number[]) => a[0] - b[0] || a[1] - b[1];
/** JSON with its keys in order, so two objects that are the same give the same string. */
const keyOf = (v: unknown): string => Array.isArray(v) ? `[${v.map(keyOf).join(",")}]`
  : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${k}:${keyOf((v as Record<string, unknown>)[k])}`).join(",")}}` : JSON.stringify(v);
/** A puzzle in one form, so two that mean the same are equal: its genre set, a nonogram's picture
 *  as its numbers, givens in one order (and each pair of cells or corners in one order where it
 *  doesn't matter), shapes moved to 0,0, areas lettered in reading order, lists sorted, nothing empty. */
export function normalSpec(spec: GridSpec, genre = spec.genre): GridSpec {
  const s: GridSpec = JSON.parse(JSON.stringify({ ...spec, genre }));
  let givens = [...(s.givens ?? [])];
  if (s.picture && !givens.some((x) => x.kind === "runs")) {
    const p = makePuzzle({ ...s, givens: [] }, { unfinished: true });
    givens.push(...[...p.rowRuns].map(([index, value]): Given => ({ at: "row", index, kind: "runs", value })));
    givens.push(...[...p.colRuns].map(([index, value]): Given => ({ at: "col", index, kind: "runs", value })));
  }
  delete s.picture;
  givens = givens.map((g) => {
    if (g.at === "border" && SAME_BOTH_WAYS.has(g.kind)) return { ...g, cells: [...g.cells].sort(cmp) as [typeof g.cells[0], typeof g.cells[0]] };
    if (g.at === "line") return { ...g, corners: [...g.corners].sort(cmp) as typeof g.corners };
    if (g.kind === "shape" || g.kind === "bank") return { ...g, value: normalShape(g.value) };
    if (g.kind === "lengths") return { ...g, value: [...g.value].sort((a, b) => a - b) };
    return g;
  });
  givens.sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : 1));
  if (givens.length) s.givens = givens; else delete s.givens;
  if (s.areas) {
    const names = new Map<string, string>(), letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    s.areas = s.areas.map((row) => [...row].map((ch) => { if (!names.has(ch)) names.set(ch, letters[names.size]); return names.get(ch)!; }).join(""));
  }
  if (s.entries) s.entries = [...s.entries].map(String).sort();
  for (const k of ["rules", "entries", "marks"] as const) if (Array.isArray(s[k]) && !s[k]!.length) delete s[k];
  if (s.style && !Object.keys(s.style).length) delete s.style;
  return s;
}
