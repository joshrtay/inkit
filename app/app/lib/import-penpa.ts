// A Penpa+ link read into a puzzle (lib/import-link.ts): what's drawn on the grid (numbers, letters,
// shading, circles, galaxy dots, thick borders, thermometers, clues outside the frame), and the
// setter's solution if the link carries one. Penpa+ doesn't record a puzzle type, only optional
// genre tags, so the type comes from the tags, else from what's drawn: the types the drawing fits,
// narrowed by the solution when there is one. One left: it opens; several: the creator chooses.
// Pure: no DOM, no database (the link's data is inflated with the platform's DecompressionStream).
//
// The link format is Penpa+'s (github.com/swaroopg92/penpa-edit: docs/js/general.js's load and
// decrypt_data, docs/js/class_p.js's maketext and COMPRESS_SUB, docs/js/class_square.js's points),
// reimplemented here from it. Penpa+ is MIT licensed: (c) 2019 Opt-Pan, (c) 2020 Swaroop Guggilam.
import { check, makePuzzle, type GenreName } from "~site/engine/puzzle.ts";
import { standardBox } from "~site/engine/rules.ts";
import { emptyBoard, type Given, type GridSpec, type Side } from "~site/engine/types.ts";
import { KIND_NAMES } from "~/games/kinds";
import { PUZZLINK_ALIASES, PUZZLINK_NAMES } from "./puzzlink-genres";

type Spec = GridSpec & { genre: GenreName };
type RC = [number, number];

export type PenpaResult =
  | { kind: "puzzle"; spec: Spec }
  | { kind: "choose"; genres: GenreName[] }
  | { kind: "unsupported"; genreId: string; genreName: string };

/** The genres a Penpa+ link can open as. */
export const PENPA_GENRES = [
  "slitherlink", "nurikabe", "simple-loop", "star-battle", "akari", "shikaku", "numberlink", "masyu", "cave", "aquarium",
  "square-jam", "wittgenstein-briquet", "hitori", "minesweeper", "spiral-galaxies", "skyscrapers", "easy-as-abc", "nonogram",
  "sudoku", "irregular-sudoku", "thermo-sudoku", "fillomino",
] as const satisfies readonly GenreName[];
type PenpaGenre = (typeof PENPA_GENRES)[number];

/** Penpa+'s genre tags for our types. */
const TAGS: Record<string, PenpaGenre> = {
  slitherlink: "slitherlink", nurikabe: "nurikabe", "simple loop": "simple-loop", starbattle: "star-battle", akari: "akari",
  shikaku: "shikaku", numberlink: "numberlink", arukone: "numberlink", masyu: "masyu", cave: "cave", aquarium: "aquarium",
  squarejam: "square-jam", hitori: "hitori", minesweeper: "minesweeper", spiralgalaxies: "spiral-galaxies",
  skyscrapers: "skyscrapers", "easy as abc": "easy-as-abc", nonogram: "nonogram", classic: "sudoku", irregular: "irregular-sudoku",
  thermo: "thermo-sudoku", fillomino: "fillomino",
};
/** Penpa+'s sudoku variant tags (its "Sudoku" group, but ours and Battleship): "killer" is Killer Sudoku. */
const SUDOKU_TAGS = new Set(["latin", "alphabet", "arrow", "tightfit", "evenodd", "consecutivepairs", "killer", "isodoku", "consecutive",
  "nonconsecutive", "sudokurve", "tile", "deficit", "surplus", "outside"]);
/** Tags that say nothing about the type. */
const NOT_TYPES = new Set(["puzzlink", "other", "others", ""]);

/** Penpa+'s substitutions, applied in order when it writes a link (undone last to first). */
const COMPRESS_SUB: [string, string][] = [
  ["z", "zZ"], ['"qa"', "z9"], ['"pu_q"', "zQ"], ['"pu_a"', "zA"], ['"grid"', "zG"], ['"edit_mode"', "zM"], ['"surface"', "zS"],
  ['"line"', "zL"], ['"lineE"', "zE"], ['"wall"', "zW"], ['"cage"', "zC"], ['"number"', "zN"], ['"symbol"', "zY"], ['"special"', "zP"],
  ['"board"', "zB"], ['"command_redo"', "zR"], ['"command_undo"', "zU"], ['"command_replay"', "z8"], ['"numberS"', "z1"],
  ['"freeline"', "zF"], ['"freelineE"', "z2"], ['"thermo"', "zT"], ['"arrows"', "z3"], ['"direction"', "zD"], ['"squareframe"', "z0"],
  ['"polygon"', "z5"], ['"deletelineE"', "z4"], ['"killercages"', "z6"], ['"nobulbthermo"', "z7"], ['"__a"', "z_"], ["null", "zO"],
];

/** Shading that's a given shaded cell (dark grey, grey, black), as Penpa+'s answer check counts it. */
const SHADES = new Set([1, 3, 4, 8]);
const GIVEN_SHADES = new Set([1, 4, 8]);
/** Thick border styles: bold, thicker, double, and the default grey bold. */
const THICK = new Set([2, 3, 21, 30]);

class NoFit extends Error {}

// ---- the link's data ----

/** The link's parameters (after "#", or "?" for old links). */
function paramsOf(link: string): Map<string, string> | null {
  const at = link.indexOf("#") >= 0 ? link.indexOf("#") : link.indexOf("?");
  if (at < 0) return null;
  const out = new Map<string, string>();
  for (const kv of link.slice(at + 1).split("&")) {
    const k = kv.indexOf("=");
    if (k > 0) out.set(kv.slice(0, k), kv.slice(k + 1));
  }
  return out;
}

/** base64, raw deflate (Penpa+'s encrypt_data), back to text. */
export async function inflate(b64: string): Promise<string> {
  let text = b64;
  try { text = decodeURIComponent(b64); } catch { /* as it is */ }
  const bin = atob(text.replace(/ /g, "+").replace(/[^A-Za-z0-9+/=]/g, ""));
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return await new Response(stream).text();
}

/** What a Penpa+ grid holds, in our grid's terms. */
export interface PenpaGrid {
  rows: number; cols: number; gridtype: string; tags: string[];
  /** numbers and letters in cells (not blank ones, as on Akari's black cells) */
  cells: Map<number, string>;
  /** numbers and letters outside the frame: the side, the row or column, and how far out (1 = next to it) */
  outside: { side: Side; index: number; depth: number; value: string }[];
  shaded: Set<number>;
  /** circles in cells: 1 white, 2 black */
  circles: Map<number, number>;
  /** small dots anywhere, in half-cell units ([2r+1, 2c+1] a cell's centre) */
  dots: RC[];
  /** thick borders between two cells of the grid */
  walls: [RC, RC][];
  thermos: RC[][];
  /** a star drawn outside the frame (a Star Battle's "2 ★") */
  starOutside: boolean;
  solution: Solution | null;
}

/** The setter's solution (Penpa+'s make_solution): shaded cells, line and edge segments, numbers, symbols. */
interface Solution { shaded: Set<number>; lines: [number, number][]; /** segments, as their two corners */ edges: [RC, RC][]; numbers: Map<number, string>; stars: Set<number>; bulbs: Set<number>; mines: Set<number> }

export async function readPenpaGrid(link: string): Promise<PenpaGrid | null> {
  const params = paramsOf(link);
  const p = params?.get("p");
  if (!params || !p || p.startsWith("http")) return null;
  let text: string;
  try { text = await inflate(p); } catch { return null; }
  for (let i = COMPRESS_SUB.length - 1; i >= 0; i--) text = text.split(COMPRESS_SUB[i][1]).join(COMPRESS_SUB[i][0]);
  const lines = text.split("\n");
  if (!lines[0] || /^\d/.test(lines[0])) return null;   // the first version's links
  const head = lines[0].split(",");
  const gridtype = head[0], nx = Number(head[1]), ny = Number(head[2]);
  if ((gridtype !== "square" && gridtype !== "sudoku") || !Number.isInteger(nx) || !Number.isInteger(ny)) return null;
  let space: number[], q: Record<string, unknown>;
  try {
    space = JSON.parse(lines[1]);
    q = JSON.parse(lines[3]);
  } catch { return null; }
  if (!Array.isArray(space) || space.length !== 4 || !q || typeof q !== "object") return null;
  let tags: string[] = [];
  try { const t = lines[17] ? JSON.parse(lines[17]) : []; if (Array.isArray(t)) tags = t.filter((x): x is string => typeof x === "string"); } catch { /* none */ }
  const [top, bottom, left, right] = space.map(Number);
  const rows = ny - top - bottom, cols = nx - left - right;
  if (!(rows > 0 && cols > 0)) return null;
  const pt = new Points(nx, ny, top, left, rows, cols);

  const g: PenpaGrid = { rows, cols, gridtype, tags, cells: new Map(), outside: [], shaded: new Set(), circles: new Map(), dots: [], walls: [], thermos: [], starOutside: false, solution: null };
  const obj = (k: string) => (q[k] && typeof q[k] === "object" ? q[k] as Record<string, unknown> : {});
  for (const [k, v] of Object.entries(obj("number"))) {
    if (!Array.isArray(v)) continue;
    const at = pt.center(Number(k)), value = String(v[0] ?? "").trim(), type = String(v[2]);
    if (!at || !value || !["1", "5", "6", "10"].includes(type)) continue;
    if (pt.inside(at)) g.cells.set(pt.id(at), value);
    else { const o = pt.outside(at); if (o) g.outside.push({ ...o, value }); }
  }
  for (const [k, v] of Object.entries(obj("surface"))) {
    const at = pt.center(Number(k));
    if (at && pt.inside(at) && GIVEN_SHADES.has(Number(v))) g.shaded.add(pt.id(at));
  }
  for (const [k, v] of Object.entries(obj("symbol"))) {
    if (!Array.isArray(v)) continue;
    const [n, name] = v as [number, string];
    const at = pt.center(Number(k));
    if ((name === "circle_SS" || name === "circle_S") && n >= 1) { const h = pt.half(Number(k)); if (h) g.dots.push(h); }
    else if (at && pt.inside(at) && /^circle_(L|M)$/.test(name) && (n === 1 || n === 2)) g.circles.set(pt.id(at), n);
    else if (at && !pt.inside(at) && name === "star") g.starOutside = true;
  }
  for (const [k, v] of Object.entries(obj("lineE"))) {
    if (!THICK.has(Number(v))) continue;
    const wall = pt.edge(k);
    if (wall) g.walls.push(wall);
  }
  if (Array.isArray(q.thermo)) for (const t of q.thermo as unknown[]) {
    if (!Array.isArray(t)) continue;
    const cells = t.map((k) => pt.center(Number(k)));
    if (cells.length >= 2 && cells.every((c) => c && pt.inside(c))) g.thermos.push(cells as RC[]);
  }
  const a = params.get("a");
  if (a) try { g.solution = solutionOf(JSON.parse(await inflate(a)), pt); } catch { /* none */ }
  return g;
}

/** Penpa+'s points on a square grid (class_square.js): cell centres, then the corners, then the
 *  middles of the lines below and right of each centre; all on a grid of nx + 4 by ny + 4, the
 *  puzzle two in from its edge and inside the space left around it. */
class Points {
  nx0: number; N: number;
  constructor(nx: number, ny: number, public top: number, public left: number, public rows: number, public cols: number) {
    this.nx0 = nx + 4; this.N = this.nx0 * (ny + 4);
  }
  /** a centre's cell, [row, column] of the puzzle (outside it, beyond 0 or the size) */
  center(k: number): RC | null {
    if (!Number.isInteger(k) || k < 0 || k >= this.N) return null;
    return [Math.floor(k / this.nx0) - 2 - this.top, (k % this.nx0) - 2 - this.left];
  }
  inside([r, c]: RC) { return r >= 0 && c >= 0 && r < this.rows && c < this.cols; }
  id([r, c]: RC) { return r * this.cols + c; }
  /** a cell outside the frame, as a clue beside a row or column */
  outside([r, c]: RC): { side: Side; index: number; depth: number } | null {
    const inRow = r >= 0 && r < this.rows, inCol = c >= 0 && c < this.cols;
    if (inCol && r < 0) return { side: "top", index: c, depth: -r };
    if (inCol && r >= this.rows) return { side: "bottom", index: c, depth: r - this.rows + 1 };
    if (inRow && c < 0) return { side: "left", index: r, depth: -c };
    if (inRow && c >= this.cols) return { side: "right", index: r, depth: c - this.cols + 1 };
    return null;
  }
  /** a corner point: its [row, column] among the grid's corners */
  corner(k: number): RC | null {
    const v = k - this.N;
    if (!Number.isInteger(v) || v < 0 || v >= this.N) return null;
    return [Math.floor(v / this.nx0) - 1 - this.top, (v % this.nx0) - 1 - this.left];
  }
  /** any point in half-cell units, [2r+1, 2c+1] a cell's centre, if it's in the puzzle */
  half(k: number): RC | null {
    const type = Math.floor(k / this.N), base = k - type * this.N;
    const r = Math.floor(base / this.nx0) - 2 - this.top, c = (base % this.nx0) - 2 - this.left;
    const h: RC | null = type === 0 ? [2 * r + 1, 2 * c + 1] : type === 1 ? [2 * r + 2, 2 * c + 2] : type === 2 ? [2 * r + 2, 2 * c + 1] : type === 3 ? [2 * r + 1, 2 * c + 2] : null;
    return h && h[0] >= 1 && h[1] >= 1 && h[0] <= 2 * this.rows - 1 && h[1] <= 2 * this.cols - 1 ? h : null;
  }
  /** a segment between two corners ("k1,k2"), as the two cells it parts (null on the frame or off the grid) */
  edge(key: string): [RC, RC] | null {
    const [a, b] = key.split(",").map((x) => this.corner(Number(x)));
    if (!a || !b) return null;
    const [[r1, c1], [r2, c2]] = [a, b].sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    let pair: [RC, RC];
    if (r1 === r2 && c2 === c1 + 1) pair = [[r1 - 1, c1], [r1, c1]];
    else if (c1 === c2 && r2 === r1 + 1) pair = [[r1, c1 - 1], [r1, c1]];
    else return null;
    return this.inside(pair[0]) && this.inside(pair[1]) ? pair : null;
  }
}

function solutionOf(raw: unknown, pt: Points): Solution | null {
  // with several solutions (multisolution), the first
  let sol = raw as unknown[];
  if (Array.isArray(sol) && Array.isArray(sol[0]) && Array.isArray(sol[0][0])) sol = sol[0] as unknown[];
  if (!Array.isArray(sol) || sol.length < 6) return null;
  const list = (i: number) => (Array.isArray(sol[i]) ? (sol[i] as unknown[]).map(String) : []);
  const cellOf = (k: string) => { const at = pt.center(Number(k)); return at && pt.inside(at) ? pt.id(at) : -1; };
  const out: Solution = { shaded: new Set(), lines: [], edges: [], numbers: new Map(), stars: new Set(), bulbs: new Set(), mines: new Set() };
  for (const k of list(0)) { const i = cellOf(k); if (i >= 0) out.shaded.add(i); }
  for (const s of list(1)) { const [a, b] = s.split(",").map(cellOf); if (a >= 0 && b >= 0) out.lines.push([a, b]); }
  for (const s of list(2)) {
    const [a, b] = s.split(",").map((k) => pt.corner(Number(k)));
    if (a && b && [a, b].every(([r, c]) => r >= 0 && c >= 0 && r <= pt.rows && c <= pt.cols)) out.edges.push([a, b]);
  }
  for (const s of list(4)) { const [k, v] = s.split(","); const i = cellOf(k); if (i >= 0 && v !== undefined) out.numbers.set(i, v); }
  for (const s of list(5)) {
    const [k, v] = s.split(","), i = cellOf(k);
    if (i < 0 || !v) continue;
    if (v.endsWith("E")) out.stars.add(i);
    else if (v === "3H") out.bulbs.add(i);
    else if (v === "4I" || v === "5I") out.mines.add(i);
  }
  return out;
}

// ---- the puzzle, as each type ----

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const isInt = (v: string) => /^\d+$/.test(v);
const rcOf = (g: PenpaGrid, i: number): RC => [Math.floor(i / g.cols), i % g.cols];

/** Every cell's number, each a whole number in [min, max]; else it doesn't fit. */
function numbersIn(g: PenpaGrid, min = 0, max = Infinity): Given[] {
  return [...g.cells].map(([i, v]): Given => {
    if (!isInt(v) || Number(v) < min || Number(v) > max) throw new NoFit();
    return { at: "cell", cell: rcOf(g, i), kind: "number", value: Number(v) };
  });
}
/** The thick borders as outlined areas (none: null). */
function areasOf(g: PenpaGrid, walls = g.walls): string[] | null {
  if (!walls.length) return null;
  const cut = new Set(walls.map(([a, b]) => `${a}|${b}`)), of = new Array<number>(g.rows * g.cols).fill(-1);
  let n = 0;
  for (let s = 0; s < of.length; s++) {
    if (of[s] >= 0) continue;
    of[s] = n;
    const stack = [s];
    while (stack.length) {
      const i = stack.pop()!, [r, c] = rcOf(g, i);
      for (const [y, x] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]] as RC[]) {
        if (y < 0 || x < 0 || y >= g.rows || x >= g.cols) continue;
        const j = y * g.cols + x, a: RC = [Math.min(r, y), Math.min(c, x)], b: RC = [Math.max(r, y), Math.max(c, x)];
        if (of[j] >= 0 || cut.has(`${a}|${b}`)) continue;
        of[j] = n; stack.push(j);
      }
    }
    n++;
  }
  const names = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  if (n > names.length) throw new NoFit();
  return Array.from({ length: g.rows }, (_, r) => Array.from({ length: g.cols }, (_, c) => names[of[r * g.cols + c]]).join(""));
}
const standardAreas = (g: PenpaGrid) => {
  const box = g.rows === g.cols ? standardBox(g.rows) : null;
  if (!box) return null;
  const [h, w] = box;
  return Array.from({ length: g.rows }, (_, r) => Array.from({ length: g.cols }, (_, c) => String.fromCharCode(97 + Math.floor(r / h) * (g.cols / w) + Math.floor(c / w))).join(""));
};
const sameAreas = (a: string[] | null, b: string[] | null) => {
  if (!a || !b || a.length !== b.length) return false;
  const key = (x: string[]) => { const m = new Map<string, number>(); return x.map((row) => [...row].map((ch) => { if (!m.has(ch)) m.set(ch, m.size); return m.get(ch); }).join(",")).join("|"); };
  return key(a) === key(b);
};
/** Clues outside, one per row or column end; none deeper than the first ring. */
function edgeClues(g: PenpaGrid, kind: "first" | "skyscraper", value: (v: string) => number): Given[] {
  const seen = new Set<string>();
  return g.outside.map((o): Given => {
    const key = `${o.side}${o.index}`;
    if (o.depth !== 1 || seen.has(key)) throw new NoFit();
    seen.add(key);
    const cell: RC = o.side === "top" ? [0, o.index] : o.side === "bottom" ? [g.rows - 1, o.index] : o.side === "left" ? [o.index, 0] : [o.index, g.cols - 1];
    return { at: "edge", cell, side: o.side, kind, value: value(o.value) };
  });
}
const nothingBut = (g: PenpaGrid, ...uses: ("cells" | "outside" | "shaded" | "circles" | "dots" | "walls" | "thermos")[]) => {
  const has = { cells: g.cells.size > 0, outside: g.outside.length > 0, shaded: g.shaded.size > 0, circles: g.circles.size > 0, dots: g.dots.length > 0, walls: g.walls.length > 0, thermos: g.thermos.length > 0 };
  for (const [k, v] of Object.entries(has)) if (v && !uses.includes(k as keyof typeof has)) throw new NoFit();
};
const need = (ok: boolean) => { if (!ok) throw new NoFit(); };

type Build = (g: PenpaGrid) => Omit<GridSpec, "size" | "genre">;
/** Numbers in some cells (a number in every cell is a Hitori or a sudoku). */
const numbersOnly = (min: number, max = Infinity): Build => (g) => {
  nothingBut(g, "cells");
  need(g.cells.size > 0 && g.cells.size < g.rows * g.cols);
  return { givens: numbersIn(g, min, max) };
};
const sudokuDigits = (g: PenpaGrid, some = true) => { need(g.rows === g.cols && (!some || g.cells.size > 0)); return numbersIn(g, 1, g.rows); };
const SUDOKUS: PenpaGenre[] = ["sudoku", "irregular-sudoku", "thermo-sudoku"];

const BUILD: Record<PenpaGenre, Build> = {
  slitherlink: numbersOnly(0, 4),
  nurikabe: numbersOnly(1),
  shikaku: numbersOnly(1),
  cave: numbersOnly(1),
  "square-jam": numbersOnly(1),
  "wittgenstein-briquet": numbersOnly(0, 4),
  minesweeper: numbersOnly(0, 8),
  fillomino: numbersOnly(1),
  numberlink(g) {
    nothingBut(g, "cells");
    const givens = numbersIn(g, 1), count = new Map<number, number>();
    for (const x of givens) if (x.kind === "number") count.set(x.value, (count.get(x.value) ?? 0) + 1);
    need(givens.length > 0 && [...count.values()].every((n) => n === 2));
    return { givens, ...(g.tags.includes("arukone") ? { rules: [{ rule: "links", cover: true }] } : {}) };
  },
  hitori(g) { nothingBut(g, "cells"); need(g.cells.size === g.rows * g.cols); return { givens: numbersIn(g, 1) }; },
  "simple-loop"(g) { nothingBut(g, "shaded"); need(g.shaded.size > 0); return { givens: [...g.shaded].map((i): Given => ({ at: "cell", cell: rcOf(g, i), kind: "block" })) }; },
  akari(g) {
    nothingBut(g, "shaded", "cells");
    need(g.shaded.size > 0 && [...g.cells.keys()].every((i) => g.shaded.has(i)));
    return { givens: [...[...g.shaded].map((i): Given => ({ at: "cell", cell: rcOf(g, i), kind: "block" })), ...numbersIn(g, 0, 4)] };
  },
  masyu(g) { nothingBut(g, "circles"); need(g.circles.size > 0); return { givens: [...g.circles].map(([i, n]): Given => ({ at: "cell", cell: rcOf(g, i), kind: "pearl", value: n === 1 ? "white" : "black" })) }; },
  "spiral-galaxies"(g) { nothingBut(g, "dots"); need(g.dots.length > 0); return { givens: g.dots.map((point): Given => ({ at: "point", point, kind: "galaxy" })) }; },
  "star-battle"(g) {
    // a number outside the frame beside a star: the stars per row, column and area
    const counts = g.starOutside ? g.outside.filter((o) => isInt(o.value)) : [];
    nothingBut({ ...g, outside: g.outside.filter((o) => !counts.includes(o)) }, "walls");
    const areas = areasOf(g);
    need(!!areas);
    let n = counts.length === 1 ? Number(counts[0].value) : 1;
    // the solution's stars say it too
    const stars = g.solution?.stars.size ? g.solution.stars.size : 0;
    if (stars && stars % g.rows === 0) n = stars / g.rows;
    need(n >= 1);
    return { areas: areas!, ...(n !== 1 ? { rules: [{ rule: "shaded-per-line", n }, { rule: "shaded-per-area", n }] } : {}) };
  },
  aquarium(g) {
    nothingBut(g, "walls", "outside");
    const areas = areasOf(g), seen = new Set<string>();
    need(!!areas && g.outside.length > 0);
    const givens = g.outside.map((o): Given => {
      const key = `${o.side === "top" || o.side === "bottom" ? "col" : "row"}${o.index}`;
      need(o.depth === 1 && isInt(o.value) && !seen.has(key));
      seen.add(key);
      return o.side === "top" || o.side === "bottom" ? { at: "col", index: o.index, kind: "total", value: Number(o.value) } : { at: "row", index: o.index, kind: "total", value: Number(o.value) };
    });
    return { areas: areas!, givens };
  },
  skyscrapers(g) {
    nothingBut(g, "outside", "cells");
    need(g.rows === g.cols && g.outside.length > 0);
    return { givens: [...edgeClues(g, "skyscraper", (v) => { need(isInt(v) && Number(v) >= 1 && Number(v) <= g.cols); return Number(v); }), ...numbersIn(g, 1, g.cols)] };
  },
  "easy-as-abc"(g) {
    nothingBut(g, "outside", "cells");
    const letter = (v: string) => { const k = LETTERS.indexOf(v.toUpperCase()); need(v.length === 1 && k >= 0); return k + 1; };
    const around = edgeClues(g, "first", letter);
    need(around.length > 0);
    const inside = [...g.cells].map(([i, v]): Given => ({ at: "cell", cell: rcOf(g, i), kind: "number", value: letter(v) }));
    const solved = g.solution ? [...g.solution.numbers.values()].filter((v) => /^[a-z]$/i.test(v)).map(letter) : [];
    const n = Math.max(3, ...[...around, ...inside].map((x) => (x as { value: number }).value), ...solved);
    need(n <= Math.min(g.rows, g.cols));
    return { givens: [...around, ...inside], ...(n !== 3 ? { rules: [{ rule: "letters", count: n }], style: { symbols: LETTERS.slice(0, n) } } : {}) };
  },
  nonogram(g) {
    nothingBut(g, "outside");
    need(g.outside.length > 0 && g.outside.every((o) => isInt(o.value)));
    // the clues above the columns and left of the rows, read towards the grid (or below and right)
    const runs = (side: Side, index: number, far: Side) => {
      const own = g.outside.filter((o) => o.side === side && o.index === index), other = g.outside.filter((o) => o.side === far && o.index === index);
      const list = own.length ? [...own].sort((a, b) => b.depth - a.depth) : [...other].sort((a, b) => a.depth - b.depth);
      const v = list.map((o) => Number(o.value)).filter((x) => x > 0);
      return v.length ? v : [0];
    };
    const givens: Given[] = [];
    for (let c = 0; c < g.cols; c++) givens.push({ at: "col", index: c, kind: "runs", value: runs("top", c, "bottom") });
    for (let r = 0; r < g.rows; r++) givens.push({ at: "row", index: r, kind: "runs", value: runs("left", r, "right") });
    return { givens };
  },
  sudoku(g) {
    nothingBut(g, "cells", "walls");
    need(!!standardBox(g.rows) && (!g.walls.length || sameAreas(areasOf(g), standardAreas(g))));
    return { givens: sudokuDigits(g) };
  },
  "irregular-sudoku"(g) {
    nothingBut(g, "cells", "walls");
    const areas = areasOf(g);
    need(!!areas && !sameAreas(areas, standardAreas(g)) && new Set(areas!.join("")).size === g.rows);
    return { areas: areas!, givens: sudokuDigits(g) };
  },
  "thermo-sudoku"(g) {
    nothingBut(g, "cells", "walls", "thermos");
    need(g.thermos.length > 0 && !!standardBox(g.rows) && (!g.walls.length || sameAreas(areasOf(g), standardAreas(g))));
    return { givens: [...sudokuDigits(g, false), ...g.thermos.map((cells): Given => ({ at: "cells", cells, kind: "thermo" }))] };
  },
};

/** The puzzle as this type, if what's drawn fits it. */
export function penpaSpec(g: PenpaGrid, genre: PenpaGenre): Spec | null {
  try {
    const spec: Spec = { ...BUILD[genre](g), genre, size: [g.rows, g.cols] };
    if (!spec.givens?.length) delete spec.givens;
    makePuzzle(spec);
    return spec;
  } catch { return null; }
}

/** Does the setter's solution solve it, by our rules? (null: it can't be said) */
export function solvedBy(spec: Spec, sol: Solution): boolean | null {
  let p;
  try { p = makePuzzle(spec); } catch { return false; }
  const b = emptyBoard(p.grid), g = p.grid;
  if (p.marks.includes("shade")) {
    const on = spec.genre === "star-battle" ? sol.stars : spec.genre === "akari" ? sol.bulbs : spec.genre === "minesweeper" && sol.mines.size ? sol.mines : sol.shaded;
    for (const i of on) b.shade[i] = 1;
  }
  if (p.marks.includes("loop")) for (const [a, c] of sol.lines) { const e = g.borderBetween(a, c); if (e < 0) return false; b.loop[g.borders[e].link] = 1; }
  /** the border between two corners */
  const borderOf = ([a, c]: [RC, RC]) => {
    const x = g.corner(...a), y = g.corner(...c);
    return g.cornerBorders[x]?.find((e) => g.borders[e].corners.includes(y)) ?? -1;
  };
  if (p.marks.includes("fence")) for (const e of sol.edges) { const k = borderOf(e); if (k < 0) return false; b.fence[k] = 1; }
  if (p.marks.includes("regions")) for (const e of sol.edges) { const k = borderOf(e); if (k >= 0) b.cut[k] = 1; }
  if (p.marks.includes("digit")) {
    for (const [i, gs] of p.cellGivens) for (const x of gs) if (x.kind === "number") b.digit[i] = x.value;
    const symbols = p.style.symbols;
    for (const [i, v] of sol.numbers) b.digit[i] = symbols ? symbols.indexOf(v.toUpperCase()) + 1 : Number(v);
  }
  // nothing in the solution for this type's marks: it can't say
  const said = p.marks.some((m) => (m === "shade" ? true : m === "loop" ? sol.lines.length : m === "fence" || m === "regions" ? sol.edges.length : m === "digit" ? sol.numbers.size : false));
  if (!said) return null;
  return check(p, b).length === 0;
}

/** A tag's name for "We don't have … yet". */
function tagName(tag: string) {
  const pid = PUZZLINK_NAMES[tag.replace(/\s+/g, "")] ? tag.replace(/\s+/g, "") : PUZZLINK_ALIASES[tag.replace(/\s+/g, "")];
  if (pid) return PUZZLINK_NAMES[pid];
  const words = tag.replace(/\b\w/g, (ch) => ch.toUpperCase());
  return SUDOKU_TAGS.has(tag) ? `${words} Sudoku` : words;
}

/** What a Penpa+ grid is: a puzzle of one type; several it could be; or a type we don't have. */
export function penpaPuzzle(g: PenpaGrid, chosen?: GenreName): PenpaResult | null {
  if (chosen) {
    if (!(PENPA_GENRES as readonly string[]).includes(chosen)) return null;
    const spec = penpaSpec(g, chosen as PenpaGenre);
    return spec ? { kind: "puzzle", spec } : null;
  }
  const tags = g.tags.map((t) => t.toLowerCase().trim()).filter((t) => !NOT_TYPES.has(t));
  const tagged = [...new Set(tags.flatMap((t) => (TAGS[t] ? [TAGS[t]] : [])))];
  // tagged as a type we don't have
  const other = tags.find((t) => !TAGS[t]);
  if (!tagged.length && other) return { kind: "unsupported", genreId: other, genreName: tagName(other) };
  // the types it's tagged as; else on Penpa+'s sudoku grid, the sudokus; else every type
  const pool = tagged.length ? tagged : g.gridtype === "sudoku" ? SUDOKUS : PENPA_GENRES;
  let fits = pool.flatMap((genre) => { const spec = penpaSpec(g, genre); return spec ? [spec] : []; });
  if (!fits.length) return tagged.length ? null : { kind: "unsupported", genreId: "unknown", genreName: "" };
  // the types the setter's solution solves
  if (fits.length > 1 && g.solution) {
    const solved = fits.filter((s) => solvedBy(s, g.solution!) === true);
    if (solved.length) fits = solved;
  }
  // numbers that all come in pairs: a Numberlink
  if (fits.length > 1 && fits.some((s) => s.genre === "numberlink")) fits = fits.filter((s) => s.genre === "numberlink");
  if (fits.length === 1) return { kind: "puzzle", spec: fits[0] };
  return { kind: "choose", genres: fits.map((s) => s.genre).sort((a, b) => KIND_NAMES[a].localeCompare(KIND_NAMES[b])) };
}
