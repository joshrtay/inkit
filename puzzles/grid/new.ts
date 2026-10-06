// Make a grid-engine puzzle (src/games/<genre>/<n>.json) with exactly one solution.
//
//   node puzzles/grid/new.ts --genre slitherlink --size 5x5 --number 1 --name "First Loop" [--seed 3]
//   node puzzles/grid/new.ts --genre nurikabe --size 5x5 --number 1 --name "Islands"
//   node puzzles/grid/new.ts --genre panes --size 4x5 --number 1 --name "First Window" --rules "size=4,twins,opposites,compass"
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
const boardKey = (spec: GridSpec, b: Board) => (genre === "panes" ? regionKey(spec, b) : genre === "nurikabe" ? [...b.shade].join("") : [...b.fence].join(""));

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
  if (genre === "slitherlink") {
    const base: GridSpec = { genre, size: [rows, cols], givens: [] };
    const target = await randomBoard(base, `:- #count{B: fence(B)} < ${Math.round(rows * cols * 0.9)}.`);
    if (!target) continue;
    const g = makePuzzle(base).grid;
    const pool: Given[] = Array.from({ length: g.cellCount }, (_, i) => ({ at: "cell", cell: at(i), kind: "number", value: g.cellBorders[i].filter((e) => target.fence[e] === 1).length }));
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
      spec.givens = spec.givens!.filter((x) => { const k = x.at === "cell" ? `c${x.cell}` : `b${x.cells}`; if (seen.has(k)) return false; seen.add(k); return true; });
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
console.log(`wrote src/games/${genre}/${number}.json: ${result.givens!.length} clues, rules ${(makePuzzle(result).rules.map((r) => r.rule)).join(", ")}`);
