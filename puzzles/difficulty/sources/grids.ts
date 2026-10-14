// Janko's grid format (and puzzlekit-dataset's, which copies it) as our engine's puzzles: a puzzle
// is a block of rows of space-separated tokens ([problem]), sometimes with outlined areas
// ([areas]), the clues around the grid ([clabels]: top then bottom; [rlabels]: left then right)
// and a solution. Spec only: the recorded moves are janko.ts's business.
//
// One reader per genre of ours, keyed by our genre name. A reader returns null when the puzzle
// uses something ours doesn't have (a "?" clue, a hole in the grid, an area count past 62).
import { makePuzzle, type GenreName } from "../../../src/engine/puzzle.ts";
import { standardBox } from "../../../src/engine/rules.ts";
import type { Given, GridSpec, RuleSpec, Side } from "../../../src/engine/types.ts";

export interface GridRecord {
  rows: number; cols: number;
  /** the type's extra number: stars per line, mines (unused), letters, the largest digit */
  depth?: string;
  problem?: string[][]; areas?: string[][]; clabels?: string[][]; rlabels?: string[][]; solution?: string[][];
}

export type Spec = GridSpec & { genre: GenreName };
type Reader = (r: GridRecord) => Omit<GridSpec, "size"> | null;

const LETTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const isNum = (s: string) => /^\d+$/.test(s);
const fits = (t: string[][] | undefined, r: GridRecord) => !!t && t.length === r.rows && t.every((l) => l.length === r.cols);

/** Every cell's number as a clue; any other token than "-" or a number fails. */
function numbers(r: GridRecord, { min = 0, max = Infinity, extra }: { min?: number; max?: number; extra?: (s: string, cell: [number, number]) => Given[] | null } = {}): Given[] | null {
  if (!fits(r.problem, r)) return null;
  const out: Given[] = [];
  for (let y = 0; y < r.rows; y++) for (let x = 0; x < r.cols; x++) {
    const s = r.problem![y][x];
    if (s === "-" || s === ".") continue;
    if (isNum(s)) {
      const v = Number(s);
      if (v < min || v > max) return null;
      out.push({ at: "cell", cell: [y, x], kind: "number", value: v });
      continue;
    }
    const more = extra?.(s, [y, x]);
    if (!more) return null;
    out.push(...more);
  }
  return out;
}

/** Outlined areas from a grid of area ids. */
function areasOf(t: string[][] | undefined, r: GridRecord): string[] | null {
  if (!fits(t, r) || t!.flat().some((x) => x === "@" || x === "#" || x === "-")) return null;
  const ids = [...new Set(t!.flat())];
  if (ids.length > LETTERS.length) return null;
  return t!.map((row) => row.map((x) => LETTERS[ids.indexOf(x)]).join(""));
}

/** Clues around the grid: [clabels] top then bottom, [rlabels] left then right. */
function around(r: GridRecord, kind: "first" | "skyscraper", value: (s: string) => number | null): Given[] | null {
  const out: Given[] = [];
  const side = (line: string[] | undefined, at: Side, n: number) => {
    if (!line) return true;
    if (line.length !== n) return false;
    for (let k = 0; k < n; k++) {
      const s = line[k];
      if (s === "-" || s === ".") continue;
      const v = value(s);
      if (v === null) return false;
      const cell: [number, number] = at === "top" ? [0, k] : at === "bottom" ? [r.rows - 1, k] : at === "left" ? [k, 0] : [k, r.cols - 1];
      out.push({ at: "edge", cell, side: at, kind, value: v });
    }
    return true;
  };
  const c = r.clabels ?? [], l = r.rlabels ?? [];
  if (!side(c[0], "top", r.cols) || !side(c[1], "bottom", r.cols) || !side(l[0], "left", r.rows) || !side(l[1], "right", r.rows)) return null;
  return out;
}

/** A line's runs of shaded cells ("x"). */
const runsOf = (line: string[]) => {
  const out: number[] = [];
  let n = 0;
  for (const s of [...line, "-"]) { if (s === "x" || s === "#" || s === "1") n++; else if (n) { out.push(n); n = 0; } }
  return out.length ? out : [0];
};

/** Does the solution use every cell (a loop or link through all of them)? */
const coversAll = (r: GridRecord) => fits(r.solution, r) && r.solution!.flat().every((s) => s !== "-" && s !== ".");

export const READERS: Partial<Record<GenreName, Reader>> = {
  akari: (r) => {
    const givens = numbers(r, { max: 4, extra: (s, cell) => (s === "x" ? [{ at: "cell", cell, kind: "block" }] : null) });
    if (!givens) return null;
    // a numbered cell is a block with a number
    const blocks = givens.filter((g) => g.kind === "number").map((g): Given => ({ at: "cell", cell: (g as { cell: [number, number] }).cell, kind: "block" }));
    return { givens: [...blocks, ...givens] };
  },
  hitori: (r) => { const g = numbers(r, { min: 1 }); return g && g.length === r.rows * r.cols ? { givens: g } : null; },
  nurikabe: (r) => { const g = numbers(r, { min: 1 }); return g && { givens: g }; },
  slitherlink: (r) => { const g = numbers(r, { max: 4 }); return g && { givens: g }; },
  fillomino: (r) => { const g = numbers(r, { min: 1 }); return g && { givens: g }; },
  shikaku: (r) => { const g = numbers(r, { min: 1 }); return g && { givens: g }; },
  cave: (r) => { const g = numbers(r, { min: 1 }); return g && { givens: g }; },
  minesweeper: (r) => { const g = numbers(r, { max: 8 }); return g && { givens: g }; },
  hidoku: (r) => {
    const g = numbers(r, { min: 1, extra: (s, cell) => (s === "x" || s === "#" ? [{ at: "cell", cell, kind: "block" }] : null) });
    return g && { givens: g };
  },
  masyu: (r) => {
    if (!fits(r.problem, r) || r.problem!.flat().some((s) => !/^[-wb12]$/.test(s))) return null;
    const givens: Given[] = [];
    r.problem!.forEach((row, y) => row.forEach((s, x) => {
      if (s !== "-") givens.push({ at: "cell", cell: [y, x], kind: "pearl", value: s === "w" || s === "1" ? "white" : "black" });
    }));
    return { givens };
  },
  "simple-loop": (r) => {
    const g = numbers(r, { extra: (s, cell) => (s === "x" || s === "#" ? [{ at: "cell", cell, kind: "block" }] : null) });
    return g && !g.some((x) => x.kind === "number") ? { givens: g } : null;
  },
  // a dot in a cell: 0 at its centre, 1 on its right side, 2 on its bottom side, 3 at its bottom right corner
  "spiral-galaxies": (r) => {
    if (!fits(r.problem, r)) return null;
    const givens: Given[] = [];
    for (let y = 0; y < r.rows; y++) for (let x = 0; x < r.cols; x++) {
      const s = r.problem![y][x];
      if (s === "-") continue;
      if (!/^[0-3]$/.test(s)) return null;
      const v = Number(s);
      givens.push({ at: "point", point: [2 * y + 1 + (v & 2 ? 1 : 0), 2 * x + 1 + (v & 1 ? 1 : 0)], kind: "galaxy" });
    }
    return { givens };
  },
  numberlink: (r) => {
    const g = numbers(r, { min: 1 });
    if (!g) return null;
    return { givens: g, ...(coversAll(r) ? { rules: [{ rule: "links", cover: true }] as RuleSpec[] } : {}) };
  },
  "star-battle": (r) => {
    const areas = areasOf(r.areas, r), n = Number(r.depth) || 1;
    if (!areas || r.rows !== r.cols) return null;
    return { areas, ...(n !== 1 ? { rules: [{ rule: "shaded-per-line", n }, { rule: "shaded-per-area", n }] as RuleSpec[] } : {}) };
  },
  sudoku: (r) => {
    if (r.rows !== r.cols || !standardBox(r.rows)) return null;
    const g = numbers(r, { min: 1, max: r.rows });
    return g && { givens: g };
  },
  "irregular-sudoku": (r) => {
    const areas = areasOf(r.areas, r);
    if (!areas || r.rows !== r.cols || new Set(areas.join("")).size !== r.rows) return null;
    const g = numbers(r, { min: 1, max: r.rows });
    return g && { areas, givens: g };
  },
  skyscrapers: (r) => {
    // fewer heights than the size (cells left empty) is a variant ours lacks
    if (r.rows !== r.cols || (r.depth !== undefined && Number(r.depth) !== r.rows)) return null;
    const n = r.rows;
    const edge = around(r, "skyscraper", (s) => (isNum(s) && +s >= 1 && +s <= n ? +s : null));
    const inside = r.problem ? numbers(r, { min: 1, max: n }) : [];
    return edge && inside ? { givens: [...edge, ...inside] } : null;
  },
  // letters a, b, …; depth (Janko) or the header's last letter (puzzlekit) says how many
  "easy-as-abc": (r) => {
    const d = r.depth ?? "";
    const n = isNum(d) ? Number(d) : /^[a-z]$/.test(d) ? d.charCodeAt(0) - 96 : 0;
    if (n < 1 || n > Math.min(r.rows, r.cols)) return null;
    const letter = (s: string) => (/^[a-z]$/.test(s) && s.charCodeAt(0) - 96 <= n ? s.charCodeAt(0) - 96 : null);
    const edge = around(r, "first", letter);
    if (!edge) return null;
    const inside: Given[] = [];
    if (r.problem) {
      if (!fits(r.problem, r)) return null;
      for (let y = 0; y < r.rows; y++) for (let x = 0; x < r.cols; x++) {
        const s = r.problem[y][x];
        if (s === "-") continue;
        const v = letter(s);
        if (v === null) return null;
        inside.push({ at: "cell", cell: [y, x], kind: "number", value: v });
      }
    }
    const symbols = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".slice(0, n);
    return { givens: [...edge, ...inside], ...(n !== 3 ? { rules: [{ rule: "letters", count: n }] as RuleSpec[], style: { symbols } } : {}) };
  },
  // clues from the solution's picture (Janko's files carry only the picture)
  nonogram: (r) => {
    if (!fits(r.solution, r)) return null;
    const s = r.solution!, givens: Given[] = [];
    for (let c = 0; c < r.cols; c++) givens.push({ at: "col", index: c, kind: "runs", value: runsOf(s.map((row) => row[c])) });
    for (let y = 0; y < r.rows; y++) givens.push({ at: "row", index: y, kind: "runs", value: runsOf(s[y]) });
    return { givens };
  },
};

/** A record as our puzzle, or why not. */
export function toSpec(genre: GenreName, r: GridRecord): Spec | string {
  const read = READERS[genre];
  if (!read) return `no reader for ${genre}`;
  if (!(r.rows > 0 && r.cols > 0)) return "no size";
  let parts: Omit<GridSpec, "size"> | null;
  try { parts = read(r); } catch (e) { return `unreadable: ${(e as Error).message}`; }
  if (!parts) return "unreadable or a variant";
  const spec: Spec = { genre, size: [r.rows, r.cols], ...parts } as Spec;
  if (!spec.givens?.length) delete spec.givens;
  try { makePuzzle(spec); } catch (e) { return `engine refused: ${(e as Error).message}`; }
  return spec;
}

// ---- Janko's text files ----

const section = (text: string, name: string) => {
  const m = new RegExp(`\\[${name}\\]\\n([\\s\\S]*?)\\n\\[`).exec(text);
  return m ? m[1].trim().split("\n").map((l) => l.replace(/">/g, "").trim()).filter(Boolean).map((l) => l.split(/\s+/)) : undefined;
};
export const field = (text: string, name: string) => new RegExp(`^${name} (.*)$`, "m").exec(text)?.[1]?.trim() ?? "";

/** A Janko file's grid record. */
export function jankoRecord(text: string): GridRecord {
  const size = Number(field(text, "size"));
  return {
    rows: size || Number(field(text, "rows")), cols: size || Number(field(text, "cols")),
    depth: field(text, "depth") || undefined,
    problem: section(text, "problem"), areas: section(text, "areas"), clabels: section(text, "clabels"),
    rlabels: section(text, "rlabels"), solution: section(text, "solution"),
  };
}

/** Janko's puzzle names (the file's "puzzle" field) for our genres. */
export const JANKO_GENRES: Record<string, GenreName> = {
  akari: "akari", hitori: "hitori", nurikabe: "nurikabe", slitherlink: "slitherlink", fillomino: "fillomino",
  masyu: "masyu", galaxies: "spiral-galaxies", starbattle: "star-battle", sudoku: "sudoku", skyscrapers: "skyscrapers",
  abcendview: "easy-as-abc", arukone: "numberlink", numberlink: "numberlink", hidoku: "hidoku", minesweeper: "minesweeper",
  nonogram: "nonogram", sikaku: "shikaku", shikaku: "shikaku", corral: "cave", cave: "cave", rundreise: "simple-loop",
  simpleloop: "simple-loop", chaos: "irregular-sudoku", "sudoku-chaos": "irregular-sudoku",
};
