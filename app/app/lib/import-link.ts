// A puzz.link or Penpa+ link read into a puzzle (/new's "Or paste a link"): the link's puzzle type
// and its clues, as the engine's spec (GridSpec), which paint then draws like any puzzle
// (games/paint-save.ts's paintFromSketch). A type we don't have, or a puzz.link variant ours doesn't
// match, comes back as unsupported, with the source's name for it, so the request can be noted.
// Penpa+ records no type, so its links are read in import-penpa.ts, which may ask the creator.
// Pure: no DOM, no database.
//
// The link format is pzprjs's (github.com/robx/pzprjs: src/pzpr/parser.js for the address,
// src/variety-common/Encode.js for the shared number and border codes, src/variety/*.js for each
// type's), reimplemented here from it. pzprjs is MIT licensed: (c) 2011, 2014 Kobayashi Daisuke
// (sabo2), (c) 2019 Robert Vollmert and contributors.
import { makePuzzle, type GenreName } from "~site/engine/puzzle.ts";
import { standardBox } from "~site/engine/rules.ts";
import type { Given, GridSpec, Side } from "~site/engine/types.ts";
import { PUZZLINK_ALIASES, PUZZLINK_NAMES } from "./puzzlink-genres";
import { penpaPuzzle, readPenpaGrid } from "./import-penpa";

export type LinkSource = "puzzlink" | "penpa";

export type LinkResult =
  /** a puzzle of one of our types */
  | { kind: "puzzle"; source: LinkSource; spec: GridSpec & { genre: GenreName } }
  /** a type we don't have (or a variant ours doesn't match): `genreId` and `genreName` are the
   *  source's; `variant` says what differs, when the type itself is one of ours */
  | { kind: "unsupported"; source: LinkSource; genreId: string; genreName: string; variant?: string }
  /** a Penpa+ puzzle that could be any of these: the creator says which */
  | { kind: "choose"; source: "penpa"; genres: GenreName[] }
  /** not a link we can read */
  | { kind: "unreadable" };

/** What /new says when a link doesn't open as a puzzle. */
export function linkNote(r: Exclude<LinkResult, { kind: "puzzle" }>): string {
  if (r.kind === "unreadable") return "That link didn't open. Check it's a puzz.link or Penpa+ link.";
  if (r.kind === "choose") return "Which type is it?";
  return `We don't have ${r.genreName || "that type"}${r.variant ? ` ${r.variant}` : ""} yet. We've noted the request.`;
}

/** The largest grid a sketch may have (games/sketch.ts). */
const MAX_SIZE = 30;

/** puzz.link's ids for the types we have, and ours. */
export const FROM_PUZZLINK: Record<string, GenreName> = {
  slither: "slitherlink", nurikabe: "nurikabe", simpleloop: "simple-loop", starbattle: "star-battle",
  lightup: "akari", shikaku: "shikaku", numlin: "numberlink", mashu: "masyu", cave: "cave",
  aquarium: "aquarium", squarejam: "square-jam", wittgen: "wittgenstein-briquet", hitori: "hitori",
  mines: "minesweeper", tentaisho: "spiral-galaxies", skyscrapers: "skyscrapers", easyasabc: "easy-as-abc",
  nonogram: "nonogram", sudoku: "sudoku", fillomino: "fillomino",
  // Numberlink with every cell used (unless flagged "e"): our Numberlink's "every cell used"
  arukone: "numberlink",
};

/** What a link says, read; or why it can't be. `chosen`: the type the creator said a Penpa+ puzzle is. */
export async function readLink(text: string, chosen?: GenreName): Promise<LinkResult> {
  const link = text.trim();
  if (!link || link.length > MAX_LINK) return { kind: "unreadable" };
  const puzzlink = readPuzzlink(link);
  if (puzzlink) return puzzlink;
  const grid = await readPenpaGrid(link);
  const penpa = grid && penpaPuzzle(grid, chosen);
  if (!penpa) return { kind: "unreadable" };
  if (penpa.kind === "puzzle") {
    if (penpa.spec.size[0] > MAX_SIZE || penpa.spec.size[1] > MAX_SIZE) return { kind: "unreadable" };
    return { kind: "puzzle", source: "penpa", spec: penpa.spec };
  }
  return { ...penpa, source: "penpa" };
}

/** The longest link read (a big Penpa+ puzzle with its solution is a few kilobytes). */
const MAX_LINK = 50_000;

// ---- puzz.link ----

/** A part of the link that doesn't fit its type. */
class Unreadable extends Error {}
/** Something in the puzzle our type doesn't have ("with ? clues"). */
class Variant extends Error {}

/** The type's id as pzprjs names it, from any id a link may use. */
const toPid = (name: string) => (PUZZLINK_NAMES[name] ? name : PUZZLINK_ALIASES[name] ?? "");

/** The parts of a pzprjs link: `?<type>/[v:<variant>/][<flags>/]<cols>/<rows>/<body>`. */
export function parsePuzzlink(link: string): { pid: string; urlPid: string; variant: string | null; flags: string; cols: number; rows: number; body: string } | null {
  const q = link.indexOf("?");
  if (q < 0) return null;
  // a link copied from a chat may carry a fragment or line breaks
  const parts = link.slice(q + 1).replace(/[\r\n]/g, "").replace(/#.*$/, "").split("/");
  // "type=editor&" and other parameters before the type
  const first = parts.shift()!.replace(/^(\w+=\w*&)+/, "");
  const urlPid = first.replace(/(_edit|_play)$/, "").toLowerCase();
  if (!/^[a-z0-9_]+$/.test(urlPid)) return null;
  let variant: string | null = null, flags = "";
  if (parts[0]?.startsWith("v:")) variant = parts.shift()!.slice(2);
  if (parts[0] !== undefined && parts[0] !== "" && Number.isNaN(Number(parts[0]))) flags = parts.shift()!;
  const cols = Number(parts.shift()), rows = Number(parts.shift());
  if (parts.length && !parts[parts.length - 1]) parts.pop();
  return { pid: toPid(urlPid), urlPid, variant, flags, cols, rows, body: parts.join("/") };
}

function readPuzzlink(link: string): LinkResult | null {
  const p = parsePuzzlink(link);
  if (!p) return null;
  if (!p.pid) return null;   // not a type puzz.link knows: not its link
  const unsupported = (variant?: string): LinkResult => ({ kind: "unsupported", source: "puzzlink", genreId: p.pid, genreName: PUZZLINK_NAMES[p.pid], ...(variant ? { variant } : {}) });
  const genre = FROM_PUZZLINK[p.pid];
  if (!genre) return unsupported();
  if (!Number.isInteger(p.cols) || !Number.isInteger(p.rows) || p.cols < 1 || p.rows < 1) return null;
  if (p.cols > MAX_SIZE || p.rows > MAX_SIZE) return unsupported(`over ${MAX_SIZE} × ${MAX_SIZE}`);
  if (p.variant !== null) return unsupported("with a variant rule");
  let parts: Omit<GridSpec, "size">;
  try {
    parts = DECODERS[p.pid](new Reader(p.body, p.rows, p.cols), p.flags);
  } catch (e) {
    if (e instanceof Variant) return unsupported(e.message);
    return null;
  }
  const out: GridSpec & { genre: GenreName } = { ...parts, genre, size: [p.rows, p.cols] };
  if (!out.givens?.length) delete out.givens;
  try { makePuzzle(out); } catch { return null; }
  return { kind: "puzzle", source: "puzzlink", spec: out };
}

/** The link's body, read a code at a time (each code takes what it needs and leaves the rest). */
class Reader {
  constructor(public s: string, public rows: number, public cols: number) {}
  get cells() { return this.rows * this.cols; }
  rc(i: number): [number, number] { return [Math.floor(i / this.cols), i % this.cols]; }

  /** decode4Cell: numbers 0-4 with the gap after them folded in; "." is a "?" */
  four(n = this.cells): (number | undefined)[] {
    const out: (number | undefined)[] = new Array(n), s = this.s;
    let c = 0, i = 0;
    for (; i < s.length; i++) {
      const ch = s[i];
      if (ch >= "0" && ch <= "4") out[c] = parseInt(ch, 16);
      else if (ch >= "5" && ch <= "9") { out[c] = parseInt(ch, 16) - 5; c++; }
      else if (ch >= "a" && ch <= "e") { out[c] = parseInt(ch, 16) - 10; c += 2; }
      else if (ch >= "g" && ch <= "z") c += parseInt(ch, 36) - 16;
      else if (ch === ".") out[c] = -2;
      else throw new Unreadable();
      c++;
      if (c >= n) break;
    }
    this.s = s.slice(i + 1);
    return out;
  }

  /** readNumber16: one number (hex, "-xx", "+xxx", …), "." for "?"; null if the code isn't one */
  private number16At(i: number): [number, number] | null {
    const s = this.s, ch = s[i];
    const hex = (from: number, len: number) => { const t = s.slice(from, from + len); if (t.length < len || !/^[0-9a-f]+$/.test(t)) throw new Unreadable(); return parseInt(t, 16); };
    if ((ch >= "0" && ch <= "9") || (ch >= "a" && ch <= "f")) return [parseInt(ch, 16), 1];
    if (ch === "-") return [hex(i + 1, 2), 3];
    if (ch === "+") return [hex(i + 1, 3), 4];
    if (ch === "=") return [hex(i + 1, 3) + 4096, 4];
    if (ch === "%" || ch === "@") return [hex(i + 1, 3) + 8192, 4];
    if (ch === "*") return [hex(i + 1, 4) + 12240, 5];
    if (ch === "$") return [hex(i + 1, 5) + 77776, 6];
    if (ch === ".") return [-2, 1];
    return null;
  }

  /** decodeNumber16: a number per cell, letters g-z skipping 1-20 cells */
  number16(n = this.cells): (number | undefined)[] {
    const out: (number | undefined)[] = new Array(n), s = this.s;
    let c = 0, i = 0;
    while (i < s.length && c < n) {
      const got = this.number16At(i), ch = s[i];
      if (got) { out[c++] = got[0]; i += got[1]; }
      else if (ch >= "g" && ch <= "z") { c += parseInt(ch, 36) - 15; i++; }
      else throw new Unreadable();
    }
    this.s = s.slice(i);
    return out;
  }

  /** decodeNumber16ExCell: the numbers outside the grid (one or two hex digits, "." for "?") */
  outside(n: number): (number | undefined)[] {
    const out: (number | undefined)[] = new Array(n), s = this.s;
    let c = 0, i = 0;
    for (; i < s.length; i++) {
      const ch = s[i];
      if ((ch >= "0" && ch <= "9") || (ch >= "a" && ch <= "f")) out[c] = parseInt(ch, 16);
      else if (ch === "-") { const t = s.slice(i + 1, i + 3); if (!/^[0-9a-f]{2}$/.test(t)) throw new Unreadable(); out[c] = parseInt(t, 16); i += 2; }
      else if (ch === ".") out[c] = -2;
      else if (ch >= "g" && ch <= "z") c += parseInt(ch, 36) - 16;
      else throw new Unreadable();
      c++;
      if (c >= n) break;
    }
    this.s = s.slice(i + 1);
    return out;
  }

  /** decodeHitori: a number per cell in base 36 ("-xx" for bigger), "." for an empty cell */
  hitori(): (number | undefined)[] {
    const out: (number | undefined)[] = new Array(this.cells), s = this.s;
    let c = 0, i = 0;
    for (; i < s.length; i++) {
      const ch = s[i];
      if (/[0-9a-z]/.test(ch)) out[c] = parseInt(ch, 36);
      else if (ch === "-") { out[c] = parseInt(s.slice(i + 1, i + 3), 36); i += 2; }
      else if (ch === "%" || ch === "@") out[c] = -2;
      else if (ch !== ".") throw new Unreadable();
      c++;
      if (c >= this.cells) { i++; break; }
    }
    this.s = s.slice(i);
    return out;
  }

  /** decodeBorder: the borders between cells side by side, then those between cells one above the
   *  other, five to a base-32 digit; each list as [cell, cell] pairs */
  borders(): [[number, number], [number, number]][] {
    const { rows, cols } = this, s = this.s, out: [[number, number], [number, number]][] = [];
    const nv = (cols - 1) * rows, nh = cols * (rows - 1);
    const pos1 = Math.min(Math.floor((nv + 4) / 5), s.length), pos2 = Math.min(Math.floor((nh + 4) / 5) + pos1, s.length);
    const bits = (from: number, to: number, count: number) => {
      const got: boolean[] = [];
      for (let i = from; i < to; i++) {
        const v = parseInt(s[i], 32);
        if (Number.isNaN(v)) throw new Unreadable();
        for (let w = 4; w >= 0; w--) if (got.length < count) got.push(!!(v & (1 << w)));
      }
      return got;
    };
    bits(0, pos1, nv).forEach((on, id) => { if (on) { const r = Math.floor(id / (cols - 1)), c = id % (cols - 1); out.push([[r, c], [r, c + 1]]); } });
    bits(pos1, pos2, nh).forEach((on, id) => { if (on) { const r = Math.floor(id / cols), c = id % cols; out.push([[r, c], [r + 1, c]]); } });
    this.s = s.slice(pos2);
    return out;
  }

  /** decodeCircle: three cells to a base-27 digit, each 0, 1 or 2 */
  three(): number[] {
    const n = this.cells, s = this.s, out: number[] = new Array(n).fill(0);
    const pos = Math.min(Math.floor((n + 2) / 3), s.length);
    for (let i = 0; i < pos; i++) {
      const v = parseInt(s[i], 27);
      if (Number.isNaN(v)) throw new Unreadable();
      [9, 3, 1].forEach((t, w) => { const c = i * 3 + w; if (c < n) out[c] = Math.floor(v / t) % 3; });
    }
    this.s = s.slice(pos);
    return out;
  }

  /** decodeBinary: five cells to a base-32 digit */
  binary(): boolean[] {
    const n = this.cells, s = this.s, out: boolean[] = new Array(n).fill(false);
    let c = 0, i = 0;
    for (; i < s.length; i++) {
      const v = parseInt(s[i], 32);
      if (Number.isNaN(v)) throw new Unreadable();
      for (let w = 4; w >= 0; w--) if (c < n) out[c++] = !!(v & (1 << w));
      if (c >= n) break;
    }
    this.s = s.slice(i + 1);
    return out;
  }

  /** decodeDot: dots on the cells, the lines between them and the inner corners (half-cell
   *  positions 1 to 2n-1 each way), each white (1) or black (2), with the gap to the next folded in */
  dots(): { y: number; x: number; v: number }[] {
    const w = 2 * this.cols - 1, max = w * (2 * this.rows - 1), s = this.s, out: { y: number; x: number; v: number }[] = [];
    let d = 0, i = 0;
    for (; i < s.length; i++) {
      const ch = s[i];
      if ((ch >= "0" && ch <= "9") || (ch >= "a" && ch <= "f")) {
        const v = parseInt(ch, 16);
        out.push({ x: (d % w) + 1, y: Math.floor(d / w) + 1, v: (v % 2) + 1 });
        d += (v >> 1) + 1;
      } else if (ch >= "g" && ch <= "z") d += parseInt(ch, 36) - 15;
      else throw new Unreadable();
      if (d >= max) break;
    }
    this.s = s.slice(i + 1);
    return out;
  }

  /** "n/" at the start (a star count, Easy as ABC's letters) */
  count(): number {
    const k = this.s.indexOf("/");
    const n = Number(k < 0 ? this.s : this.s.slice(0, k));
    if (!Number.isInteger(n) || n < 1) throw new Unreadable();
    this.s = k < 0 ? "" : this.s.slice(k + 1);
    return n;
  }
}

/** Cells with a number clue; "?" clues are a puzz.link variant ours lacks. */
function numbers(r: Reader, vals: (number | undefined)[], { min = 0, max = Infinity } = {}): Given[] {
  const out: Given[] = [];
  vals.forEach((v, i) => {
    if (v === undefined || v === -1) return;
    if (v === -2) throw new Variant("with ? clues");
    if (v < min || v > max) throw new Unreadable();
    out.push({ at: "cell", cell: r.rc(i), kind: "number", value: v });
  });
  return out;
}

/** Outlined areas from the thick borders: one letter per area. */
function areasFrom(r: Reader, walls: [[number, number], [number, number]][]): string[] {
  const { rows, cols } = r, of = new Array<number>(rows * cols).fill(-1);
  const cut = new Set(walls.map(([[r1, c1], [r2, c2]]) => `${r1},${c1}|${r2},${c2}`));
  const open = (a: [number, number], b: [number, number]) => !cut.has(`${a[0]},${a[1]}|${b[0]},${b[1]}`) && !cut.has(`${b[0]},${b[1]}|${a[0]},${a[1]}`);
  let n = 0;
  for (let s = 0; s < of.length; s++) {
    if (of[s] >= 0) continue;
    of[s] = n;
    const stack = [s];
    while (stack.length) {
      const i = stack.pop()!, [y, x] = r.rc(i);
      for (const [dy, dx] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
        const yy = y + dy, xx = x + dx, j = yy * cols + xx;
        if (yy < 0 || xx < 0 || yy >= rows || xx >= cols || of[j] >= 0 || !open([y, x], [yy, xx])) continue;
        of[j] = n; stack.push(j);
      }
    }
    n++;
  }
  // every wall must part two areas: a wall with the same area on both sides is a dead end, which
  // puzz.link allows in Aquarium (water flows round it) but our areas can't say
  if (walls.some(([[r1, c1], [r2, c2]]) => of[r1 * cols + c1] === of[r2 * cols + c2])) throw new Variant("with walls that don't close");
  const LETTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  if (n > LETTERS.length) throw new Variant(`with over ${LETTERS.length} areas`);
  return Array.from({ length: rows }, (_, y) => Array.from({ length: cols }, (_, x) => LETTERS[of[y * cols + x]]).join(""));
}

/** The numbers outside a grid with clues on all four sides (top, bottom, left, right), as edge clues. */
function aroundClues(r: Reader, vals: (number | undefined)[], kind: "first" | "skyscraper", max: number): Given[] {
  const { rows, cols } = r, out: Given[] = [];
  vals.forEach((v, i) => {
    if (v === undefined || v === -1) return;
    if (v === -2) throw new Variant("with ? clues");
    if (v < 1 || v > max) throw new Unreadable();
    const at: Side = i < cols ? "top" : i < 2 * cols ? "bottom" : i < 2 * cols + rows ? "left" : "right";
    const k = i < cols ? i : i < 2 * cols ? i - cols : i < 2 * cols + rows ? i - 2 * cols : i - 2 * cols - rows;
    const cell: [number, number] = at === "top" ? [0, k] : at === "bottom" ? [rows - 1, k] : at === "left" ? [k, 0] : [k, cols - 1];
    out.push({ at: "edge", cell, side: at, kind, value: v });
  });
  return out;
}

type Decoder = (r: Reader, flags: string) => Omit<GridSpec, "size">;

/** Each type's body, after pzprjs's Encode section for it. */
const DECODERS: Record<keyof typeof FROM_PUZZLINK, Decoder> = {
  slither(r, flags) {
    if (flags.includes("f")) throw new Variant("through every dot");
    return { givens: numbers(r, r.four(), { max: 4 }) };
  },
  nurikabe: (r) => ({ givens: numbers(r, r.number16(), { min: 1 }) }),
  simpleloop: (r) => ({ givens: r.binary().flatMap((on, i): Given[] => (on ? [{ at: "cell", cell: r.rc(i), kind: "block" }] : [])) }),
  starbattle(r) {
    const n = r.count(), areas = areasFrom(r, r.borders());
    return { areas, ...(n !== 1 ? { rules: [{ rule: "shaded-per-line", n }, { rule: "shaded-per-area", n }] } : {}) };
  },
  // a number on a black cell; "." a black cell with none
  lightup: (r) => ({
    givens: r.four().flatMap((v, i): Given[] => (v === undefined ? [] : [{ at: "cell", cell: r.rc(i), kind: "block" }, ...(v >= 0 ? [{ at: "cell" as const, cell: r.rc(i), kind: "number" as const, value: v }] : [])])),
  }),
  shikaku: (r) => ({ givens: numbers(r, r.number16(), { min: 1 }) }),
  numlin: (r) => ({ givens: numbers(r, r.number16(), { min: 1 }) }),
  arukone: (r, flags) => ({ givens: numbers(r, r.number16(), { min: 1 }), ...(flags.includes("e") ? {} : { rules: [{ rule: "links", cover: true }] }) }),
  // 1 white, 2 black; "f": the loop goes through every cell
  mashu(r, flags) {
    const givens = r.three().flatMap((v, i): Given[] => (v ? [{ at: "cell", cell: r.rc(i), kind: "pearl", value: v === 1 ? "white" : "black" }] : []));
    return { givens, ...(flags.includes("f") ? { rules: [{ rule: "loop", of: "loop", cover: true }] } : {}) };
  },
  cave: (r) => ({ givens: numbers(r, r.number16(), { min: 1 }) }),
  aquarium(r, flags) {
    // "r": one water level for a whole tank, even across parts the water can't flow between
    if (flags.includes("r")) throw new Variant("with one level per tank");
    const areas = areasFrom(r, r.borders());
    if (r.s.startsWith("/")) r.s = r.s.slice(1);
    const totals = r.outside(r.cols + r.rows), givens: Given[] = [];
    totals.forEach((v, i) => {
      if (v === undefined || v === -1) return;
      if (v === -2) throw new Variant("with ? clues");
      givens.push(i < r.cols ? { at: "col", index: i, kind: "total", value: v } : { at: "row", index: i - r.cols, kind: "total", value: v });
    });
    return { areas, givens };
  },
  squarejam: (r) => ({ givens: numbers(r, r.number16(), { min: 1 }) }),
  wittgen: (r) => ({ givens: numbers(r, r.four(), { max: 4 }) }),
  hitori: (r) => ({ givens: numbers(r, r.hitori()) }),
  mines: (r) => ({ givens: numbers(r, r.number16(), { max: 8 }) }),
  // white and black dots alike (black only colours its galaxy in); holes in the grid are a variant
  tentaisho(r) {
    const givens = r.dots().map(({ y, x }): Given => ({ at: "point", point: [y, x], kind: "galaxy" }));
    if (r.s && r.binary().some(Boolean)) throw new Variant("with holes");
    return { givens };
  },
  skyscrapers(r) {
    if (r.rows !== r.cols) throw new Unreadable();
    const n = r.cols, around = aroundClues(r, r.outside(2 * (r.rows + r.cols)), "skyscraper", n);
    return { givens: [...around, ...(r.s ? numbers(r, r.number16(), { min: 1, max: n }) : [])] };
  },
  easyasabc(r) {
    const n = r.count();
    if (n > Math.min(r.rows, r.cols) || n > 26) throw new Unreadable();
    const around = aroundClues(r, r.outside(2 * (r.rows + r.cols)), "first", n);
    const inside = r.s ? numbers(r, r.number16(), { min: 1, max: n }) : [];
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".slice(0, n);
    return { givens: [...around, ...inside], ...(n !== 3 ? { rules: [{ rule: "letters", count: n }], style: { symbols: letters } } : {}) };
  },
  // the clues above each column and beside each row, nearest the grid first
  nonogram(r) {
    const above = (r.rows + 1) >> 1, beside = (r.cols + 1) >> 1;
    const vals = r.outside(r.cols * above + r.rows * beside), givens: Given[] = [];
    const runs = (from: number, len: number) => {
      const got: number[] = [];
      for (let k = len - 1; k >= 0; k--) {
        const v = vals[from + k];
        if (v === undefined || v === -1) continue;
        if (v === -2) throw new Variant("with ? clues");
        if (v > 0) got.push(v);
      }
      return got.length ? got : [0];
    };
    for (let c = 0; c < r.cols; c++) givens.push({ at: "col", index: c, kind: "runs", value: runs(c * above, above) });
    for (let y = 0; y < r.rows; y++) givens.push({ at: "row", index: y, kind: "runs", value: runs(r.cols * above + y * beside, beside) });
    return { givens };
  },
  sudoku(r) {
    if (r.rows !== r.cols || !standardBox(r.cols)) throw new Unreadable();
    return { givens: numbers(r, r.number16(), { min: 1, max: r.cols }) };
  },
  fillomino(r, flags) {
    if (flags.includes("t")) throw new Variant("with sizes up to 3");
    const givens = numbers(r, r.number16(), { min: 1 });
    if (r.s && r.borders().length) throw new Variant("with given borders");
    return { givens };
  },
};
