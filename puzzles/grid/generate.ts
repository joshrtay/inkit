// Making a grid-engine puzzle with exactly one solution, for puzzles/grid/new.ts (one example
// puzzle) and puzzles/ai/week.ts (the AI creators' weekly batch):
// 1. clingo picks a random finished board that obeys the genre's rules (a loop, a wall,
//    a set of panes), 2. every clue that's true of that board goes in a pool, 3. clues
//    that rule out the other solutions are added until only one is left, 4. clues that
//    aren't needed are taken out again.
// With `accept` (puzzles/difficulty/gen-set.ts), the deduction solver is in the loop: a puzzle must
// also be solvable without search within a band's techniques, and step 4 starts from every clue in
// the pool, so it can end up harder.
import { makePuzzle, check, BALANCE_COLORS } from "../../src/engine/puzzle.ts";
import { program, boardOf, solve } from "../../src/engine/solve.ts";
import { regionsOf, shapeKey } from "../../src/engine/derive.ts";
import { fillSlots } from "../../src/engine/rules.ts";
import { emptyBoard, type Board, type Given, type GridSpec, type Puzzle, type RuleSpec } from "../../src/engine/types.ts";
import { clingoJson, loadClingo } from "../difficulty/clingo.ts";
import { makePanel, PANEL_MIXES } from "./panels.ts";
import { makePieceGenre, PIECE_GENRES } from "./pieces.ts";
import { PICTURES } from "./pictures.ts";

export interface GenerateOptions {
  genre: string;
  rows: number;
  cols: number;
  /** the same seed gives the same puzzle */
  seed?: number;
  /** Panes: the rule mix, e.g. "size=4,twins,opposites,compass" */
  rules?: string;
  /** Panel: the symbol mix (PANEL_MIXES), or several joined with "+" ("squares+stars") */
  mix?: string;
  /** Star Battle: stars per row, column and area (1, 2 or 3) */
  stars?: number;
  /** Star Battle: areas of about even size, as people draw them (the hill-climb that makes it
   *  unique never lets the areas' size spread, their standard deviation over the mean, pass
   *  EVEN_SPREAD or what it already is). Default off */
  evenAreas?: boolean;
  /** Akari: a cipher, with letters for its numbers */
  cipher?: boolean;
  /** Pythagorean Paths: how segments may run (queen, knight; any if not given), and how many dots */
  moves?: string;
  dots?: number;
  /** Solver in the loop (puzzles/difficulty/gen-set.ts): a puzzle is kept only if this accepts it
   *  (the deduction solver, limited to a band's techniques, solves it without search). Clues are
   *  then added until it does, and a clue is taken out only if it still does; uniqueness is checked
   *  in this process (clingo-wasm called directly, nothing cached on disk). Without it, every clue
   *  that isn't needed for one solution is taken out, as always. */
  accept?: (spec: GridSpec) => Promise<boolean>;
  /** With `accept`: whether the puzzle is as hard as wanted (say, the band below can't solve it).
   *  For the genres made by adding clues, if not, clues are swapped at random, one out and another
   *  true of the answer in, while it stays unique and accepted, up to `climbTries` (default 40);
   *  the others are only kept when it holds */
  harder?: (spec: GridSpec) => Promise<boolean>;
  climbTries?: number;
  /** With `harder`: a puzzle the swaps leave too easy is dropped and another board tried, until
   *  this many milliseconds have gone; then the last one is kept. For the genres made by adding
   *  clues. Default off (the first board's puzzle is kept) */
  insistMs?: number;
  /** Fill-in: the digits are drawn from this many (at random, 1 to 9 for an entry's first), so
   *  entries share starts and ends and slots compete. Default all ten */
  digits?: number;
  /** Minesweeper: more mines (a quarter to two-fifths of the cells, not 15–25%) and no 0 among the
   *  numbers that can be shown, so every number shown has mines around it and their neighbourhoods
   *  overlap. Default off */
  denseMines?: boolean;
  /** Easy as ABC: how many letters (A, B, C, ...) in each row and column. Default 3 */
  letters?: number;
  /** A symmetric clue layout, as people make them: "rot180" (the same turned halfway round) or
   *  "mirror" (the same reflected left to right). Clues are added and taken out in twin pairs (both
   *  or neither), so the final layout is symmetric; a clue whose twin cell has none true of the
   *  answer is never used. For the genres made by adding clues to cells (SYMMETRY_GENRES); for
   *  Akari the black squares follow it too. Default "none" */
  symmetry?: Symmetry;
  /** Fewer clues with bigger numbers, as hand-made puzzles have (docs/research-human-gap.md: about
   *  half our clue density). Nurikabe: about one island per 8–14 cells, few of size 1 (still up to
   *  5 cells: bigger ones make every uniqueness check several times slower); Shikaku: rectangles of up to 12 cells, about one per 6 cells or fewer; Spiral Galaxies:
   *  galaxies grown to 4–13 cells, not 2–9; the genres made by adding numbered clues (Cave): the
   *  biggest numbers added first and the smallest taken out first. Default off */
  sparse?: boolean;
  /** Skyscrapers: clues outside the grid only, no digits in it (people's are all outside). Default
   *  off (digits in the grid where the outside clues aren't enough) */
  outsideOnly?: boolean;
  /** Simple Loop: rocks only, no walls between cells (people's give only rocks): a random loop
   *  over most of the grid, rocks on the rest, then rocks moved in and out while that leaves no more
   *  loops, until one is left. Default off (walls) */
  blocksOnly?: boolean;
}

/** Star Battle with `evenAreas`: the areas' size spread (standard deviation over the mean) the
 *  hill-climb stays under; hand-made puzzles' is about 0.45 against our 0.65 */
export const EVEN_SPREAD = 0.5;

export type Symmetry = "rot180" | "mirror" | "none";
/** The genres whose clue layout `symmetry` shapes: clues on cells, added to a pool and taken out
 *  (narrow). Not those made whole (Nurikabe, Shikaku, Hitori, Spiral Galaxies, Numberlink: one
 *  clue per piece, where it lands at random), the clueless (Star Battle's areas, Aquarium's
 *  totals), the edge-clued (Skyscrapers, Easy as ABC), or those whose fixed givens aren't
 *  symmetric (Hidoku's ends, Thermo Sudoku's thermometers). */
export const SYMMETRY_GENRES = ["sudoku", "irregular-sudoku", "akari", "slitherlink", "cave", "minesweeper", "wittgenstein-briquet", "masyu", "square-jam", "binary-puzzle", "hive"];

/** A cell's twin under a symmetry. */
export function twinOf(sym: Symmetry, rows: number, cols: number, [r, c]: [number, number]): [number, number] {
  return sym === "rot180" ? [rows - 1 - r, cols - 1 - c] : sym === "mirror" ? [r, cols - 1 - c] : [r, c];
}

/** Whether every cell clue's twin cell holds a clue too (fixed givens like blocks included). */
export function isSymmetric(spec: GridSpec, sym: Symmetry): boolean {
  if (sym === "none") return true;
  const [rows, cols] = spec.size, cells = new Set<string>();
  for (const x of spec.givens ?? []) if (x.at === "cell") cells.add(`${x.cell}`);
  return [...cells].every((k) => { const [r, c] = k.split(",").map(Number); return cells.has(`${twinOf(sym, rows, cols, [r, c])}`); });
}

/** Up to `limit` solutions, by clingo-wasm in this process (puzzles/difficulty/clingo.ts). */
async function solveHere(p: Puzzle, limit = 2): Promise<Board[]> {
  await loadClingo();
  const res = clingoJson(program(p), limit, ["--project=show"]);
  return (res.Call?.[0]?.Witnesses ?? []).map((w) => boardOf(p, w.Value));
}

/** A puzzle with exactly one solution (a panel: one line), or null if none was found in 40 tries. */
export async function generate(o: GenerateOptions): Promise<GridSpec | null> {
  const { genre, rows, cols } = o;
  let seed = o.seed ?? 1;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const shuffle = <T>(xs: T[]) => { for (let i = xs.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [xs[i], xs[j]] = [xs[j], xs[i]]; } return xs; };
  const clingo = await import("clingo-wasm");
  // with a solver in the loop: solutions found in this process, uncached (a run makes millions of calls)
  const solveN = o.accept ? solveHere : solve;
  const insistUntil = o.insistMs ? Date.now() + o.insistMs : 0;
  let tooEasy: GridSpec | null = null;   // with insistMs: the last puzzle dropped as too easy
  const sym: Symmetry = o.symmetry && o.symmetry !== "none" && SYMMETRY_GENRES.includes(genre) ? o.symmetry : "none";
  /** With `symmetry`: each pool clue's twin group (itself and the clue on its twin cell; a clue on a
   *  cell that is its own twin, or not on a cell, alone), and the pool without clues whose twin has
   *  none. Without, every clue alone. */
  const twinGroups = (pool: Given[]): { pool: Given[]; group: Map<Given, Given[]> } => {
    const group = new Map<Given, Given[]>();
    if (sym === "none") { for (const c of pool) group.set(c, [c]); return { pool, group }; }
    const byCell = new Map<string, Given>();
    for (const c of pool) if (c.at === "cell" && !byCell.has(`${c.cell}`)) byCell.set(`${c.cell}`, c);
    const kept: Given[] = [];
    for (const c of pool) {
      if (c.at !== "cell") { group.set(c, [c]); kept.push(c); continue; }
      const t = twinOf(sym, rows, cols, c.cell), mate = byCell.get(`${t}`);
      if (`${t}` === `${c.cell}`) { group.set(c, [c]); kept.push(c); continue; }
      if (!mate || byCell.get(`${c.cell}`) !== c) continue;
      group.set(c, [c, mate]); kept.push(c);
    }
    return { pool: kept, group };
  };
  // the genres made whole (not by adding clues) can only be kept or not: kept when accepted and,
  // with `harder`, hard enough
  const accepts = async (spec: GridSpec) => !o.accept || ((await o.accept(spec)) && (!o.harder || (await o.harder(spec))));

  /** A random finished board for this puzzle's rules, plus extra constraints. */
  async function randomBoard(spec: GridSpec, extra: string): Promise<Board | null> {
    const p = makePuzzle(spec);
    const res = await clingo.run(program(p) + "\n" + extra, 1, ["--rand-freq=1", `--seed=${Math.floor(rand() * 1e6)}`, "--sign-def=rnd"]) as { Call?: { Witnesses?: { Value: string[] }[] }[] };
    const w = res.Call?.[0]?.Witnesses?.[0];
    return w ? boardOf(p, w.Value) : null;
  }

  const regionKey = (spec: GridSpec, b: Board) => regionsOf(makePuzzle(spec), b).of.join(",");
  /** Grow areas from seed cells (one area each) at random until they cover the grid; `cap` stops an
   *  area growing past that many cells. Returns letter rows, or null if it got stuck. */
  function growAreas(seeds: number[], cap = Infinity): string[] | null {
    const n = rows * cols, of = new Array<number>(n).fill(-1), size = seeds.map(() => 1);
    seeds.forEach((i, a) => (of[i] = a));
    const near = (i: number) => { const r = Math.floor(i / cols), c = i % cols; return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([y, x]) => y >= 0 && x >= 0 && y < rows && x < cols).map(([y, x]) => y * cols + x); };
    for (let left = n - seeds.length; left > 0;) {
      // the smallest area that can still grow takes a random free neighbour
      const options = seeds.map((_, a) => a).filter((a) => size[a] < cap).sort((a, b) => size[a] - size[b] || rand() - 0.5);
      let grew = false;
      for (const a of options) {
        const free = shuffle(Array.from({ length: n }, (_, i) => i).filter((i) => of[i] === a).flatMap(near).filter((j) => of[j] < 0));
        if (!free.length) continue;
        of[free[0]] = a; size[a]++; left--; grew = true;
        if (cap === Infinity || rand() < 0.7) break;
      }
      if (!grew) return null;
    }
    // (past 26 areas, capitals and digits: 3-star Star Battle's, one per star before grouping)
    return Array.from({ length: rows }, (_, r) => of.slice(r * cols, r * cols + cols).map((a) => "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[a]).join(""));
  }

  /** Areas merged in groups of k neighbours (Star Battle with k stars: each grown around one star),
   *  at random, the area with the fewest free neighbours first; returns letter rows, or null if no
   *  grouping was found in 50 tries. */
  function groupAreas(grown: string[], k: number): string[] | null {
    const flat = grown.join(""), letters = [...new Set(flat)];
    if (letters.length % k) return null;
    const touch = new Map(letters.map((x) => [x, new Set<string>()]));
    for (let i = 0; i < flat.length; i++) for (const j of [i % cols < cols - 1 ? i + 1 : -1, i + cols < flat.length ? i + cols : -1]) if (j >= 0 && flat[j] !== flat[i]) { touch.get(flat[i])!.add(flat[j]); touch.get(flat[j])!.add(flat[i]); }
    for (let t = 0; t < 50; t++) {
      const of = new Map<string, number>(), groups: string[][] = [];
      let ok = true;
      while (of.size < letters.length && ok) {
        const free = (x: string) => [...touch.get(x)!].filter((z) => !of.has(z));
        // start from the loneliest area left, then grow the group through free neighbours
        const left = shuffle(letters.filter((x) => !of.has(x))).sort((a, b) => free(a).length - free(b).length);
        const g = [left[0]]; of.set(left[0], groups.length);
        while (g.length < k) {
          const next = shuffle([...new Set(g.flatMap(free))]).sort((a, b) => free(a).length - free(b).length)[0];
          if (!next) { ok = false; break; }
          g.push(next); of.set(next, groups.length);
        }
        groups.push(g);
      }
      if (ok) return grown.map((row) => [...row].map((x) => "abcdefghijklmnopqrstuvwxyz"[of.get(x)!]).join(""));
    }
    return null;
  }

  /** Equal areas for an irregular sudoku: the regular boxes, then many random swaps of two border
   *  cells between neighbouring areas (sizes stay equal; every area stays in one piece). */
  function jigsaw(): string[] {
    const n = rows * cols;
    let bh = Math.floor(Math.sqrt(rows)); while (rows % bh) bh--;
    const bw = rows / bh;
    const of = Array.from({ length: n }, (_, i) => Math.floor(Math.floor(i / cols) / bh) * (cols / bw) + Math.floor((i % cols) / bw));
    const near = (i: number) => { const r = Math.floor(i / cols), c = i % cols; return [r > 0 ? i - cols : -1, r < rows - 1 ? i + cols : -1, c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1].filter((j) => j >= 0); };
    const whole = (a: number) => {
      const cells = of.flatMap((x, i) => (x === a ? [i] : [])), seen = new Set([cells[0]]), stack = [cells[0]];
      while (stack.length) for (const j of near(stack.pop()!)) if (of[j] === a && !seen.has(j)) { seen.add(j); stack.push(j); }
      return seen.size === cells.length;
    };
    for (let t = 0; t < n * 40; t++) {
      const i = Math.floor(rand() * n), others = near(i).filter((j) => of[j] !== of[i]);
      if (!others.length) continue;
      const A = of[i], B = of[others[Math.floor(rand() * others.length)]];
      const back = shuffle(of.flatMap((x, j) => (x === B && j !== i && near(j).some((k) => of[k] === A) ? [j] : [])));
      if (!back.length) continue;
      const j = back[0];
      of[i] = B; of[j] = A;
      if (!whole(A) || !whole(B)) { of[i] = A; of[j] = B; }
    }
    return Array.from({ length: rows }, (_, r) => of.slice(r * cols, r * cols + cols).map((a) => "abcdefghijklmnopqrstuvwxyz"[a]).join(""));
  }

  const boardKey = (spec: GridSpec, b: Board) => (genre === "binary-puzzle" || genre === "abstract-art" ? [...b.color].join(",") : genre === "fill-in" ? [...b.digit].join(",") : genre === "panes" ? regionKey(spec, b) : genre === "simple-path" || genre === "simple-loop" || genre === "numberlink" || genre === "masyu" ? [...b.loop].map((x) => (x === 1 ? 1 : 0)).join("") : ["star-battle", "akari", "cave", "aquarium", "wittgenstein-briquet", "hitori", "minesweeper"].includes(genre) ? [...b.shade].map((x) => (x === 1 ? 1 : 0)).join("") : ["shikaku", "square-jam", "spiral-galaxies"].includes(genre) ? regionKey(spec, b) : ["thermo-sudoku", "skyscrapers", "easy-as-abc", "hidoku", "honeycomb-paths", "hive"].includes(genre) ? [...b.digit].join("") : genre === "pythagorean-paths" ? [...b.loop].map((x) => (x === 1 ? 1 : 0)).join("") : genre === "irregular-sudoku" ? [...b.digit].join("") : genre === "nurikabe" ? [...b.shade].join("") : genre === "sudoku" ? [...b.digit].join("") : [...b.fence].join(""));

  /** Add pool clues until the target is the only solution, then drop clues that aren't needed. */
  async function narrow(base: GridSpec, target: Board, pool: Given[], poolOf?: (b: Board) => Given[]): Promise<GridSpec | null> {
    const spec: GridSpec = { ...base, givens: [...(base.givens ?? [])] };
    let tk = boardKey(spec, target);
    const first = twinGroups(pool), group = first.group;
    pool = first.pool;
    /** With `sparse`: a numbered clue's value (0 for others), to add the biggest first and take
     *  the smallest out first */
    const valueOf = (c: Given) => ("value" in c && typeof c.value === "number" ? c.value : 0);
    const bigFirst = (cs: Given[]) => (o.sparse ? cs.sort((a, b) => valueOf(b) - valueOf(a)) : cs);
    const added: Given[] = [];
    /** The twin groups among these clues, each once, in random order (without a symmetry: each
     *  clue alone, as before); shuffled unless `mix` is false */
    const groupsOf = (cs: Given[], mix = true): Given[][] => {
      const seen = new Set<Given>(), out: Given[][] = [];
      const order = mix ? shuffle([...cs]) : cs;
      // (sparse: the smallest numbers first, a twin group by its smaller)
      if (o.sparse && mix) order.sort((a, b) => Math.min(...(group.get(a) ?? [a]).map(valueOf)) - Math.min(...(group.get(b) ?? [b]).map(valueOf)));
      for (const c of order) {
        if (seen.has(c)) continue;
        const g = group.get(c) ?? [c];
        for (const x of g) seen.add(x);
        out.push(g);
      }
      return out;
    };
    for (let round = 0; round < 120; round++) {
      const sols = await solveN(makePuzzle(spec), 2);
      const alt = sols.find((s) => boardKey(spec, s) !== tk);
      if (!alt) break;
      const useful = bigFirst(shuffle(pool.filter((c) => !added.includes(c)))).find((c) => {
        const p2 = makePuzzle({ ...spec, givens: [...spec.givens!, c] });
        return check(p2, alt).length > 0 && check(p2, target).length === 0;
      });
      if (!useful && poolOf) {
        // nothing true of the target rules out the other solution: aim for that one instead (it
        // fits every clue so far), with its own clues
        // (the clues placed so far keep their twin groups)
        const fresh = twinGroups(poolOf(alt));
        target = alt; tk = boardKey(spec, alt); pool = fresh.pool;
        for (const [c, g] of fresh.group) if (!group.has(c)) group.set(c, g);
        continue;
      }
      if (!useful) { if (process.env.DEBUG) console.error(`narrow: no pool clue rules out the other solution after ${added.length} clues`); return null; }
      for (const c of group.get(useful)!) if (!added.includes(c)) { added.push(c); spec.givens!.push(c); }
    }
    const sols = await solveN(makePuzzle(spec), 2);
    if (sols.length !== 1) return null;
    if (o.accept) {
      // solver in the loop, top down: every clue true of the target, then each taken out (in random
      // order) only if it stays unique (cheap) and the technique set still solves it. Starting from
      // all of them, not the few that made it unique, leaves room to end up harder; a removal that
      // fails once fails for good (fewer clues never help)
      for (const c of pool) if (!added.includes(c)) { added.push(c); spec.givens!.push(c); }
      if (!(await o.accept(spec))) return null;
      const fits = async (s: GridSpec) => (await solveN(makePuzzle(s), 2)).length === 1 && (await o.accept!(s));
      const minimize = async (cs: Given[]) => {
        for (const g of groupsOf(cs)) {
          const fewer = { ...spec, givens: spec.givens!.filter((x) => !g.includes(x)) };
          if (await fits(fewer)) spec.givens = fewer.givens;
        }
      };
      await minimize(added);
      // not as hard as wanted: a random walk of swaps (one clue out, another true of the target in)
      // that stay unique and solved, each followed by taking out what's no longer needed
      for (let t = 0; o.harder && t < (o.climbTries ?? 40) && !(await o.harder(spec)); t++) {
        // (twin groups, with a symmetry)
        const inside = groupsOf(pool.filter((c) => spec.givens!.includes(c)), false), outside = groupsOf(pool.filter((c) => !spec.givens!.includes(c)), false);
        if (!inside.length || !outside.length) break;
        const out = inside[Math.floor(rand() * inside.length)], into = outside[Math.floor(rand() * outside.length)];
        const swapped = { ...spec, givens: [...spec.givens!.filter((x) => !out.includes(x)), ...into] };
        if (!(await fits(swapped))) continue;
        spec.givens = swapped.givens;
        await minimize(spec.givens.filter((c) => !into.includes(c) && pool.includes(c)));
      }
      // still too easy: another board, while there's time
      if (insistUntil && o.harder && Date.now() < insistUntil && !(await o.harder(spec))) { tooEasy = spec; return null; }
      return spec;
    }
    for (const g of groupsOf(added)) {        // minimize
      const fewer = { ...spec, givens: spec.givens!.filter((x) => !g.includes(x)) };
      if ((await solveN(makePuzzle(fewer), 2)).length === 1) spec.givens = fewer.givens;
    }
    return spec;
  }

  const at = (i: number): [number, number] => [Math.floor(i / cols), i % cols];
  /** With `symmetry`, for the genres whose clues sit in unshaded cells (Cave, Minesweeper,
   *  Wittgenstein Briquet): the answer's shading symmetric too, so every clue's twin cell can hold
   *  one (otherwise the clues that tell the answer apart often have none) */
  const twinShading = () => sym === "none" ? "" : Array.from({ length: rows * cols }, (_, i) => i).flatMap((i) => {
    const [r, c] = twinOf(sym, rows, cols, at(i)), j = r * cols + c;
    return j > i ? [`:- shaded(${i}), not shaded(${j}).`, `:- shaded(${j}), not shaded(${i}).`] : [];
  }).join("\n");
  let result: GridSpec | null = null;
  // Fillomino, Sum Blobs, Polyomino Packing, Connect the Critters, Find the Cut Line, Twins and Triplets: ./pieces.ts
  if (PIECE_GENRES.includes(genre)) {
    const made = await makePieceGenre(genre, rows, cols, rand, o.rules, o.accept);
    return made && (await accepts(made)) ? made : null;
  }

  // (insisting, boards are tried until the time's up, not 40 only)
  for (let attempt = 0; (attempt < 40 || Date.now() < insistUntil) && !result; attempt++) {
    const near4 = (i: number) => { const r = Math.floor(i / cols), c = i % cols; return [r > 0 ? i - cols : -1, r < rows - 1 ? i + cols : -1, c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1].filter((j) => j >= 0); };
    const near8 = (i: number) => { const r = Math.floor(i / cols), c = i % cols, out: number[] = []; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if ((dr || dc) && r + dr >= 0 && c + dc >= 0 && r + dr < rows && c + dc < cols) out.push((r + dr) * cols + c + dc); return out; };
    /** Every clue outside the grid, read off a finished digit board. */
    const edgePool = (b: Board, kind: "first" | "skyscraper"): Given[] => {
      const out: Given[] = [];
      const add = (side: "top" | "bottom" | "left" | "right", cell: number, ray: number[]) => {
        let value = 0;
        if (kind === "first") value = b.digit[ray.find((i) => b.digit[i]) ?? -1] ?? 0;
        else { let top = 0; for (const i of ray) if (b.digit[i] > top) { top = b.digit[i]; value++; } }
        if (value) out.push({ at: "edge", side, cell: at(cell), kind, value });
      };
      for (let r = 0; r < rows; r++) { const row = Array.from({ length: cols }, (_, c) => r * cols + c); add("left", row[0], row); add("right", row.at(-1)!, [...row].reverse()); }
      for (let c = 0; c < cols; c++) { const col = Array.from({ length: rows }, (_, r) => r * cols + c); add("top", col[0], col); add("bottom", col.at(-1)!, [...col].reverse()); }
      return out;
    };
    if (genre === "square-jam") {
      // squares no bigger than 3 x 3, so there are plenty of them
      const base: GridSpec = { genre, size: [rows, cols], givens: [] };
      const target = await randomBoard(base, `:- root(R), size(R,N), N > 9.\n:- #count{R: root(R)} < ${Math.round(rows * cols / 5)}.`);
      if (!target) continue;
      const reg = regionsOf(makePuzzle(base), target);
      const pool: Given[] = Array.from({ length: rows * cols }, (_, i) => ({ at: "cell", cell: at(i), kind: "number", value: Math.round(Math.sqrt(reg.cells[reg.of[i]].length)) }));
      result = await narrow(base, target, pool);
    } else if (genre === "wittgenstein-briquet" || genre === "minesweeper") {
      // a random answer (blocks with the rest connected / mines), then numbers in the other cells
      const n = rows * cols, base: GridSpec = { genre, size: [rows, cols], givens: [] };
      const [lo, hi] = genre === "minesweeper" ? (o.denseMines ? [0.25, 0.4] : [0.15, 0.25]) : [0.25, 0.4];
      const target = await randomBoard(base, `:- #count{I: shaded(I)} < ${Math.round(n * lo)}.\n:- #count{I: shaded(I)} > ${Math.round(n * hi)}.\n${twinShading()}`);
      if (!target) continue;
      const around = genre === "minesweeper" ? near8 : near4;
      const pool: Given[] = Array.from({ length: n }, (_, i) => i).filter((i) => target.shade[i] !== 1)
        .map((i): Given => ({ at: "cell", cell: at(i), kind: "number", value: around(i).filter((j) => target.shade[j] === 1).length }))
        .filter((x) => !(o.denseMines && genre === "minesweeper" && "value" in x && x.value === 0));
      result = await narrow(base, target, pool);
    } else if (genre === "hitori") {
      // a shading (no two side by side, the rest connected); numbers from a latin square, then each
      // shaded cell copies a number left in its row or column so it has to go
      const n = rows * cols, shadeSpec: GridSpec = { size: [rows, cols], marks: ["shade"], rules: [{ rule: "no-adjacent" }, { rule: "unshaded-connected" }] };
      const target = await randomBoard(shadeSpec, `:- #count{I: shaded(I)} < ${Math.round(n * 0.2)}.\n:- #count{I: shaded(I)} > ${Math.round(n * 0.32)}.`);
      if (!target) continue;
      const latin = await randomBoard({ genre: "sudoku", size: [rows, cols], rules: [{ rule: "boxes", box: [1, cols] }] }, "");
      if (!latin) continue;
      for (let t = 0; t < 30 && !result; t++) {
        const v = [...latin.digit];
        for (let i = 0; i < n; i++) if (target.shade[i] === 1) {
          const [r, c] = at(i), mates = [...Array.from({ length: cols }, (_, x) => r * cols + x), ...Array.from({ length: rows }, (_, y) => y * cols + c)].filter((j) => j !== i && target.shade[j] !== 1);
          v[i] = latin.digit[mates[Math.floor(rand() * mates.length)]];
        }
        const spec: GridSpec = { genre, size: [rows, cols], givens: v.map((value, i) => ({ at: "cell", cell: at(i), kind: "number", value })) };
        if ((await solveN(makePuzzle(spec), 2)).length === 1 && await accepts(spec)) result = spec;
      }
    } else if (genre === "spiral-galaxies") {
      // grow symmetric regions: a centre on a cell, an edge or a corner, then pairs of mirrored cells
      for (let t = 0, tries = o.sparse ? 600 : 60; t < tries && !result; t++) {
        const owner = new Array<number>(rows * cols).fill(-1), points: [number, number][] = [];
        const free = (r: number, c: number) => r >= 0 && c >= 0 && r < rows && c < cols && owner[r * cols + c] < 0;
        for (let start = 0; start < rows * cols; start++) {
          const order = shuffle(Array.from({ length: rows * cols }, (_, i) => i).filter((i) => owner[i] < 0));
          if (!order.length) break;
          const [r, c] = at(order[0]);
          // centre options: the cell, its right / lower edge, its lower-right corner (if those cells are free)
          const opts: [number, number, number[]][] = [[2 * r + 1, 2 * c + 1, [order[0]]]];
          if (free(r, c + 1)) opts.push([2 * r + 1, 2 * c + 2, [order[0], order[0] + 1]]);
          if (free(r + 1, c)) opts.push([2 * r + 2, 2 * c + 1, [order[0], order[0] + cols]]);
          if (free(r, c + 1) && free(r + 1, c) && free(r + 1, c + 1)) opts.push([2 * r + 2, 2 * c + 2, [order[0], order[0] + 1, order[0] + cols, order[0] + cols + 1]]);
          const [py, px, core] = opts[Math.floor(rand() * opts.length)], k = points.length;
          points.push([py, px]); for (const i of core) owner[i] = k;
          const want = o.sparse ? 4 + Math.floor(rand() * 10) : 2 + Math.floor(rand() * 8);
          for (let g = 0; g < 40 && owner.filter((o) => o === k).length < want; g++) {
            const mine = owner.flatMap((o, i) => (o === k ? [i] : []));
            const cand = shuffle(mine.flatMap(near4).filter((j) => owner[j] < 0));
            const pick = cand.find((j) => { const [y, x] = at(j), y2 = py - 1 - y, x2 = px - 1 - x; return free(y2, x2) && y2 * cols + x2 !== j; });
            if (pick === undefined) break;
            const [y, x] = at(pick); owner[pick] = k; owner[(py - 1 - y) * cols + (px - 1 - x)] = k;
          }
        }
        // (sparse: a layout with more than a galaxy per 4 cells is drawn again, unsolved: cheap)
        if (o.sparse && points.length > rows * cols / 4 && t < tries - 1) continue;
        const spec: GridSpec = { genre, size: [rows, cols], givens: points.map((point) => ({ at: "point", point, kind: "galaxy" })) };
        if ((await solveN(makePuzzle(spec), 2)).length === 1 && await accepts(spec)) result = spec;
      }
    } else if (genre === "thermo-sudoku") {
      // a full grid, thermometers traced up rising digits, then given digits until it's the only one
      const base0: GridSpec = { genre, size: [rows, cols], givens: [] };
      const full = await randomBoard(base0, "");
      if (!full) continue;
      const thermos: Given[] = [], used = new Set<number>();
      for (let t = 0; t < 40 && thermos.length < Math.round(rows * 0.7); t++) {
        let cur = Math.floor(rand() * rows * cols);
        if (used.has(cur)) continue;
        const path = [cur];
        while (path.length < 5) {
          const up = shuffle(near4(cur)).find((j) => !used.has(j) && !path.includes(j) && full.digit[j] > full.digit[cur]);
          if (up === undefined) break;
          path.push(up); cur = up;
        }
        if (path.length < 3) continue;
        path.forEach((i) => used.add(i));
        thermos.push({ at: "cells", cells: path.map(at), kind: "thermo" });
      }
      const base: GridSpec = { genre, size: [rows, cols], givens: thermos };
      const pool: Given[] = Array.from({ length: rows * cols }, (_, i) => ({ at: "cell", cell: at(i), kind: "number", value: full.digit[i] }));
      result = await narrow(base, full, pool);
    } else if (genre === "skyscrapers" || genre === "easy-as-abc") {
      // a random answer, then clues outside (and, for Skyscrapers, a few digits if needed); Easy as
      // ABC with `letters`, that many letters
      const k = genre === "easy-as-abc" && o.letters && o.letters !== 3 ? o.letters : 0;
      const base: GridSpec = { genre, size: [rows, cols], givens: [], ...(k ? { rules: [{ rule: "letters", count: k }], style: { symbols: "ABCDEFGHIJ".slice(0, k) } } : {}) };
      const target = await randomBoard(base, "");
      if (!target) continue;
      const kind = genre === "skyscrapers" ? "skyscraper" : "first";
      // (outsideOnly: no digits in the grid; when no outside clue tells two answers apart, the
      // other answer becomes the target, with its own outside clues)
      if (o.outsideOnly && genre === "skyscrapers") { result = await narrow(base, target, edgePool(target, kind), (b) => edgePool(b, kind)); continue; }
      const pool = [...edgePool(target, kind),
        ...(genre === "skyscrapers" ? Array.from({ length: rows * cols }, (_, i): Given => ({ at: "cell", cell: at(i), kind: "number", value: target.digit[i] })) : [])];
      result = await narrow(base, target, pool);
    } else if (genre === "cave") {
      // a random cave (about half the grid shaded), then numbers in white cells until it's the only one
      const n = rows * cols, base: GridSpec = { genre, size: [rows, cols], givens: [] };
      const target = await randomBoard(base, `:- #count{I: shaded(I)} < ${Math.round(n * 0.38)}.\n:- #count{I: shaded(I)} > ${Math.round(n * 0.55)}.\n${twinShading()}`);
      if (!target) continue;
      const p0 = makePuzzle(base), g = p0.grid;
      const sees = (i: number) => {
        const [r, c] = g.rc(i); let k = 1;
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) for (let y = r + dr, x = c + dc; y >= 0 && x >= 0 && y < rows && x < cols && target.shade[g.cell(y, x)] !== 1; y += dr, x += dc) k++;
        return k;
      };
      const pool: Given[] = Array.from({ length: n }, (_, i) => i).filter((i) => target.shade[i] !== 1).map((i) => ({ at: "cell", cell: at(i), kind: "number", value: sees(i) }));
      result = await narrow(base, target, pool);
    } else if (genre === "aquarium") {
      // random tanks, a random settled fill, then row / column totals until it's the only one
      const tanks = growAreas(shuffle(Array.from({ length: rows * cols }, (_, i) => i)).slice(0, Math.round(rows * cols / 4)));
      if (!tanks) continue;
      const base: GridSpec = { genre, size: [rows, cols], areas: tanks, givens: [] };
      const n = rows * cols;
      const target = await randomBoard(base, `:- #count{I: shaded(I)} < ${Math.round(n * 0.35)}.\n:- #count{I: shaded(I)} > ${Math.round(n * 0.6)}.`);
      if (!target) continue;
      const g = makePuzzle(base).grid;
      const pool: Given[] = [
        ...Array.from({ length: rows }, (_, r): Given => ({ at: "row", index: r, kind: "total", value: Array.from({ length: cols }, (_, c) => target.shade[g.cell(r, c)] === 1).filter(Boolean).length })),
        ...Array.from({ length: cols }, (_, c): Given => ({ at: "col", index: c, kind: "total", value: Array.from({ length: rows }, (_, r) => target.shade[g.cell(r, c)] === 1).filter(Boolean).length })),
      ];
      result = await narrow(base, target, pool);
    } else if (genre === "numberlink") {
      // Connectlink style: a random path through every cell (a Simple Path between two random edge
      // cells), cut into pieces of 3 to 7 cells; each piece's ends are a numbered pair
      const edgeCells = Array.from({ length: rows * cols }, (_, i) => i).filter((i) => { const [r, c] = at(i); return r === 0 || c === 0 || r === rows - 1 || c === cols - 1; });
      const [a, b] = shuffle(edgeCells).slice(0, 2);
      const sideOf = (i: number) => { const [r, c] = at(i); return r === 0 ? "top" : r === rows - 1 ? "bottom" : c === 0 ? "left" : "right"; };
      const pathSpec: GridSpec = { genre: "simple-path", size: [rows, cols], givens: [{ at: "edge", cell: at(a), side: sideOf(a), kind: "door", role: "in" }, { at: "edge", cell: at(b), side: sideOf(b), kind: "door", role: "out" }] };
      const walk = await randomBoard(pathSpec, "");
      if (!walk) continue;
      const g = makePuzzle(pathSpec).grid, order = [a];
      for (let prev = -1, cur = a; ;) {
        const l = g.cellLinks[cur].find((x) => walk.loop[x] === 1 && !g.links[x].cells.includes(prev));
        if (l === undefined) break;
        prev = cur; cur = g.links[l].cells.find((c) => c !== cur)!; order.push(cur);
      }
      for (let t = 0; t < 60 && !result; t++) {
        const givens: Given[] = [];
        let k = 0, v = 1;
        while (k < order.length) {
          let len = 3 + Math.floor(rand() * 5);
          if (order.length - (k + len) < 3) len = order.length - k;   // no piece shorter than 3
          givens.push({ at: "cell", cell: at(order[k]), kind: "number", value: v }, { at: "cell", cell: at(order[k + len - 1]), kind: "number", value: v });
          k += len; v++;
        }
        const spec: GridSpec = { genre, size: [rows, cols], rules: [{ rule: "links", cover: true }], givens };
        if ((await solveN(makePuzzle(spec), 2)).length === 1 && await accepts(spec)) result = spec;
      }
    } else if (genre === "masyu") {
      // a random loop over most of the grid, then pearls that are true of it until it's the only one
      const base: GridSpec = { genre, size: [rows, cols], givens: [] };
      const target = await randomBoard(base, `:- #count{I: cell(I), go(I,_)} < ${Math.round(rows * cols * 0.6)}.`);
      if (!target) continue;
      const g = makePuzzle(base).grid;
      const pearlsOf = (target: Board) => {
        const dirs = (i: number) => { const [r, c] = g.rc(i); return [[-1, 0], [0, 1], [1, 0], [0, -1]].filter(([dr, dc]) => r + dr >= 0 && c + dc >= 0 && r + dr < rows && c + dc < cols && target.loop[g.links[g.borders[g.borderBetween(i, g.cell(r + dr, c + dc))].link].id] === 1); };
        const straight = (i: number) => { const d = dirs(i); return d.length === 2 && d[0][0] === -d[1][0] && d[0][1] === -d[1][1]; };
        const next = (i: number, [dr, dc]: number[]) => { const [r, c] = g.rc(i); return g.cell(r + dr, c + dc); };
        const pool: Given[] = [];
        for (let i = 0; i < g.cellCount; i++) {
          const d = dirs(i);
          if (d.length !== 2) continue;
          if (straight(i) && !d.every((x) => straight(next(i, x)))) pool.push({ at: "cell", cell: at(i), kind: "pearl", value: "white" });
          if (!straight(i) && d.every((x) => dirs(next(i, x)).some((y) => y[0] === x[0] && y[1] === x[1]))) pool.push({ at: "cell", cell: at(i), kind: "pearl", value: "black" });
        }
        return pool;
      };
      result = await narrow(base, target, pearlsOf(target), pearlsOf);
    } else if (genre === "akari") {
      // black cells (symmetric, about a fifth), a random lighting, then numbers on black cells until
      // it's the only one
      const n = rows * cols, givens: Given[] = [];
      // (mirrored left to right instead, with symmetry "mirror")
      const twin = (i: number) => { if (sym !== "mirror") return n - 1 - i; const [r, c] = twinOf(sym, rows, cols, at(i)); return r * cols + c; };
      for (let i = 0; i < n; i++) {
        const j = twin(i);
        if (j < i) { if (sym === "mirror") continue; break; }
        if (rand() < 0.2) for (const k of new Set([i, j])) givens.push({ at: "cell", cell: at(k), kind: "block" });
      }
      const base: GridSpec = { genre, size: [rows, cols], givens };
      const target = await randomBoard(base, "");
      if (!target) continue;
      const g = makePuzzle(base).grid;
      const pool: Given[] = givens.map((x) => {
        const i = g.cell(...(x as { cell: [number, number] }).cell);
        return { at: "cell", cell: at(i), kind: "number", value: g.cellLinks[i].filter((l) => target.shade[g.links[l].cells.find((c) => c !== i)!] === 1).length };
      });
      result = await narrow(base, target, pool);
      if (result && o.cipher) {
        // a cipher: each number becomes a letter (one letter per number), then more letters until
        // the lighting is the only one again; letters run A, B, C... in reading order
        const names = shuffle(["A", "B", "C", "D", "E"]);
        const letter = (x: Given): Given => (x.kind === "number" ? { at: "cell", cell: x.cell, kind: "number", value: 0, letter: names[x.value] } : x);
        const numbered = new Set(result.givens!.flatMap((x) => (x.kind === "number" ? [String(x.cell)] : [])));
        result = await narrow({ ...result, givens: result.givens!.map(letter) }, target, pool.filter((x) => x.at === "cell" && !numbered.has(String(x.cell))).map(letter));
        if (result) {
          const order = new Map<string, string>();
          const key = (x: Given) => (x.at === "cell" ? x.cell[0] * cols + x.cell[1] : 0);
          for (const x of [...result.givens!].sort((a, b) => key(a) - key(b))) if (x.kind === "number" && x.letter && !order.has(x.letter)) order.set(x.letter, "ABCDE"[order.size]);
          result.givens = result.givens!.map((x) => (x.kind === "number" && x.letter ? { ...x, letter: order.get(x.letter)! } : x));
        }
      }
    } else if (genre === "shikaku") {
      // a random cut into rectangles (2 to 8 cells), then one number per rectangle, placed at random
      // until only that cut fits
      // (sparse: up to 12 cells, about one rectangle per 6 cells at most)
      const cutSpec: GridSpec = { size: [rows, cols], marks: ["regions"], rules: [{ rule: "rectangles" }, { rule: "size", min: 2, max: o.sparse ? 12 : 8 }] };
      const target = await randomBoard(cutSpec, o.sparse ? `:- #count{R: root(R)} > ${Math.round(rows * cols * 0.17)}.` : "");
      if (!target) continue;
      const rects = regionsOf(makePuzzle(cutSpec), target).cells;
      for (let t = 0; t < 40 && !result; t++) {
        const givens: Given[] = rects.map((cs) => ({ at: "cell", cell: at(cs[Math.floor(rand() * cs.length)]), kind: "number", value: cs.length }));
        const spec: GridSpec = { genre, size: [rows, cols], givens };
        if ((await solveN(makePuzzle(spec), 2)).length === 1 && await accepts(spec)) result = spec;
      }
    } else if (genre === "star-battle") {
      // stars first (n per row and column, never touching), then areas grown around them, one per
      // star group, until only those stars fit
      const k = o.stars ?? 1;
      const base: GridSpec = { genre, size: [rows, cols], rules: [{ rule: "shaded-per-line", n: k }, { rule: "shaded-per-area", n: k }] };
      const stars = await randomBoard({ ...base, genre: undefined, marks: ["shade"], rules: [{ rule: "shaded-per-line", n: k }, { rule: "no-touch" }] }, "");
      if (!stars) continue;
      const starCells = shuffle(Array.from({ length: rows * cols }, (_, i) => i).filter((i) => stars.shade[i] === 1));
      // one area grows around each star; with 2 stars per area, neighbouring areas then merge in
      // pairs (a random matching), so every area holds 2 stars and stays in one piece
      // (with 3, areas merge in threes: groupAreas)
      if (k > 3) throw new Error("1, 2 or 3 stars per area");
      let grown = growAreas(k === 1 ? starCells.slice(0, rows) : starCells);
      if (!grown) continue;
      if (k === 3) { grown = groupAreas(grown, 3); if (!grown) continue; }
      if (k === 2) {
        const flat = grown.join(""), letters = [...new Set(flat)];
        const touch = new Map(letters.map((x) => [x, new Set<string>()]));
        for (let i = 0; i < flat.length; i++) for (const j of [i % cols < cols - 1 ? i + 1 : -1, i + cols < flat.length ? i + cols : -1]) if (j >= 0 && flat[j] !== flat[i]) { touch.get(flat[i])!.add(flat[j]); touch.get(flat[j])!.add(flat[i]); }
        let pairing: Map<string, string> | null = null;
        for (let t = 0; t < 50 && !pairing; t++) {
          const m = new Map<string, string>();
          for (const x of shuffle(letters)) {
            if (m.has(x)) continue;
            const y = shuffle([...touch.get(x)!].filter((z) => !m.has(z)))[0];
            if (!y) break;
            m.set(x, y); m.set(y, x);
          }
          if (m.size === letters.length) pairing = m;
        }
        if (!pairing) continue;
        const name = new Map<string, string>();
        for (const x of letters) if (!name.has(x)) { const a = "abcdefghijklmnopqrstuvwxyz"[name.size / 2]; name.set(x, a); name.set(pairing.get(x)!, a); }
        grown = grown.map((row) => [...row].map((x) => name.get(x)!).join(""));
      }
      // hill-climb: move one cell (never a star) into a neighbouring area, keeping every area in one
      // piece, while that doesn't add solutions, until one is left
      let of = grown.join("").split("");
      const rules = k > 1 ? { rules: base.rules } : {};
      const count = async (o: string[]) => (await solveN(makePuzzle({ genre, size: [rows, cols], ...rules, areas: Array.from({ length: rows }, (_, r) => o.slice(r * cols, r * cols + cols).join("")) }), 40)).length;
      const connected = (o: string[], letter: string) => {
        const cells = o.flatMap((x, i) => (x === letter ? [i] : []));
        if (!cells.length) return false;
        const seen = new Set([cells[0]]), stack = [cells[0]];
        while (stack.length) { const i = stack.pop()!, r = Math.floor(i / cols), c = i % cols; for (const j of [r > 0 ? i - cols : -1, r < rows - 1 ? i + cols : -1, c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1]) if (j >= 0 && o[j] === letter && !seen.has(j)) { seen.add(j); stack.push(j); } }
        return seen.size === cells.length;
      };
      // evenAreas: no move may push the size spread past EVEN_SPREAD (or past what it is, if above)
      const spreadOf = (o: string[]) => { const m = new Map<string, number>(); for (const x of o) m.set(x, (m.get(x) ?? 0) + 1); const v = [...m.values()], mu = v.reduce((a, x) => a + x, 0) / v.length; return Math.sqrt(v.reduce((a, x) => a + (x - mu) ** 2, 0) / v.length) / mu; };
      let now = await count(of);
      for (let step = 0; step < 3000 && now > 1; step++) {
        const i = Math.floor(rand() * rows * cols);
        if (stars.shade[i] === 1) continue;
        const r = Math.floor(i / cols), c = i % cols;
        const nb = [r > 0 ? i - cols : -1, r < rows - 1 ? i + cols : -1, c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1].filter((j) => j >= 0 && of[j] !== of[i]);
        if (!nb.length) continue;
        const next = [...of]; next[i] = of[nb[Math.floor(rand() * nb.length)]];
        if (!connected(next, of[i])) continue;
        if (o.evenAreas && spreadOf(next) > Math.max(EVEN_SPREAD, spreadOf(of))) continue;
        const n = await count(next);
        if (n >= 1 && n <= now) { of = next; now = n; }
      }
      const made: GridSpec = { genre, size: [rows, cols], ...rules, areas: Array.from({ length: rows }, (_, r) => of.slice(r * cols, r * cols + cols).join("")) };
      if (now === 1 && await accepts(made)) result = made;
    } else if (genre === "irregular-sudoku") {
      // areas of n cells each, a random full grid, then given digits until it's the only one
      const areas = jigsaw();
      const base: GridSpec = { genre, size: [rows, cols], areas, givens: [] };
      const target = await randomBoard(base, "");
      if (!target) continue;
      const pool: Given[] = Array.from({ length: rows * cols }, (_, i) => ({ at: "cell", cell: at(i), kind: "number", value: target.digit[i] }));
      result = await narrow(base, target, pool);
    } else if (genre === "simple-path") {
      // doors on two different sides, a few rocks; a random path through it; then walls (which the
      // path never crosses) until it's the only one
      const sides = shuffle(["top", "right", "bottom", "left"] as const).slice(0, 2);
      const door = (side: (typeof sides)[number], role: "in" | "out"): Given => ({
        at: "edge", kind: "door", role, side,
        cell: side === "top" ? [0, Math.floor(rand() * cols)] : side === "bottom" ? [rows - 1, Math.floor(rand() * cols)]
          : side === "left" ? [Math.floor(rand() * rows), 0] : [Math.floor(rand() * rows), cols - 1],
      });
      const givens: Given[] = [door(sides[0], "in"), door(sides[1], "out")];
      const rocks = Math.floor(rows * cols * 0.08);
      for (const i of shuffle(Array.from({ length: rows * cols }, (_, i) => i)).slice(0, rocks)) givens.push({ at: "cell", cell: at(i), kind: "block" });
      const base: GridSpec = { genre, size: [rows, cols], givens };
      const target = await randomBoard(base, "");
      if (!target) continue;
      const g = makePuzzle(base).grid;
      const pool: Given[] = g.links.filter((l) => !target.loop[l.id] && !l.cells.some((c) => givens.some((x) => x.kind === "block" && x.at === "cell" && g.cell(...x.cell) === c)))
        .map((l) => ({ at: "border", cells: [at(l.cells[0]), at(l.cells[1])], kind: "wall" }));
      result = await narrow(base, target, pool);
    } else if (genre === "simple-loop" && o.blocksOnly) {
      // rocks only: a random loop over 80–94% of the cells (any loop: Masyu's rules without pearls),
      // rocks on the cells it misses; then, like Star Battle's areas, a hill-climb: one cell's rock
      // put in or taken out, kept while some loop still fits and no more do, until one is left
      const n = rows * cols;
      const loop = await randomBoard({ genre: "masyu", size: [rows, cols], givens: [] }, `:- #count{I: cell(I), go(I,_)} < ${Math.round(n * 0.8)}.\n:- #count{I: cell(I), go(I,_)} > ${Math.round(n * 0.94)}.`);
      if (!loop) continue;
      const g = makePuzzle({ genre, size: [rows, cols] }).grid;
      const rock = Array.from({ length: n }, (_, i) => !g.cellLinks[i].some((l) => loop.loop[g.links[l].id] === 1));
      const specOf = (r: boolean[]): GridSpec => ({ genre, size: [rows, cols], givens: r.flatMap((x, i) => (x ? [{ at: "cell", cell: at(i), kind: "block" } as Given] : [])) });
      const count = async (r: boolean[]) => (await solveN(makePuzzle(specOf(r)), 300)).length;
      let now = await count(rock);
      // a loop visits as many dark squares as light ones (a checkerboard), so a single rock put in
      // or taken out never leaves one: the moves keep the balance (a rock moved to a square of its
      // colour two steps away, or two neighbouring squares made rocks or opened together)
      const dark = (i: number) => (Math.floor(i / cols) + (i % cols)) % 2;
      for (let step = 0; step < 800 && now > 1; step++) {
        const next = [...rock], u = rand(), rocks = next.flatMap((x, i) => (x ? [i] : []));
        if (u < 0.5 && rocks.length) {
          const i = rocks[Math.floor(rand() * rocks.length)], [r, c] = at(i);
          const to = shuffle([[r - 2, c], [r + 2, c], [r, c - 2], [r, c + 2], [r - 1, c - 1], [r - 1, c + 1], [r + 1, c - 1], [r + 1, c + 1]].filter(([y, x]) => y >= 0 && x >= 0 && y < rows && x < cols).map(([y, x]) => y * cols + x).filter((j) => !next[j]))[0];
          if (to === undefined) continue;
          next[i] = false; next[to] = true;
        } else {
          const i = Math.floor(rand() * n), j = shuffle(near4(i))[0];
          if (next[i] !== next[j] || dark(i) === dark(j)) continue;
          next[i] = next[j] = !next[i];
        }
        const k = await count(next);
        if (k >= 1 && k <= now) { rock.splice(0, n, ...next); now = k; }
      }
      // then fewer rocks (people use about one square in eight): a dark one and a light one taken
      // out together while the loop stays the only one
      for (let t = 0; t < 200 && now === 1; t++) {
        const rocks = rock.flatMap((x, i) => (x ? [i] : [])), d = rocks.filter((i) => dark(i)), l = rocks.filter((i) => !dark(i));
        if (!d.length || !l.length) break;
        const next = [...rock];
        next[d[Math.floor(rand() * d.length)]] = next[l[Math.floor(rand() * l.length)]] = false;
        if ((await count(next)) === 1) rock.splice(0, n, ...next);
      }
      if (process.env.DEBUG) console.error(`simple loop, rocks only: ${now} loops left, ${rock.filter(Boolean).length} rocks`);
      if (now === 1 && await accepts(specOf(rock))) result = specOf(rock);
    } else if (genre === "simple-loop") {
      // a few rocks; a random loop through every other square; then walls (which the loop never
      // crosses) until it's the only one
      const givens: Given[] = [];
      const rocks = Math.floor(rows * cols * (0.04 + rand() * 0.08));
      for (const i of shuffle(Array.from({ length: rows * cols }, (_, i) => i)).slice(0, rocks)) givens.push({ at: "cell", cell: at(i), kind: "block" });
      const base: GridSpec = { genre, size: [rows, cols], givens };
      const target = await randomBoard(base, "");
      if (!target) continue;
      const g = makePuzzle(base).grid, rock = new Set(givens.map((x) => (x.at === "cell" ? g.cell(...x.cell) : -1)));
      const pool: Given[] = g.links.filter((l) => !target.loop[l.id] && !l.cells.some((c) => rock.has(c)))
        .map((l) => ({ at: "border", cells: [at(l.cells[0]), at(l.cells[1])], kind: "wall" }));
      result = await narrow(base, target, pool);
    } else if (genre === "nonogram") {
      // a picture from ./pictures.ts that fits (turned or mirrored now and then), kept if its clues
      // allow nothing else; when none of that size does, a quilt block: a random picture mirrored
      // both ways
      const fits = shuffle(PICTURES.filter((x) => x.rows.length === rows && x.rows[0].length === cols));
      for (const pic of fits.slice(0, 6)) {
        const flip = rand() < 0.5, rowsOf = flip ? pic.rows.map((r) => [...r].reverse().join("")) : pic.rows;
        const spec: GridSpec = { genre, size: [rows, cols], picture: { rows: rowsOf, palette: pic.palette, title: pic.title } };
        if ((await solveN(makePuzzle(spec), 2)).length === 1 && await accepts(spec)) { result = spec; break; }
      }
      if (result) break;
      const half = (n: number) => Math.ceil(n / 2), cell = Array.from({ length: half(rows) }, () => Array.from({ length: half(cols) }, () => rand() < 0.55));
      const on = (r: number, c: number) => cell[Math.min(r, rows - 1 - r)][Math.min(c, cols - 1 - c)];
      const quilt = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => (on(r, c) ? ((r + c) % 3 ? "q" : "p") : ".")).join(""));
      const spec: GridSpec = { genre, size: [rows, cols], picture: { rows: quilt, palette: { ".": "#f6efe2", q: "#3f6fb0", p: "#d8443a" }, title: "Quilt block" } };
      if ((await solveN(makePuzzle(spec), 2)).length === 1 && await accepts(spec)) result = spec;
    } else if (genre === "slitherlink") {
      const base: GridSpec = { genre, size: [rows, cols], givens: [] };
      const target = await randomBoard(base, `:- #count{B: fence(B)} < ${Math.round(rows * cols * 0.9)}.`);
      if (!target) continue;
      const g = makePuzzle(base).grid;
      const pool: Given[] = Array.from({ length: g.cellCount }, (_, i) => ({ at: "cell", cell: at(i), kind: "number", value: g.cellBorders[i].filter((e) => target.fence[e] === 1).length }));
      result = await narrow(base, target, pool);
    } else if (genre === "sudoku") {
      // a random full grid, then given digits until it's the only one
      const base: GridSpec = { genre, size: [rows, cols], givens: [] };
      const target = await randomBoard(base, "");
      if (!target) continue;
      const pool: Given[] = Array.from({ length: rows * cols }, (_, i) => ({ at: "cell", cell: at(i), kind: "number", value: target.digit[i] }));
      result = await narrow(base, target, pool);
    } else if (genre === "nurikabe") {
      // a wall first (connected, no pools, islands of 1..5), then one number per island
      // (sparse: one island per 8 to 14 cells, a sixth of them at most of size 1)
      const wallSpec: GridSpec = { size: [rows, cols], marks: ["shade"], rules: [{ rule: "connected" }, { rule: "no-pool" }, { rule: "size", min: 1, max: 5 }], givens: [] };
      const n = rows * cols;
      const fewer = o.sparse ? `\n:- #count{R: root(R)} < ${Math.round(n / 14)}.\n:- #count{R: root(R)} > ${Math.round(n / 8)}.\n:- #count{R: root(R), size(R,1)} > ${Math.max(1, Math.round(n / 8 / 6))}.` : "";
      const target = await randomBoard(wallSpec, `:- #count{I: shaded(I)} < ${Math.round(n * 0.45)}.\n:- #count{I: shaded(I)} > ${Math.round(n * 0.62)}.${fewer}`);
      if (!target) continue;
      const islands = regionsOf(makePuzzle(wallSpec), target).cells;
      if (o.sparse) {
        // big islands rarely come out unique with numbers placed at random: move one number at a
        // time instead, within an island the other answer shades part of, up to 40 times
        const pos = islands.map((cs) => cs[Math.floor(rand() * cs.length)]);
        for (let t = 0; t < 40 && !result; t++) {
          const spec: GridSpec = { genre, size: [rows, cols], givens: islands.map((cs, k) => ({ at: "cell", cell: at(pos[k]), kind: "number", value: cs.length })) };
          const sols = await solveN(makePuzzle(spec), 2), alt = sols.find((b) => boardKey(spec, b) !== boardKey(spec, target));
          if (sols.length === 1 && await accepts(spec)) { result = spec; break; }
          const bad = alt ? islands.flatMap((cs, k) => (cs.length > 1 && cs.some((i) => alt.shade[i] === 1) ? [k] : [])) : [];
          const movable = bad.length ? bad : islands.flatMap((cs, k) => (cs.length > 1 ? [k] : []));
          if (!movable.length) break;
          const k = movable[Math.floor(rand() * movable.length)];
          pos[k] = islands[k][Math.floor(rand() * islands[k].length)];
        }
      }
      for (let t = 0; t < 12 && !result && !o.sparse; t++) {
        const givens: Given[] = islands.map((cs) => ({ at: "cell", cell: at(cs[Math.floor(rand() * cs.length)]), kind: "number", value: cs.length }));
        const spec: GridSpec = { genre, size: [rows, cols], givens };
        if ((await solveN(makePuzzle(spec), 2)).length === 1 && await accepts(spec)) result = spec;
      }
    } else if (genre === "panes") {
      const want = (o.rules ?? "size=4,twins,opposites").split(",").map((s) => s.trim()).filter(Boolean);
      const rules: RuleSpec[] = [];
      for (const w of want) {
        const [k, v] = w.split("=");
        if (k === "size") rules.push({ rule: "size", is: Number(v) });
        else if (k === "range") { const [lo, hi] = v.split("-").map(Number); rules.push({ rule: "size", min: lo, max: hi }); }
        else rules.push({ rule: k });
      }
      const shapeRules = rules.filter((r) => ["size", "all-different"].includes(r.rule));
      const base: GridSpec = { genre, size: [rows, cols], rules: shapeRules, givens: [] };
      const target = await randomBoard(base, "");
      if (!target) continue;
      const p = makePuzzle(base), g = p.grid, reg = regionsOf(p, target);
      const keys = reg.cells.map((cs) => shapeKey(g, cs));
      const pool: Given[] = [];
      for (const l of g.links) {
        const [a, b] = l.cells, ra = reg.of[a], rb = reg.of[b];
        if (ra === rb) continue;
        const cells: [[number, number], [number, number]] = [at(a), at(b)];
        if (keys[ra] === keys[rb] && rules.some((r) => r.rule === "twins")) pool.push({ at: "border", cells, kind: "twins" });
        if (keys[ra] !== keys[rb] && rules.some((r) => r.rule === "opposites")) pool.push({ at: "border", cells, kind: "opposites" });
      }
      for (let i = 0; i < g.cellCount; i++) {
        const cs = reg.cells[reg.of[i]], [r0, c0] = g.rc(i);
        if (rules.some((r) => r.rule === "compass")) {
          const v = { n: 0, e: 0, s: 0, w: 0 };
          for (const j of cs) { const [r1, c1] = g.rc(j); if (r1 < r0) v.n++; if (r1 > r0) v.s++; if (c1 > c0) v.e++; if (c1 < c0) v.w++; }
          pool.push({ at: "cell", cell: at(i), kind: "compass", value: v });
        }
        if (rules.some((r) => r.rule === "size-clue")) pool.push({ at: "cell", cell: at(i), kind: "number", value: cs.length });
      }
      const spec = await narrow({ ...base, rules }, target, pool);
      if (spec) {
        // only list the rules this puzzle ended up using
        const used = new Set<string>(spec.givens!.map((x) => (x.kind === "number" ? "size-clue" : x.kind)));
        spec.rules = rules.filter((r) => ["size", "all-different"].includes(r.rule) || used.has(r.rule));
        // a cell can hold only one clue: keep the first
        const seen = new Set<string>();
        spec.givens = spec.givens!.filter((x) => { const k = x.at === "cell" ? `c${x.cell}` : x.at === "border" ? `b${x.cells}` : x.at === "corner" ? `v${x.corner}` : x.at === "edge" ? `e${x.cell}${x.side}` : x.at === "cells" ? `t${x.cells}` : x.at === "point" ? `p${x.point}` : x.at === "line" ? `l${x.corners}` : x.at === "aside" ? `a${x.value}` : `${x.at}${x.index}${x.kind}`; if (seen.has(k)) return false; seen.add(k); return true; });
        if ((await solveN(makePuzzle(spec), 2)).length === 1 && await accepts(spec)) result = spec;
      }
    } else if (genre === "hidoku" || genre === "honeycomb-paths") {
      // sometimes a rock or two (squares only), a random path of numbers through the rest, then given
      // numbers until it's the only one; 1 and the last number are always shown
      const n = rows * cols, givens: Given[] = [];
      if (genre === "hidoku" && rand() < 0.5) for (const i of shuffle(Array.from({ length: n }, (_, i) => i)).slice(0, 1 + Math.floor(rand() * 2))) givens.push({ at: "cell", cell: at(i), kind: "block" });
      const rules: RuleSpec[] | undefined = genre === "hidoku" && o.moves === "sides" ? [{ rule: "number-path" }] : undefined;
      const base: GridSpec = { genre, size: [rows, cols], givens, ...(rules ? { rules } : {}) };
      const target = await randomBoard(base, "");
      if (!target) continue;
      const last = n - givens.length, open = Array.from({ length: n }, (_, i) => i).filter((i) => target.digit[i]);
      const ends = open.filter((i) => target.digit[i] === 1 || target.digit[i] === last);
      const pool: Given[] = open.filter((i) => !ends.includes(i)).map((i) => ({ at: "cell", cell: at(i), kind: "number", value: target.digit[i] }));
      result = await narrow({ ...base, givens: [...givens, ...ends.map((i): Given => ({ at: "cell", cell: at(i), kind: "number", value: target.digit[i] }))] }, target, pool);
    } else if (genre === "hive") {
      // a random filling, then given numbers until it's the only one
      const base: GridSpec = { genre, size: [rows, cols], givens: [] };
      const target = await randomBoard(base, "");
      if (!target) continue;
      const pool: Given[] = Array.from({ length: rows * cols }, (_, i) => ({ at: "cell", cell: at(i), kind: "number", value: target.digit[i] }));
      result = await narrow(base, target, pool);
    } else if (genre === "pythagorean-paths") {
      // dots at random points, a random path through them (no crossings), and its segments' lengths;
      // kept when no other path has the same lengths
      const n = rows * cols, k = o.dots ?? Math.max(4, Math.min(8, Math.round(n * 0.4)));
      const rules: RuleSpec[] | undefined = o.moves ? [{ rule: "distance-path", moves: o.moves }] : undefined;
      for (let t = 0; t < 60 && !result; t++) {
        const pegs: Given[] = shuffle(Array.from({ length: n }, (_, i) => i)).slice(0, k).sort((a, b) => a - b).map((i) => ({ at: "cell", cell: at(i), kind: "peg" }));
        const base: GridSpec = { genre, size: [rows, cols], givens: pegs, ...(rules ? { rules } : {}) };
        const target = await randomBoard(base, "");
        if (!target) continue;
        const p0 = makePuzzle(base), lengths = p0.grid.links.filter((l) => target.loop[l.id] === 1).map((l) => {
          const [a, b] = l.cells.map((i) => p0.grid.rc(i));
          return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
        }).sort((a, b) => a - b);
        // a few different lengths, so the list says something
        if (new Set(lengths).size < Math.min(3, lengths.length) && o.moves !== "knight") continue;
        const spec: GridSpec = { ...base, givens: [...pegs, { at: "aside", kind: "lengths", value: lengths }] };
        if ((await solveN(makePuzzle(spec), 2)).length === 1 && await accepts(spec)) result = spec;
      }
    } else if (genre === "panel") {
      const mix = o.mix ?? "squares";
      if (!mix.split("+").every((m) => (PANEL_MIXES as readonly string[]).includes(m))) throw new Error(`--mix is one of ${PANEL_MIXES.join(", ")}, or several joined with +`);
      result = await makePanel(mix, rows, cols, rand);
      if (result && !(await accepts(result))) result = null;
    } else if (genre === "binary-puzzle" || genre === "abstract-art") {
      // a random painting, then printed colors until it's the only one. Abstract Art's --rules:
      // "parts=1:2" (the shares; three parts, three colors), and no-three-in-a-row, unique-lines
      const rules: RuleSpec[] = [];
      let colors = 2;
      for (const w of (genre === "abstract-art" ? o.rules ?? "" : "").split(",").map((x) => x.trim()).filter(Boolean)) {
        const [k, v] = w.split("=");
        if (k === "parts") { const parts = v.split(":").map(Number); colors = parts.length; rules.push({ rule: "line-shares", parts }); }
        else rules.push({ rule: k });
      }
      const base: GridSpec = { genre, size: [rows, cols], ...(rules.length ? { rules } : {}), ...(colors !== 2 ? { style: { palette: BALANCE_COLORS.slice(0, colors) } } : {}), givens: [] };
      const target = await randomBoard(base, "");
      if (!target) continue;
      const pool: Given[] = Array.from({ length: rows * cols }, (_, i) => ({ at: "cell", cell: at(i), kind: "color", value: target.color[i] }));
      result = await narrow(base, target, pool);
    } else if (genre === "fill-in") {
      // black squares (the same turned halfway round), random digits (no number starting with 0), the
      // list read off them, smallest first; then printed digits if the list alone allows another way
      const n = rows * cols, black = new Set<number>();
      for (let i = 0; i < n; i++) { const j = n - 1 - i; if (j < i) break; if (rand() < 0.3) { black.add(i); black.add(j); } }
      const givens: Given[] = [...black].sort((a, b) => a - b).map((i) => ({ at: "cell", cell: at(i), kind: "block" }));
      const p0 = makePuzzle({ genre, size: [rows, cols], givens });
      const slots = fillSlots(p0), inSlot = new Set(slots.flat()), white = Array.from({ length: n }, (_, i) => i).filter((i) => !black.has(i));
      // every white square in a slot, numbers of 4 digits at most, and the white squares joined up
      if (white.some((i) => !inSlot.has(i)) || slots.length < 4 || slots.some((s) => s.length > 4)) continue;
      const seen = new Set([white[0]]), stack = [white[0]];
      while (stack.length) for (const j of near4(stack.pop()!)) if (!black.has(j) && !seen.has(j)) { seen.add(j); stack.push(j); }
      if (seen.size !== white.length) continue;
      const lead = new Set(slots.map((s) => s[0])), target = emptyBoard(p0.grid);
      // board digits: 1 is 0, 2 is 1, ...; with `digits`, a few of them (one at least not 0)
      const few = o.digits ? shuffle(Array.from({ length: 10 }, (_, d) => d + 1)).slice(0, Math.max(2, o.digits)) : null;
      const leads = few?.filter((d) => d > 1) ?? [];
      const draw = () => {
        for (const i of white) target.digit[i] = few
          ? (lead.has(i) ? leads[Math.floor(rand() * leads.length)] : few[Math.floor(rand() * few.length)])
          : lead.has(i) ? 2 + Math.floor(rand() * 9) : 1 + Math.floor(rand() * 10);
        return slots.map((s) => s.map((i) => "0123456789"[target.digit[i] - 1]).join(""));
      };
      // with few digits two entries are often the same: draw again (a few times) rather than
      // spend one of the attempts
      let entries = draw();
      for (let t = 0; few && t < 30 && new Set(entries).size !== entries.length; t++) entries = draw();
      if (new Set(entries).size !== entries.length) continue;
      entries.sort((a, b) => a.length - b.length || Number(a) - Number(b));
      const pool: Given[] = white.map((i) => ({ at: "cell", cell: at(i), kind: "number", value: target.digit[i] }));
      result = await narrow({ genre, size: [rows, cols], givens, entries }, target, pool);
    } else throw new Error(`no generator for genre "${genre}"`);
  }
  return result ?? tooEasy;
}
