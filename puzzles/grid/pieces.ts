// Making region and placement puzzles in the style of Beast Academy's Puzzle Lab, each with exactly
// one solution, for puzzles/grid/generate.ts: Fillomino, Sum Regions, Polyomino Packing, Critter
// Connecting, Symmetry Cut and Kinship. Two ways:
// - clues from a random answer (Fillomino's sizes, the critters, Kinship's placed tiles): clingo
//   picks a random finished board, every clue true of it goes in a pool, clues that rule out the
//   other solutions are added until it's the only one, then clues that aren't needed come out;
// - a board built around a random answer, tried until it has one solution (Polyomino Packing,
//   Symmetry Cut), or nudged towards one (Sum Regions' numbers).
// `settings` ("--rules" in new.ts): "sizes=4/6" (Fillomino), "target=10" (Sum Regions),
// "pieces=4" (packing, critters, cut), "flip" (critters), "symmetry=mirror|turn" (cut),
// "kinds=2,colors=3" (Kinship).
import { makePuzzle, check, normalShape, connectedShape } from "../../src/engine/puzzle.ts";
import { program, boardOf, solve } from "../../src/engine/solve.ts";
import { regionsOf, orientations, SYMMETRIES8, MIRRORS, HALF_TURN, symmetricUnder } from "../../src/engine/derive.ts";
import type { Board, Given, GridSpec, Puzzle, RuleSpec } from "../../src/engine/types.ts";

type RC = [number, number];
export const PIECE_GENRES = ["fillomino", "sum-regions", "polyomino-packing", "critters", "symmetry-cut", "kinship"];
const debug = (m: string) => { if (process.env.DEBUG) console.error(`pieces: ${m}`); };

/** Pieces kids know: trominoes, tetrominoes and a few pentominoes. */
const PIECES: RC[][] = [
  [[0, 0], [0, 1], [0, 2]], [[0, 0], [1, 0], [1, 1]],
  [[0, 0], [0, 1], [0, 2], [0, 3]], [[0, 0], [0, 1], [1, 0], [1, 1]], [[0, 0], [1, 0], [2, 0], [2, 1]], [[0, 0], [0, 1], [0, 2], [1, 1]], [[0, 0], [0, 1], [1, 1], [1, 2]],
  [[0, 0], [1, 0], [1, 1], [1, 2], [2, 2]], [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]], [[0, 0], [0, 1], [0, 2], [1, 0], [1, 2]], [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1]], [[0, 0], [0, 1], [1, 1], [1, 2], [2, 1]],
];

export async function makePieceGenre(genre: string, rows: number, cols: number, rand: () => number, settings?: string): Promise<GridSpec | null> {
  const clingo = await import("clingo-wasm");
  const shuffle = <T,>(xs: T[]) => { for (let i = xs.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [xs[i], xs[j]] = [xs[j], xs[i]]; } return xs; };
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
  const opts = new Map((settings ?? "").split(",").map((x) => x.trim()).filter(Boolean).map((x) => { const [k, v] = x.split("="); return [k, v ?? "true"] as [string, string]; }));
  const num = (k: string, d: number) => (opts.has(k) ? Number(opts.get(k)) : d);
  const at = (i: number, c = cols): RC => [Math.floor(i / c), i % c];
  const unique = async (spec: GridSpec) => (await solve(makePuzzle(spec), 2)).length === 1;

  async function randomBoard(spec: GridSpec, extra = ""): Promise<Board | null> {
    const p = makePuzzle(spec);
    const res = await clingo.run(program(p) + "\n" + extra, 1, ["--rand-freq=1", `--seed=${Math.floor(rand() * 1e6)}`, "--sign-def=rnd"]) as { Call?: { Witnesses?: { Value: string[] }[] }[] };
    const w = res.Call?.[0]?.Witnesses?.[0];
    return w ? boardOf(p, w.Value) : null;
  }
  const keyOf = (p: Puzzle, b: Board) => p.marks.includes("regions") ? regionsOf(p, b).of.join(",") : p.marks.includes("shade") ? [...b.shade].map((x) => (x === 1 ? 1 : 0)).join("") : [...b.digit].join(",");

  /** Add pool clues until the target is the only solution, then drop the ones not needed. */
  async function narrow(base: GridSpec, target: Board, pool: Given[]): Promise<GridSpec | null> {
    const spec: GridSpec = { ...base, givens: [...(base.givens ?? [])] }, added: Given[] = [];
    const tk = keyOf(makePuzzle(spec), target);
    for (let round = 0; round < 150; round++) {
      const p = makePuzzle(spec), alt = (await solve(p, 2)).find((s) => keyOf(p, s) !== tk);
      if (!alt) break;
      const useful = shuffle(pool.filter((c) => !added.includes(c))).find((c) => {
        const p2 = makePuzzle({ ...spec, givens: [...spec.givens!, c] });
        return check(p2, alt).length > 0 && check(p2, target).length === 0;
      });
      if (!useful) { debug("no pool clue rules out the other solution"); return null; }
      added.push(useful); spec.givens!.push(useful);
    }
    if (!(await unique(spec))) return null;
    for (const c of shuffle([...added])) {
      const fewer = { ...spec, givens: spec.givens!.filter((x) => x !== c) };
      if (await unique(fewer)) spec.givens = fewer.givens;
    }
    return spec;
  }

  /** Cells (as RC) cropped to their box, as a board: the size, and rocks where the cells aren't. */
  const boardOfCells = (cells: RC[]): { size: RC; holes: Given[]; shift: RC } => {
    const r0 = Math.min(...cells.map((x) => x[0])), c0 = Math.min(...cells.map((x) => x[1]));
    const h = Math.max(...cells.map((x) => x[0])) - r0 + 1, w = Math.max(...cells.map((x) => x[1])) - c0 + 1;
    const on = new Set(cells.map(([r, c]) => `${r - r0},${c - c0}`)), holes: Given[] = [];
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) if (!on.has(`${r},${c}`)) holes.push({ at: "cell", cell: [r, c], kind: "block" });
    return { size: [h, w], holes, shift: [r0, c0] };
  };
  /** Shapes put side by side at random, each touching the ones before, inside rows × cols. */
  const glue = (shapes: RC[][]): RC[][] | null => {
    const taken = new Set<string>(), out: RC[][] = [];
    for (const shape of shapes) {
      let placed: RC[] | null = null;
      for (let t = 0; t < 300 && !placed; t++) {
        const o = pick(orientations(shape)), h = Math.max(...o.map((x) => x[0])) + 1, w = Math.max(...o.map((x) => x[1])) + 1;
        if (h > rows || w > cols) continue;
        const r = Math.floor(rand() * (rows - h + 1)), c = Math.floor(rand() * (cols - w + 1));
        const cs = o.map(([y, x]) => [r + y, c + x] as RC);
        if (cs.some(([y, x]) => taken.has(`${y},${x}`))) continue;
        if (out.length && !cs.some(([y, x]) => [[y - 1, x], [y + 1, x], [y, x - 1], [y, x + 1]].some(([a, b]) => taken.has(`${a},${b}`)))) continue;
        placed = cs;
      }
      if (!placed) return null;
      placed.forEach(([y, x]) => taken.add(`${y},${x}`));
      out.push(placed);
    }
    return out;
  };

  let best: GridSpec | null = null, tries = 0;
  for (let attempt = 0; attempt < 400; attempt++) {
    if (genre === "fillomino") {
      // a random split into regions (no two of a size side by side), then sizes as numbers
      const sizes = opts.get("sizes")?.split("/").map(Number);
      const rules: RuleSpec[] = sizes ? [{ rule: "allowed-sizes", sizes }] : [];
      const base: GridSpec = { genre, size: [rows, cols], ...(rules.length ? { rules } : {}), givens: [] };
      const target = await randomBoard(base, `:- size(R,N), N > ${num("max", sizes ? Math.max(...sizes) : 5)}.`);
      if (!target) continue;
      const reg = regionsOf(makePuzzle(base), target);
      const pool: Given[] = Array.from({ length: rows * cols }, (_, i) => ({ at: "cell", cell: at(i), kind: "number", value: reg.cells[reg.of[i]].length }));
      const spec = await narrow(base, target, pool);
      if (spec) return spec;
    } else if (genre === "sum-regions") {
      // regions of 2 to 4 cells, numbers that add up to the target in each, then numbers nudged
      // (moving 1 between two cells of a region) while that doesn't add solutions, until one is left
      const T = num("target", 10);
      const cut = await randomBoard({ size: [rows, cols], marks: ["regions"], rules: [{ rule: "size", min: 2, max: num("max", 4) }] });
      if (!cut) continue;
      const regs = regionsOf(makePuzzle({ size: [rows, cols], marks: ["regions"] }), cut).cells;
      const v = new Array<number>(rows * cols).fill(1);
      if (regs.some((cs) => cs.length > T || cs.length * 9 < T)) continue;
      for (const cs of regs) for (let left = T - cs.length; left > 0;) { const i = pick(cs); if (v[i] < 9) { v[i]++; left--; } }
      const specOf = (vals: number[]): GridSpec => ({ genre, size: [rows, cols], rules: [{ rule: "region-sum", is: T }], givens: vals.map((value, i) => ({ at: "cell", cell: at(i), kind: "number", value })) });
      const count = async (vals: number[]) => (await solve(makePuzzle(specOf(vals)), 12)).length;
      let now = await count(v);
      for (let step = 0; step < 600 && now > 1; step++) {
        const cs = pick(regs.filter((x) => x.length > 1)), [a, b] = shuffle([...cs]);
        if (v[a] <= 1 || v[b] >= 9) continue;
        const next = [...v]; next[a]--; next[b]++;
        const n = await count(next);
        if (n >= 1 && n <= now) { v.splice(0, v.length, ...next); now = n; }
      }
      if (now === 1) return specOf(v);
      debug(`sum-regions: ${now} solutions left`);
    } else if (genre === "polyomino-packing") {
      // pieces glued together at random make the board; tried until only one packing fits
      const shapes = Array.from({ length: num("pieces", 4) }, () => pick(PIECES));
      const placed = glue(shapes);
      if (!placed) continue;
      const { size, holes } = boardOfCells(placed.flat());
      const spec: GridSpec = { genre, size, givens: [...shapes.map((value): Given => ({ at: "aside", kind: "bank", value: normalShape(value) })), ...holes] };
      if (await unique(spec)) return spec;
    } else if (genre === "critters") {
      // the pieces placed at random (touching), then critters on them until only that placement fits
      const shapes = Array.from({ length: num("pieces", 3) }, () => pick(PIECES.slice(0, 9)));
      const base: GridSpec = { genre, size: [rows, cols], ...(opts.has("flip") ? { rules: [{ rule: "pieces", flip: true }] } : {}),
        givens: shapes.map((value): Given => ({ at: "aside", kind: "bank", value: normalShape(value) })) };
      const target = await randomBoard(base);
      if (!target) continue;
      // critters on covered cells, and rocks (where no piece can go) on the others
      const pool: Given[] = Array.from({ length: rows * cols }, (_, i) => i).map((i) => target.shade[i] === 1
        ? { at: "cell", cell: at(i), kind: "symbol", value: "★" } : { at: "cell", cell: at(i), kind: "block" });
      // the fewest clues of a few tries: critters spread out are more fun than every square marked
      const spec = await narrow(base, target, pool);
      if (spec && (!best || spec.givens!.length < best.givens!.length)) best = spec;
      if (best && ++tries >= num("tries", 6)) return best;
    } else if (genre === "symmetry-cut") {
      // symmetric pieces glued together make the board; tried until only one cut fits
      const k = num("pieces", 2), want = opts.get("symmetry");
      const shapes: RC[][] = [];
      for (let t = 0; t < 200 && shapes.length < k; t++) {
        const s = symmetricShape(want === "mirror" || want === "turn" ? want : pick(["mirror", "turn"] as const), 5 + Math.floor(rand() * 4), rand);
        if (s) shapes.push(s);
      }
      if (shapes.length < k) continue;
      const placed = glue(shapes);
      if (!placed) continue;
      const { size, holes } = boardOfCells(placed.flat());
      const rules: RuleSpec[] = [...(k !== 2 ? [{ rule: "region-count", is: k }] : []), ...(want ? [{ rule: "symmetric-regions", symmetry: want }] : [])];
      const spec: GridSpec = { genre, size, ...(rules.length ? { rules } : {}), givens: holes };
      if (await unique(spec)) return spec;
    } else if (genre === "kinship") {
      // holes so the open cells hold the tiles (kept in one piece), a random placing, then tiles
      // placed already until it's the only one
      const kinds = num("kinds", 2), colors = num("colors", 3), n = kinds * colors;
      if (n > rows * cols) throw new Error(`${n} tiles don't fit in ${rows} × ${cols}`);
      const holes = new Set<number>();
      for (let t = 0; t < 200 && holes.size < rows * cols - n; t++) {
        const i = Math.floor(rand() * rows * cols);
        if (holes.has(i)) continue;
        const open = Array.from({ length: rows * cols }, (_, j) => j).filter((j) => j !== i && !holes.has(j));
        if (connectedShape(open.map((j) => at(j)))) holes.add(i);
      }
      if (holes.size !== rows * cols - n) continue;
      const base: GridSpec = { genre, size: [rows, cols], ...(kinds !== 2 || colors !== 3 ? { rules: [{ rule: "tiles", kinds, colors }] } : {}),
        givens: [...holes].map((i): Given => ({ at: "cell", cell: at(i), kind: "block" })) };
      const target = await randomBoard(base);
      if (!target) continue;
      const pool: Given[] = Array.from({ length: rows * cols }, (_, i) => i).filter((i) => target.digit[i]).map((i) => ({ at: "cell", cell: at(i), kind: "number", value: target.digit[i] }));
      const spec = await narrow(base, target, pool);
      if (spec) return spec;
    } else throw new Error(`no generator for genre "${genre}"`);
  }
  return best;
}

/** A random connected shape of about `size` cells that matches its own mirror image (across,
 *  down or corner to corner) or looks the same turned halfway round: random cells grown in a box,
 *  joined with their image. */
function symmetricShape(kind: "mirror" | "turn", size: number, rand: () => number): RC[] | null {
  const f = kind === "turn" ? HALF_TURN : MIRRORS[Math.floor(rand() * MIRRORS.length)];
  const seed: RC[] = [[0, 0]];
  while (seed.length < Math.ceil(size / 2)) {
    const [r, c] = seed[Math.floor(rand() * seed.length)], [dr, dc] = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(rand() * 4)];
    if (!seed.some((x) => x[0] === r + dr && x[1] === c + dc)) seed.push([r + dr, c + dc]);
  }
  // the image about the seed's own box (a square box, so the diagonal mirrors work too)
  const n = normalShape(seed), side = Math.max(...n.map((x) => Math.max(x[0], x[1])));
  // a coordinate the symmetry negates is moved back into the box by its side
  const [sy, sx] = f([1, 2]).map((v) => (v < 0 ? side : 0));
  const img = n.map((rc) => { const [y, x] = f(rc); return [y + sy, x + sx] as RC; });
  const all = normalShape([...n, ...img]);
  if (all.length < Math.min(size, 5) || all.length > size + 2 || !connectedShape(all) || !symmetricUnder(all, f)) return null;
  // a random turn or flip of the whole (it stays symmetric)
  const g = SYMMETRIES8[Math.floor(rand() * 8)];
  return normalShape(all.map((x) => g(x) as RC));
}
