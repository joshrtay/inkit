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
  "sudoku", "irregular-sudoku", "thermo-sudoku", "fillomino", "simple-path", "slitherlink-path", "hamiltonian-plumbers",
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

/** Circle styles as pearls: white (1, or 8 with a thick outline), black (2). */
const PEARLS: Record<number, number> = { 1: 1, 8: 1, 2: 2 };
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
  /** cells the setter took out of the grid (Penpa+'s Board mode), inside its frame */
  holes: Set<number>;
  /** cells with a clue of no value: an empty circle, or a circled blank (a Shikaku's "any size") */
  blanks: Set<number>;
  /** every symbol in a cell, as its name and style ("circle_M 1"): shapes that pair up, as in a Numberlink of shapes */
  symbols: Map<number, string>;
  /** symbols outside the frame, by "row,col" (a Hamiltonian Plumbers pipe end's shape) */
  outsideSymbols: Map<string, string>;
  /** circles in cells: 1 white, 2 black */
  circles: Map<number, number>;
  /** small dots anywhere, in half-cell units ([2r+1, 2c+1] a cell's centre) */
  dots: RC[];
  /** thick borders between two cells of the grid */
  walls: [RC, RC][];
  thermos: RC[][];
  /** lines from a cell out through the frame: a path's way in and way out */
  doors: { cell: RC; side: Side }[];
  /** corners on the frame with a line (or an arrow) out of the grid: the ends of a path along the grid lines */
  ends: RC[];
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
  let [top, bottom, left, right] = space.map(Number);
  let kept: RC[] = [];
  let rows = ny - top - bottom, cols = nx - left - right;
  if (!(rows > 0 && cols > 0)) return null;
  // the cells the setter kept (Penpa+'s centerlist, each after the one before): when they make a
  // smaller rectangle, that's the puzzle, and what's drawn beside it (clues in cells the setter
  // left as plain grid) is outside it
  try {
    const deltas = JSON.parse(lines[5] ?? "[]");
    if (Array.isArray(deltas) && deltas.length && deltas.every(Number.isInteger)) {
      const all = new Points(nx, ny, top, left, rows, cols);
      let k = 0;
      const at = deltas.map((d: number) => all.center((k += d)));
      if (at.every((c) => c && all.inside(c))) {
        kept = [...new Map(at.map((c) => [`${c}`, c!])).values()];
        const rs = kept.map((c) => c[0]), cs = kept.map((c) => c[1]);
        const r0 = Math.min(...rs), c0 = Math.min(...cs), h = Math.max(...rs) - r0 + 1, w = Math.max(...cs) - c0 + 1;
        if (h < rows || w < cols) { top += r0; left += c0; rows = h; cols = w; kept = kept.map(([r, c]) => [r - r0, c - c0]); }
      } else kept = [];
    }
  } catch { /* every cell */ }
  const pt = new Points(nx, ny, top, left, rows, cols);

  const g: PenpaGrid = { rows, cols, gridtype, tags, cells: new Map(), outside: [], shaded: new Set(), holes: new Set(), blanks: new Set(), symbols: new Map(), outsideSymbols: new Map(), circles: new Map(), dots: [], walls: [], thermos: [], doors: [], ends: [], starOutside: false, solution: null };
  if (kept.length && kept.length < rows * cols) {
    const on = new Set(kept.map(([r, c]) => r * cols + c));
    for (let i = 0; i < rows * cols; i++) if (!on.has(i)) g.holes.add(i);
  }
  const obj = (k: string) => (q[k] && typeof q[k] === "object" ? q[k] as Record<string, unknown> : {});
  for (const [k, v] of Object.entries(obj("number"))) {
    if (!Array.isArray(v)) continue;
    const at = pt.center(Number(k)), value = String(v[0] ?? "").trim(), type = String(v[2]);
    if (at && !value && pt.inside(at) && v[1] === 7) g.blanks.add(pt.id(at));   // a circle with nothing in it
    if (!at || !value || !["1", "5", "6", "10"].includes(type)) continue;
    if (pt.inside(at)) g.cells.set(pt.id(at), value);
    else { const o = pt.outside(at); if (o) g.outside.push({ ...o, value }); }
  }
  for (const [k, v] of Object.entries(obj("surface"))) {
    const at = pt.center(Number(k));
    if (at && pt.inside(at) && GIVEN_SHADES.has(Number(v))) g.shaded.add(pt.id(at));
  }
  const onFrame = ([r, c]: RC) => r >= 0 && c >= 0 && r <= rows && c <= cols && (r === 0 || c === 0 || r === rows || c === cols);
  const offGrid = ([r, c]: RC) => r < 0 || c < 0 || r > rows || c > cols;
  for (const [k, v] of Object.entries(obj("symbol"))) {
    if (!Array.isArray(v)) continue;
    const [n, name] = v as [number, string];
    const at = pt.center(Number(k));
    if (at && pt.inside(at) && typeof name === "string") g.symbols.set(pt.id(at), `${name} ${n}`);
    else if (at && typeof name === "string" && Math.floor(Number(k) / pt.N) === 0) g.outsideSymbols.set(`${at}`, `${name} ${n}`);
    if ((name === "circle_SS" || name === "circle_S") && n >= 1) { const h = pt.half(Number(k)); if (h) g.dots.push(h); }
    else if (at && pt.inside(at) && /^circle_(L|M)$/.test(name) && PEARLS[n]) g.circles.set(pt.id(at), PEARLS[n]);
    else if (at && !pt.inside(at) && name === "star") g.starOutside = true;
    else if (name.startsWith("arrow")) {
      const d = pt.frameEdge(Number(k)), v = pt.corner(Number(k)) ?? pt.cornerOut(Number(k));
      if (d) g.doors.push(d); else if (v && onFrame(v)) g.ends.push(v);
    }
  }
  // how many lines meet at each point: a stub out of the grid stops where it ends (a nonogram's
  // lines through its clues run on)
  const meets = new Map<string, number>();
  for (const k of Object.keys(obj("lineE"))) for (const x of k.split(",")) meets.set(x, (meets.get(x) ?? 0) + 1);
  for (const [k, v] of Object.entries(obj("lineE"))) {
    // a stub from the frame out of the grid: an end
    const [ka, kb] = k.split(","), [a, b] = [ka, kb].map((x) => pt.corner(Number(x)));
    if (a && b) {
      const end = onFrame(a) && offGrid(b) && meets.get(kb) === 1 ? a : onFrame(b) && offGrid(a) && meets.get(ka) === 1 ? b : null;
      if (end) { g.ends.push(end); continue; }
    }
    if (!THICK.has(Number(v))) continue;
    const wall = pt.edge(k);
    if (wall) g.walls.push(wall);
  }
  for (const k of Object.keys(obj("line"))) {
    // a line from a cell's centre (inside or out) to the middle of the frame beside it: a door there
    const ks = k.split(",").map(Number), mid = ks.map((x) => pt.frameEdge(x)).find((d) => d);
    if (mid && ks.some((x) => pt.center(x))) { g.doors.push(mid); continue; }
    const [a, b] = ks.map((x) => pt.center(x));
    if (!a || !b || pt.inside(a) === pt.inside(b) || Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) !== 1) continue;
    const [cell, out] = pt.inside(a) ? [a, b] : [b, a];
    const side: Side = out[0] < cell[0] ? "top" : out[0] > cell[0] ? "bottom" : out[1] < cell[1] ? "left" : "right";
    g.doors.push({ cell, side });
  }
  g.ends = [...new Map(g.ends.map((v) => [`${v}`, v])).values()];
  // an arrow and a line through the same opening: one door
  g.doors = [...new Map(g.doors.map((d) => [`${d.cell}${d.side}`, d])).values()];
  if (Array.isArray(q.thermo)) for (const t of q.thermo as unknown[]) {
    if (!Array.isArray(t)) continue;
    const cells = t.map((k) => pt.center(Number(k)));
    if (cells.length >= 2 && cells.every((c) => c && pt.inside(c))) g.thermos.push(cells as RC[]);
  }
  const a = params.get("a");
  if (a) try { g.solution = solutionOf(JSON.parse(await inflate(a)), pt); } catch { /* none */ }
  // a circle drawn around a number (a Shikaku's circled clues) is part of the number
  for (const i of g.cells.keys()) g.circles.delete(i);
  for (const i of g.blanks) g.circles.delete(i);
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
  /** the middle of a stretch of the frame (an arrow there marks a way in or out): the cell inside it and its side */
  frameEdge(k: number): { cell: RC; side: Side } | null {
    const type = Math.floor(k / this.N), base = k - type * this.N;
    const r = Math.floor(base / this.nx0) - 2 - this.top, c = (base % this.nx0) - 2 - this.left;
    if (type === 2 && c >= 0 && c < this.cols && (r === -1 || r === this.rows - 1)) return r < 0 ? { cell: [0, c], side: "top" } : { cell: [r, c], side: "bottom" };
    if (type === 3 && r >= 0 && r < this.rows && (c === -1 || c === this.cols - 1)) return c < 0 ? { cell: [r, 0], side: "left" } : { cell: [r, c], side: "right" };
    return null;
  }
  /** the middle of a stretch of line just outside the frame, running out from a frame corner (an
   *  arrow there marks an end of a path along the grid lines): that corner */
  cornerOut(k: number): RC | null {
    const type = Math.floor(k / this.N), base = k - type * this.N;
    const r = Math.floor(base / this.nx0) - 2 - this.top, c = (base % this.nx0) - 2 - this.left;
    if (type === 3 && (r === -1 || r === this.rows) && c >= -1 && c < this.cols) return [r < 0 ? 0 : this.rows, c + 1];
    if (type === 2 && (c === -1 || c === this.cols) && r >= -1 && r < this.rows) return [r + 1, c < 0 ? 0 : this.cols];
    return null;
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
/** A nonogram's mark for a row or column with no clue (any pattern). */
const NO_CLUE = new Set(["*", "＊", "?"]);
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
const nothingBut = (g: PenpaGrid, ...uses: ("cells" | "outside" | "shaded" | "circles" | "dots" | "walls" | "thermos" | "doors" | "ends")[]) => {
  const has = { cells: g.cells.size > 0, outside: g.outside.length > 0, shaded: g.shaded.size > 0, circles: g.circles.size > 0, dots: g.dots.length > 0, walls: g.walls.length > 0, thermos: g.thermos.length > 0, doors: g.doors.length > 0, ends: g.ends.length > 0 };
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
/** A grid of symbols other than numbers (letters, @ % &): each one, in order, and the cells' values
 *  as their places in it (1 up); with the solution's, when there are n of them in all. */
function symbolsIn(g: PenpaGrid, n?: number): { symbols: string; givens: Given[] } {
  const seen = [...new Set([...g.cells.values(), ...(g.solution?.numbers.values() ?? [])].map((v) => v.toUpperCase()))].sort();
  need(seen.length > 0 && seen.every((v) => [...v].length === 1 && !/\d/.test(v)) && (n === undefined || seen.length === n));
  const symbols = seen.join("");
  return { symbols, givens: [...g.cells].map(([i, v]): Given => ({ at: "cell", cell: rcOf(g, i), kind: "number", value: symbols.indexOf(v.toUpperCase()) + 1 })) };
}
const SUDOKUS: PenpaGenre[] = ["sudoku", "irregular-sudoku", "thermo-sudoku"];

const BUILD: Record<PenpaGenre, Build> = {
  slitherlink: numbersOnly(0, 4),
  "slitherlink-path"(g) {
    nothingBut(g, "cells", "ends");
    need(g.ends.length === 2);
    return { givens: [...numbersIn(g, 0, 3), ...g.ends.map((corner): Given => ({ at: "corner", corner, kind: "end" }))] };
  },
  nurikabe: numbersOnly(1),
  shikaku(g) {
    // empty circles (beside circled numbers): rectangles of any size
    const blanks = [...g.blanks, ...(g.cells.size ? [...g.circles.keys()] : [])];
    nothingBut({ ...g, circles: new Map() }, "cells");
    need(g.cells.size > 0 && g.cells.size + blanks.length < g.rows * g.cols);
    const givens = numbersIn(g, 1);
    if (!blanks.length) return { givens };
    return { givens: [...givens, ...blanks.map((i): Given => ({ at: "cell", cell: rcOf(g, i), kind: "symbol", value: "?" }))], rules: [{ rule: "one-each", of: "any" }] };
  },
  cave: numbersOnly(1),
  "square-jam": numbersOnly(1),
  "wittgenstein-briquet": numbersOnly(0, 4),
  minesweeper: numbersOnly(0, 8),
  fillomino: numbersOnly(1),
  numberlink(g) {
    // shapes instead of numbers (circles, triangles, diamonds): each kind a number
    if (!g.cells.size && g.symbols.size) {
      nothingBut({ ...g, circles: new Map() }, "circles");
      const kinds = [...new Set(g.symbols.values())];
      const givens = [...g.symbols].map(([i, v]): Given => ({ at: "cell", cell: rcOf(g, i), kind: "number", value: kinds.indexOf(v) + 1 }));
      need(kinds.every((v) => [...g.symbols.values()].filter((x) => x === v).length === 2));
      return { givens };
    }
    nothingBut(g, "cells");
    // letters (or signs) instead of numbers: each a number
    const givens = [...g.cells.values()].every(isInt) ? numbersIn(g, 1) : symbolsIn(g).givens, count = new Map<number, number>();
    for (const x of givens) if (x.kind === "number") count.set(x.value, (count.get(x.value) ?? 0) + 1);
    need(givens.length > 0 && [...count.values()].every((n) => n === 2));
    return { givens, ...(g.tags.includes("arukone") ? { rules: [{ rule: "links", cover: true }] } : {}) };
  },
  hitori(g) {
    nothingBut(g, "cells");
    need(g.cells.size === g.rows * g.cols);
    if ([...g.cells.values()].every(isInt)) return { givens: numbersIn(g, 1) };
    // letters or signs: each a number, since only which cells match matters (shown as numbers)
    return { givens: symbolsIn(g).givens };
  },
  "hamiltonian-plumbers"(g) {
    // pipe ends: a shape outside the frame with a line into the grid, each kind of shape a number;
    // crossings: a cross with all four arms (one with none is decoration); shading, rocks
    const out = (d: { cell: RC; side: Side }): RC => [d.cell[0] + (d.side === "top" ? -1 : d.side === "bottom" ? 1 : 0), d.cell[1] + (d.side === "left" ? -1 : d.side === "right" ? 1 : 0)];
    // (or a letter there)
    const label = (d: { cell: RC; side: Side }) => g.outside.find((o) => o.side === d.side && o.depth === 1 && o.index === (d.side === "top" || d.side === "bottom" ? d.cell[1] : d.cell[0]))?.value;
    const ends = g.doors.map((d) => ({ ...d, shape: g.outsideSymbols.get(`${out(d)}`) ?? label(d) }));
    need(ends.length >= 2 && ends.every((e) => e.shape));
    const kinds = [...new Set(ends.map((e) => e.shape!))];
    need(kinds.every((k) => ends.filter((e) => e.shape === k).length === 2));
    // (with fewer arms, it's another type: three-way joins)
    const crosses = [...g.symbols].filter(([, v]) => v === "cross 1,1,1,1").map(([i]) => i);
    need(![...g.symbols.values()].some((v) => /^cross /.test(v) && v !== "cross 1,1,1,1" && v !== "cross 0,0,0,0"));
    nothingBut({ ...g, circles: new Map(), doors: [], outside: [] }, "shaded");
    return { givens: [
      ...ends.map((e): Given => ({ at: "edge", cell: e.cell, side: e.side, kind: "inlet", value: kinds.indexOf(e.shape!) + 1 })),
      ...crosses.map((i): Given => ({ at: "cell", cell: rcOf(g, i), kind: "crossing" })),
      ...[...g.shaded].map((i): Given => ({ at: "cell", cell: rcOf(g, i), kind: "block" })),
    ] };
  },
  "simple-path"(g) {
    // a way in and a way out (which is which doesn't matter: the path runs either way), rocks, walls
    nothingBut(g, "doors", "shaded", "walls");
    need(g.doors.length === 2);
    return { givens: [
      ...g.doors.map(({ cell, side }, k): Given => ({ at: "edge", cell, side, kind: "door", role: k ? "out" : "in" })),
      ...[...g.shaded].map((i): Given => ({ at: "cell", cell: rcOf(g, i), kind: "block" })),
      ...g.walls.map((cells): Given => ({ at: "border", cells, kind: "wall" })),
    ] };
  },
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
    const all = [...g.outside.map((o) => o.value), ...g.cells.values(), ...(g.solution?.numbers.values() ?? [])].map((v) => v.toUpperCase());
    need(all.every((v) => v.length === 1 && LETTERS.includes(v)));
    // A, B, C… up to the last one used; else (P, U, Z) the letters used, in order
    const last = Math.max(3, ...all.map((v) => LETTERS.indexOf(v) + 1));
    const used = [...new Set(all)].sort().join("");
    const symbols = last <= Math.min(g.rows, g.cols) ? LETTERS.slice(0, last) : used;
    const letter = (v: string) => { const k = symbols.indexOf(v.toUpperCase()); need(k >= 0); return k + 1; };
    const around = edgeClues(g, "first", letter);
    need(around.length > 0);
    const inside = [...g.cells].map(([i, v]): Given => ({ at: "cell", cell: rcOf(g, i), kind: "number", value: letter(v) }));
    const n = symbols.length;
    need(n <= Math.min(g.rows, g.cols));
    return { givens: [...around, ...inside], ...(symbols !== "ABC" ? { rules: [{ rule: "letters", count: n }], style: { symbols } } : {}) };
  },
  nonogram(g) {
    nothingBut(g, "outside");
    need(g.outside.length > 0 && g.outside.every((o) => isInt(o.value) || NO_CLUE.has(o.value)));
    // the clues above the columns and left of the rows, read towards the grid (or below and right)
    const runs = (side: Side, index: number, far: Side) => {
      const own = g.outside.filter((o) => o.side === side && o.index === index), other = g.outside.filter((o) => o.side === far && o.index === index);
      const list = own.length ? [...own].sort((a, b) => b.depth - a.depth) : [...other].sort((a, b) => a.depth - b.depth);
      if (list.some((o) => NO_CLUE.has(o.value))) return null;
      const v = list.map((o) => Number(o.value)).filter((x) => x > 0);
      return v.length ? v : [0];
    };
    const givens: Given[] = [];
    for (let c = 0; c < g.cols; c++) { const value = runs("top", c, "bottom"); if (value) givens.push({ at: "col", index: c, kind: "runs", value }); }
    for (let r = 0; r < g.rows; r++) { const value = runs("left", r, "right"); if (value) givens.push({ at: "row", index: r, kind: "runs", value }); }
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
    if ([...g.cells.values()].every(isInt)) return { areas: areas!, givens: sudokuDigits(g) };
    // a sudoku of letters: one of each per row, column and area
    need(g.rows === g.cols);
    const { symbols, givens } = symbolsIn(g, g.rows);
    return { areas: areas!, givens, style: { symbols } };
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
    // cells taken out of the grid: rocks
    if (g.holes.size) spec.givens = [...(spec.givens ?? []).filter((x) => !(x.at === "cell" && g.holes.has(x.cell[0] * g.cols + x.cell[1]))),
      ...[...g.holes].map((i): Given => ({ at: "cell", cell: rcOf(g, i), kind: "block" }))];
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
