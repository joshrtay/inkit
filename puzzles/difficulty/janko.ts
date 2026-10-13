// Janko's puzzles (janko.at; fetched into references/janko, local and non-commercial only) as our
// puzzles, with the test-solver's recorded moves: the order a person settled each mark.
//
// A file is a [begin] … [end] block of fields ("puzzle", "size" or "rows"/"cols", "author",
// "solver", …), the puzzle ([problem], or Star Battle's [areas]), [solution] and [moves]. A move
// is "<column letter><row letter>,<value>" on a cell, or "H…"/"V…" on a grid line (H: the line
// above the row letter, V: the line left of the column letter). Extra fields: a third is a color,
// a fourth a trial layer ("A"…"F": provisional marks, later kept or undone; skipped here); "-" or
// no value clears. Moves on boards past 26 use four digits instead of letters (not read: we only
// study small boards); "Z1", "L0" … are settings. The value 0 is the type's main mark (a star, a
// bulb, a shaded cell, a line), the other a dot or cross, except Masyu (a cell's links as bits:
// north 1, east 2, south 4, west 8), Fillomino (a digit) and Galaxies (a cell's color).
//
// Each move is read as facts on our deduction solver's marks (deduce.ts: shaded(cell),
// fence(border), line(link), cut(link)); the first move giving a mark its final value (Janko's
// solution) is when the person settled it. Marks people never touch (a loop's empty links, which
// they don't cross out) stay unsettled.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { makePuzzle } from "../../src/engine/puzzle.ts";
import type { Board, Given, GridSpec } from "../../src/engine/types.ts";
import type { Grid } from "../../src/engine/geometry.ts";

export interface Janko {
  spec: GridSpec; author: string; solver: string;
  /** mark → the move (1, 2, …) that first gave it its final value */
  settled: Map<string, number>;
  /** Janko's solution as our marks (every mark of the genre's kind) */
  truth: Map<string, boolean>;
  /** how many moves were read, and the share of the marks they touched whose last value is the
   *  solution's (near 1 when the moves are read right) */
  moves: number;
  agree: number;
}

const repo = new URL("../../", import.meta.url).pathname;
/** references/janko: this checkout's, or (in a worktree under .claude/worktrees) the main one's. */
export const JANKO_DIR = process.env.JANKO_DIR
  ?? [`${repo}references/janko/`, repo.replace(/\.claude\/worktrees\/[^/]+\/$/, "") + "references/janko/"].find((d) => existsSync(d))
  ?? `${repo}references/janko/`;

/** Janko's folder for each type, and our genre. */
export const JANKO_TYPES: Record<string, { folder: string; genre: string }> = {
  "star-battle": { folder: "Sternenschlacht", genre: "star-battle" },
  akari: { folder: "Akari", genre: "akari" },
  hitori: { folder: "Hitori", genre: "hitori" },
  fillomino: { folder: "Fillomino", genre: "fillomino" },
  masyu: { folder: "Masyu", genre: "masyu" },
  slitherlink: { folder: "Slitherlink", genre: "slitherlink" },
  nurikabe: { folder: "Nurikabe", genre: "nurikabe" },
  "spiral-galaxies": { folder: "Galaxien", genre: "spiral-galaxies" },
};

const section = (text: string, name: string) => {
  const m = new RegExp(`\\[${name}\\]\\n([\\s\\S]*?)\\n\\[`).exec(text);
  return m ? m[1].trim().split("\n").map((l) => l.trim()) : [];
};
const field = (text: string, name: string) => new RegExp(`^${name} (.*)$`, "m").exec(text)?.[1]?.trim() ?? "";
const table = (text: string, name: string) => section(text, name).map((l) => l.replace(/">/g, "").trim().split(/\s+/));

interface Move { kind: "cell" | "H" | "V"; r: number; c: number; value: string; color: string }
/** The moves in order, provisional (trial layer) moves and settings left out. */
function movesOf(text: string): Move[] {
  const out: Move[] = [];
  for (const raw of section(text, "moves").join("").split(";")) {
    const m = /^([HV]?)([a-z])([a-z])(?:,([^,]*))?(?:,([^,]*))?(?:,(.*))?$/.exec(raw.trim());
    if (!m || m[6]) continue;
    const [kind, a, b] = [m[1] || "cell", m[2].charCodeAt(0) - 97, m[3].charCodeAt(0) - 97];
    out.push({ kind: kind as Move["kind"], c: a, r: b, value: m[4] ?? "", color: m[5] ?? "" });
  }
  return out;
}

interface Raw { text: string; rows: number; cols: number; problem: string[][]; solution: string[][] }
function raw(file: string, puzzle: string): Raw | null {
  const text = readFileSync(file, "utf8");
  if (field(text, "puzzle").toLowerCase() !== puzzle || field(text, "depth")) return null;
  const size = Number(field(text, "size"));
  const rows = size || Number(field(text, "rows")), cols = size || Number(field(text, "cols"));
  if (!rows || !cols) return null;
  const problem = table(text, "problem"), solution = table(text, "solution");
  const fits = (t: string[][]) => t.length === rows && t.every((l) => l.length === cols);
  if (!fits(problem) || !fits(solution)) return null;
  return { text, rows, cols, problem, solution };
}

/** Settle marks from facts, move by move: the first move giving a mark its final value. */
function settle(truth: Map<string, boolean>, steps: [string, boolean][][]): Map<string, number> {
  const settled = new Map<string, number>();
  steps.forEach((facts, k) => {
    for (const [mark, v] of facts) if (!settled.has(mark) && truth.get(mark) === v) settled.set(mark, k + 1);
  });
  return settled;
}

function finish(r: Raw, spec: GridSpec, truth: Map<string, boolean>, steps: [string, boolean][][]): Janko {
  const last = new Map(steps.flat());
  const agree = [...last].filter(([m, v]) => truth.get(m) === v).length / (last.size || 1);
  return { spec, author: field(r.text, "author"), solver: field(r.text, "solver"), truth, settled: settle(truth, steps), moves: steps.length, agree };
}

const num = (s: string) => (/^\d+$/.test(s) ? Number(s) : NaN);

/** Cell-shading types: "0" shades (true), the other value marks it unshaded. */
function shadeMoves(r: Raw, yes: string, no: string): [string, boolean][][] {
  return movesOf(r.text).map((m): [string, boolean][] => {
    if (m.kind !== "cell" || m.r >= r.rows || m.c >= r.cols) return [];
    const mark = `shaded(${m.r * r.cols + m.c})`;
    return m.value === yes ? [[mark, true]] : m.value === no ? [[mark, false]] : [];
  });
}
const shadeTruth = (r: Raw, isShaded: (s: string) => boolean) =>
  new Map(r.solution.flat().map((s, i) => [`shaded(${i})`, isShaded(s)] as [string, boolean]));

export function readStarBattle(file: string): Janko | null {
  const text = readFileSync(file, "utf8");
  if (field(text, "puzzle") !== "starbattle") return null;
  const n = Number(field(text, "size")), stars = Number(field(text, "depth")) || 1;
  const areaRows = section(text, "areas").map((l) => l.split(/\s+/));
  // irregular boards (cells outside the board "@", blocked cells "#") aren't ours
  if (areaRows.length !== n || areaRows.flat().some((x) => x === "@" || x === "#")) return null;
  const ids = [...new Set(areaRows.flat())];
  if (ids.length > 26) return null;
  const areas = areaRows.map((row) => row.map((x) => String.fromCharCode(97 + ids.indexOf(x))).join(""));
  const solution = section(text, "solution").map((l) => l.split(/\s+/));
  const r: Raw = { text, rows: n, cols: n, problem: [], solution };
  const spec: GridSpec = { genre: "star-battle", size: [n, n], areas, rules: [{ rule: "shaded-per-line", n: stars }, { rule: "shaded-per-area", n: stars }, { rule: "no-touch" }] };
  // a star is "1" here, no star "0"
  return finish(r, spec, shadeTruth(r, (s) => s === "x"), shadeMoves(r, "1", "0"));
}

export function readAkari(file: string): Janko | null {
  const r = raw(file, "akari");
  if (!r || r.problem.flat().some((s) => !/^([-x]|[0-4])$/.test(s))) return null;
  const givens: Given[] = [];
  r.problem.forEach((row, y) => row.forEach((s, x) => {
    if (s === "-") return;
    givens.push({ at: "cell", cell: [y, x], kind: "block" });
    if (s !== "x") givens.push({ at: "cell", cell: [y, x], kind: "number", value: Number(s) });
  }));
  return finish(r, { genre: "akari", size: [r.rows, r.cols], givens }, shadeTruth(r, (s) => s === "o"), shadeMoves(r, "0", "2"));
}

const numberGivens = (r: Raw): Given[] | null => {
  const g: Given[] = [];
  for (let y = 0; y < r.rows; y++) for (let x = 0; x < r.cols; x++) {
    const s = r.problem[y][x];
    if (s === "-") continue;
    if (!/^\d+$/.test(s)) return null;
    g.push({ at: "cell", cell: [y, x], kind: "number", value: Number(s) });
  }
  return g;
};

export function readHitori(file: string): Janko | null {
  const r = raw(file, "hitori");
  const givens = r && numberGivens(r);
  if (!r || !givens || givens.length !== r.rows * r.cols) return null;
  return finish(r, { genre: "hitori", size: [r.rows, r.cols], givens }, shadeTruth(r, (s) => s === "x"), shadeMoves(r, "0", "1"));
}

export function readNurikabe(file: string): Janko | null {
  const r = raw(file, "nurikabe");
  const givens = r && numberGivens(r);
  if (!r || !givens) return null;
  return finish(r, { genre: "nurikabe", size: [r.rows, r.cols], givens }, shadeTruth(r, (s) => s === "x"), shadeMoves(r, "0", "1"));
}

/** A square grid's border ids by their place: "H r c" (the line above row r, cell c), "V r c". */
function borderIds(g: Grid): Map<string, number> {
  const out = new Map<string, number>();
  for (const b of g.borders) {
    const [r, c] = g.cornerRC(b.corners[0]);
    out.set(`${b.horizontal ? "H" : "V"} ${r} ${c}`, b.id);
  }
  return out;
}

export function readSlitherlink(file: string): Janko | null {
  const r = raw(file, "slitherlink");
  const givens = r && numberGivens(r);
  if (!r || !givens || r.solution.flat().some((s) => s !== "x" && s !== "-")) return null;
  const spec: GridSpec = { genre: "slitherlink", size: [r.rows, r.cols], givens };
  const g = makePuzzle(spec).grid, ids = borderIds(g);
  // [solution] marks the cells inside the loop; a border is on the loop where inside meets outside
  const inside = (c: number) => c >= 0 && r.solution[Math.floor(c / r.cols)][c % r.cols] === "x";
  const truth = new Map(g.borders.map((b) => [`fence(${b.id})`, inside(b.cells[0]) !== inside(b.cells[1])] as [string, boolean]));
  const steps = movesOf(r.text).map((m): [string, boolean][] => {
    const id = m.kind === "cell" ? undefined : ids.get(`${m.kind} ${m.r} ${m.c}`);
    if (id === undefined) return [];
    return m.value === "0" ? [[`fence(${id})`, true]] : m.value === "1" ? [[`fence(${id})`, false]] : [];
  });
  return finish(r, spec, truth, steps);
}

const DIRS = [[-1, 0, 1], [0, 1, 2], [1, 0, 4], [0, -1, 8]] as const;   // north, east, south, west: Janko's bits
const DIR_LETTER = "nesw";

export function readMasyu(file: string): Janko | null {
  const r = raw(file, "masyu");
  if (!r || r.problem.flat().some((s) => !/^[-wb12]$/.test(s))) return null;
  const givens: Given[] = [];
  r.problem.forEach((row, y) => row.forEach((s, x) => {
    if (s !== "-") givens.push({ at: "cell", cell: [y, x], kind: "pearl", value: s === "w" || s === "1" ? "white" : "black" });
  }));
  const spec: GridSpec = { genre: "masyu", size: [r.rows, r.cols], givens };
  const g = makePuzzle(spec).grid;
  const linkAt = (y: number, x: number, d: number): number => {
    const [dy, dx] = DIRS[d], y2 = y + dy, x2 = x + dx;
    if (y2 < 0 || x2 < 0 || y2 >= r.rows || x2 >= r.cols) return -1;
    return g.borders[g.borderBetween(y * r.cols + x, y2 * r.cols + x2)].link;
  };
  const truth = new Map<string, boolean>(g.links.map((l) => [`line(${l.id})`, false]));
  r.solution.forEach((row, y) => row.forEach((s, x) => {
    for (let d = 0; d < 4; d++) if (s !== "-" && s.includes(DIR_LETTER[d])) { const l = linkAt(y, x, d); if (l >= 0) truth.set(`line(${l})`, true); }
  }));
  // a move gives a cell's links as bits: a bit set draws that link, a bit cleared erases it
  const bits = new Map<number, number>();
  const steps = movesOf(r.text).map((m): [string, boolean][] => {
    if (m.kind !== "cell" || m.r >= r.rows || m.c >= r.cols) return [];
    const i = m.r * r.cols + m.c, before = bits.get(i) ?? 0;
    const v = m.value === "-" || m.value === "" ? 0 : num(m.value);
    if (!Number.isFinite(v)) return [];
    const now = v & 15;
    bits.set(i, now);
    const facts: [string, boolean][] = [];
    for (let d = 0; d < 4; d++) {
      const bit = DIRS[d][2], l = linkAt(m.r, m.c, d);
      if (l < 0 || (now & bit) === (before & bit)) continue;
      facts.push([`line(${l})`, (now & bit) !== 0]);
    }
    return facts;
  });
  return finish(r, spec, truth, steps);
}

/** Region types: a cell's value (a digit, a color) against its neighbours' says whether the link
 *  between them is cut (values differ) or not; drawn lines ("0") and crosses ("1") say so outright. */
function regionMoves(r: Raw, g: Grid, start: (string | null)[], clear: (v: string) => boolean): [string, boolean][][] {
  const val = start.slice(), ids = borderIds(g);
  return movesOf(r.text).map((m): [string, boolean][] => {
    if (m.kind !== "cell") {
      const id = ids.get(`${m.kind} ${m.r} ${m.c}`);
      const link = id === undefined ? -1 : g.borders[id].link;
      if (link < 0) return [];
      return m.value === "0" ? [[`cut(${link})`, true]] : m.value === "1" ? [[`cut(${link})`, false]] : [];
    }
    if (m.r >= r.rows || m.c >= r.cols) return [];
    const i = m.r * r.cols + m.c;
    if (clear(m.value)) { val[i] = null; return []; }
    val[i] = m.value;
    return g.cellLinks[i].flatMap((l): [string, boolean][] => {
      const j = g.links[l].cells.find((c) => c !== i)!;
      return val[j] === null ? [] : [[`cut(${l})`, val[j] !== val[i]]];
    });
  });
}
const cutTruth = (r: Raw, g: Grid) => new Map(g.links.map((l) => {
  const [a, b] = l.cells.map((c) => r.solution[Math.floor(c / r.cols)][c % r.cols]);
  return [`cut(${l.id})`, a !== b] as [string, boolean];
}));

export function readFillomino(file: string): Janko | null {
  const r = raw(file, "fillomino");
  const givens = r && numberGivens(r);
  if (!r || !givens || r.solution.flat().some((s) => !/^\d+$/.test(s))) return null;
  const spec: GridSpec = { genre: "fillomino", size: [r.rows, r.cols], givens };
  const g = makePuzzle(spec).grid;
  const start = r.problem.flat().map((s) => (s === "-" ? null : s));
  return finish(r, spec, cutTruth(r, g), regionMoves(r, g, start, (v) => v === "" || v === "-" || !/^\d+$/.test(v)));
}

export function readGalaxies(file: string): Janko | null {
  const r = raw(file, "galaxies");
  if (!r || r.problem.flat().some((s) => !/^[-0-3]$/.test(s))) return null;
  // a dot in a cell: 0 at its centre, 1 on its right side, 2 on its bottom side, 3 at its bottom right corner
  const givens: Given[] = [];
  r.problem.forEach((row, y) => row.forEach((s, x) => {
    if (s === "-") return;
    const v = Number(s);
    givens.push({ at: "point", point: [2 * y + 1 + (v & 2 ? 1 : 0), 2 * x + 1 + (v & 1 ? 1 : 0)], kind: "galaxy" });
  }));
  const spec: GridSpec = { genre: "spiral-galaxies", size: [r.rows, r.cols], givens };
  const g = makePuzzle(spec).grid;
  const start = new Array<string | null>(r.rows * r.cols).fill(null);
  return finish(r, spec, cutTruth(r, g), regionMoves(r, g, start, (v) => v === "" || v === "-" || v === "0"));
}

export const READERS: Record<string, (file: string) => Janko | null> = {
  "star-battle": readStarBattle, akari: readAkari, hitori: readHitori, fillomino: readFillomino, masyu: readMasyu,
  slitherlink: readSlitherlink, nurikabe: readNurikabe, "spiral-galaxies": readGalaxies,
};

/** Does a board (from the engine's solve) hold exactly Janko's solution? */
export function matches(j: Janko, grid: Grid, b: Board): boolean {
  for (const [mark, v] of j.truth) {
    const m = /^(\w+)\((\d+)\)$/.exec(mark)!, id = Number(m[2]);
    const on = m[1] === "shaded" ? b.shade[id] === 1 : m[1] === "fence" ? b.fence[id] === 1
      : m[1] === "line" ? b.loop[id] === 1 : b.cut[grid.links[id].border] === 1;
    if (on !== v) return false;
  }
  return true;
}

/** A type's puzzles (file names sorted), read; those that don't convert left out. */
export function readType(type: string): { f: string; j: Janko }[] {
  const dir = `${JANKO_DIR}${JANKO_TYPES[type].folder}/`;
  return readdirSync(dir).filter((f) => f.endsWith(".txt")).sort().flatMap((f) => {
    const j = READERS[type](dir + f);
    return j ? [{ f, j }] : [];
  });
}
