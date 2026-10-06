// Make a grid-engine puzzle (src/games/<genre>/<n>.json) with exactly one solution.
//
//   node puzzles/grid/new.ts --genre slitherlink --size 5x5 --number 1 --name "First Loop" [--seed 3]
//   node puzzles/grid/new.ts --genre nurikabe --size 5x5 --number 1 --name "Islands"
//   node puzzles/grid/new.ts --genre panes --size 4x5 --number 1 --name "First Window" --rules "size=4,twins,opposites,compass"
//   node puzzles/grid/new.ts --genre sudoku --size 9x9 --number 1 --name "Classic"
//   node puzzles/grid/new.ts --genre simple-path --size 6x6 --number 1 --name "First Steps"
//   node puzzles/grid/new.ts --genre star-battle --size 6x6 --number 1 --name "First Stars"
//   node puzzles/grid/new.ts --genre irregular-sudoku --size 6x6 --number 1 --name "Jigsaw"
//
// 1. clingo picks a random finished board that obeys the genre's rules (a loop, a wall,
//    a set of panes), 2. every clue that's true of that board goes in a pool, 3. clues
//    that rule out the other solutions are added until only one is left, 4. clues that
//    aren't needed are taken out again. The site build re-proves the result is unique.
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { makePuzzle, check } from "../../src/engine/puzzle.ts";
import { program, boardOf, solve } from "../../src/engine/solve.ts";
import { regionsOf, shapeKey } from "../../src/engine/derive.ts";
import type { Board, Given, GridSpec, RuleSpec } from "../../src/engine/types.ts";

const arg = (k: string, d?: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const genre = arg("genre")!, [rows, cols] = (arg("size", "5x5")!).split("x").map(Number);
const number = Number(arg("number")), name = arg("name") ?? `${genre} ${number}`;
let seed = Number(arg("seed", "1"));
if (!genre || !number) { console.error("usage: --genre <g> --size RxC --number <n> --name <name> [--rules ...] [--seed s]"); process.exit(1); }
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const shuffle = <T>(xs: T[]) => { for (let i = xs.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [xs[i], xs[j]] = [xs[j], xs[i]]; } return xs; };
const clingo = await import("clingo-wasm");

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
  return Array.from({ length: rows }, (_, r) => of.slice(r * cols, r * cols + cols).map((a) => "abcdefghijklmnopqrstuvwxyz"[a]).join(""));
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

const boardKey = (spec: GridSpec, b: Board) => (genre === "panes" ? regionKey(spec, b) : genre === "simple-path" ? [...b.loop].join("") : genre === "star-battle" ? [...b.shade].map((x) => (x === 1 ? 1 : 0)).join("") : genre === "irregular-sudoku" ? [...b.digit].join("") : genre === "nurikabe" ? [...b.shade].join("") : genre === "sudoku" ? [...b.digit].join("") : [...b.fence].join(""));

/** Add pool clues until the target is the only solution, then drop clues that aren't needed. */
async function narrow(base: GridSpec, target: Board, pool: Given[]): Promise<GridSpec | null> {
  const spec: GridSpec = { ...base, givens: [...(base.givens ?? [])] };
  const tk = boardKey(spec, target);
  const added: Given[] = [];
  for (let round = 0; round < 60; round++) {
    const sols = await solve(makePuzzle(spec), 2);
    const alt = sols.find((s) => boardKey(spec, s) !== tk);
    if (!alt) break;
    const useful = shuffle(pool.filter((c) => !added.includes(c))).find((c) => {
      const p2 = makePuzzle({ ...spec, givens: [...spec.givens!, c] });
      return check(p2, alt).length > 0 && check(p2, target).length === 0;
    });
    if (!useful) return null;
    added.push(useful); spec.givens!.push(useful);
  }
  const sols = await solve(makePuzzle(spec), 2);
  if (sols.length !== 1) return null;
  for (const c of shuffle([...added])) {        // minimize
    const fewer = { ...spec, givens: spec.givens!.filter((x) => x !== c) };
    if ((await solve(makePuzzle(fewer), 2)).length === 1) spec.givens = fewer.givens;
  }
  return spec;
}

const at = (i: number): [number, number] => [Math.floor(i / cols), i % cols];
let result: GridSpec | null = null;

for (let attempt = 0; attempt < 40 && !result; attempt++) {
  if (genre === "star-battle") {
    // stars first (n per row and column, never touching), then areas grown around them, one per
    // star group, until only those stars fit
    const k = Number(arg("stars", "1"));
    const base: GridSpec = { genre, size: [rows, cols], rules: [{ rule: "shaded-per-line", n: k }, { rule: "shaded-per-area", n: k }] };
    const stars = await randomBoard({ ...base, genre: undefined, marks: ["shade"], rules: [{ rule: "shaded-per-line", n: k }, { rule: "no-touch" }] }, "");
    if (!stars) continue;
    const starCells = shuffle(Array.from({ length: rows * cols }, (_, i) => i).filter((i) => stars.shade[i] === 1));
    // with k stars per area, areas start from k stars each: pair them up by nearness
    if (k > 1) throw new Error("only 1 star per area for now");
    const grown = growAreas(starCells.slice(0, rows));
    if (!grown) continue;
    // hill-climb: move one cell (never a star) into a neighbouring area, keeping every area in one
    // piece, while that doesn't add solutions, until one is left
    let of = grown.join("").split("");
    const count = async (o: string[]) => (await solve(makePuzzle({ genre, size: [rows, cols], areas: Array.from({ length: rows }, (_, r) => o.slice(r * cols, r * cols + cols).join("")) }), 40)).length;
    const connected = (o: string[], letter: string) => {
      const cells = o.flatMap((x, i) => (x === letter ? [i] : []));
      if (!cells.length) return false;
      const seen = new Set([cells[0]]), stack = [cells[0]];
      while (stack.length) { const i = stack.pop()!, r = Math.floor(i / cols), c = i % cols; for (const j of [r > 0 ? i - cols : -1, r < rows - 1 ? i + cols : -1, c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1]) if (j >= 0 && o[j] === letter && !seen.has(j)) { seen.add(j); stack.push(j); } }
      return seen.size === cells.length;
    };
    let now = await count(of);
    for (let step = 0; step < 3000 && now > 1; step++) {
      const i = Math.floor(rand() * rows * cols);
      if (stars.shade[i] === 1) continue;
      const r = Math.floor(i / cols), c = i % cols;
      const nb = [r > 0 ? i - cols : -1, r < rows - 1 ? i + cols : -1, c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1].filter((j) => j >= 0 && of[j] !== of[i]);
      if (!nb.length) continue;
      const next = [...of]; next[i] = of[nb[Math.floor(rand() * nb.length)]];
      if (!connected(next, of[i])) continue;
      const n = await count(next);
      if (n >= 1 && n <= now) { of = next; now = n; }
    }
    if (now === 1) result = { genre, size: [rows, cols], areas: Array.from({ length: rows }, (_, r) => of.slice(r * cols, r * cols + cols).join("")) };
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
    const wallSpec: GridSpec = { size: [rows, cols], marks: ["shade"], rules: [{ rule: "connected" }, { rule: "no-pool" }, { rule: "size", min: 1, max: 5 }], givens: [] };
    const n = rows * cols;
    const target = await randomBoard(wallSpec, `:- #count{I: shaded(I)} < ${Math.round(n * 0.45)}.\n:- #count{I: shaded(I)} > ${Math.round(n * 0.62)}.`);
    if (!target) continue;
    const islands = regionsOf(makePuzzle(wallSpec), target).cells;
    for (let t = 0; t < 12 && !result; t++) {
      const givens: Given[] = islands.map((cs) => ({ at: "cell", cell: at(cs[Math.floor(rand() * cs.length)]), kind: "number", value: cs.length }));
      const spec: GridSpec = { genre, size: [rows, cols], givens };
      if ((await solve(makePuzzle(spec), 2)).length === 1) result = spec;
    }
  } else if (genre === "panes") {
    const want = (arg("rules", "size=4,twins,opposites") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
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
      spec.givens = spec.givens!.filter((x) => { const k = x.at === "cell" ? `c${x.cell}` : x.at === "border" ? `b${x.cells}` : x.at === "corner" ? `v${x.corner}` : x.at === "edge" ? `e${x.cell}${x.side}` : `${x.at}${x.index}`; if (seen.has(k)) return false; seen.add(k); return true; });
      if ((await solve(makePuzzle(spec), 2)).length === 1) result = spec;
    }
  } else throw new Error(`no generator for genre "${genre}"`);
}
if (!result) { console.error("no unique puzzle found; try another --seed or size"); process.exit(1); }

const { genre: _g, ...grid } = result;
const path = new URL(`../../src/games/${genre}/${number}.json`, import.meta.url).pathname;
const prev = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
const instance = { type: "grid", name: prev.name ?? name, meta: `${rows} × ${cols}`, ...prev, grid };
writeFileSync(path, JSON.stringify(instance, null, 2) + "\n");
console.log(`wrote src/games/${genre}/${number}.json: ${(result.givens ?? []).length} clues, rules ${(makePuzzle(result).rules.map((r) => r.rule)).join(", ")}`);
