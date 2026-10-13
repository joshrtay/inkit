// Does our solver settle marks in the order people do? For each of Janko's puzzles of a type (local
// only), the rank correlation between the test-solver's order (janko.ts: the first move giving
// each mark its final value) and the round our solver settled it in, against two baselines: random
// (0) and reading row by row. Also, per person, the mean agreement.
//
// Only marks the person settled count (people rarely cross out a loop's unused links, nor dot
// every unlit cell in Akari), and only puzzles where they settled at least 60% of the solution's
// true marks (stars, bulbs, shaded cells, lines, cuts): the rest have few or no recorded moves.
//
//   node puzzles/difficulty/janko-order.ts [type …] [--max-size 10] [--limit 80]
//   (types: star-battle akari hitori fillomino masyu slitherlink nurikabe spiral-galaxies)
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { makePuzzle } from "../../src/engine/puzzle.ts";
import type { Grid } from "../../src/engine/geometry.ts";
import type { GridSpec } from "../../src/engine/types.ts";
import { spearman } from "./calibrate.ts";
import { deduceGuarded } from "./deduce-guarded.ts";
import { windowKind } from "./deduce.ts";
import { JANKO_DIR, JANKO_TYPES, type Janko, readType } from "./janko.ts";
import { mapPool } from "./pool.ts";

/** The command line: types, and --max-size / --limit. */
export function jankoArgs(argv: string[]) {
  const opt = (name: string, d: number) => { const k = argv.indexOf(name); return k >= 0 ? Number(argv[k + 1]) : d; };
  const skip = new Set(["--max-size", "--limit"].flatMap((o) => { const k = argv.indexOf(o); return k >= 0 ? [k, k + 1] : []; }));
  const types = argv.filter((_, i) => !skip.has(i));
  return { types: types.length ? types : Object.keys(JANKO_TYPES), maxSize: opt("--max-size", 10), limit: opt("--limit", 80) };
}

/** A type's puzzles up to maxSize × maxSize with enough recorded moves, at most `limit`, spread
 *  evenly through Janko's numbering. */
export function studied(type: string, maxSize: number, limit: number): { f: string; j: Janko }[] {
  const ok = readType(type).filter(({ j }) => {
    const [rows, cols] = j.spec.size;
    if (rows > maxSize || cols > maxSize || !j.moves) return false;
    const truths = [...j.truth].filter(([, v]) => v).map(([m]) => m);
    return truths.filter((m) => j.settled.has(m)).length >= 0.6 * truths.length;
  });
  if (ok.length <= limit) return ok;
  return Array.from({ length: limit }, (_, k) => ok[Math.floor((k * ok.length) / limit)]);
}

/** Where a mark sits when reading row by row: its middle point, rows first. */
export function readingKey(g: Grid, mark: string): number {
  const m = /^(\w+)\((\d+)\)$/.exec(mark)!, id = Number(m[2]);
  const mid = (pts: [number, number][]) => pts.reduce(([x, y], [a, b]) => [x + a / pts.length, y + b / pts.length], [0, 0]);
  const [x, y] = m[1] === "shaded" ? g.cellXY(id)
    : m[1] === "fence" ? mid(g.borders[id].corners.map((c) => g.cornerXY(c)))
    : mid(g.links[id].cells.map((c) => g.cellXY(c)));
  return y * (g.width + 1) + x;
}

/** The round our solver settled each mark in (0: before the first step), and how. */
export function rounds(r: { initial?: string[]; path: { round?: number; tier: number; where: string; cost: number; facts: { mark: string; value: boolean }[] }[] }) {
  const round = new Map<string, number>(), how = new Map<string, string>();
  for (const x of r.initial ?? []) { const m = /^(.*)=(true|false)$/.exec(x); if (m && !round.has(m[1])) { round.set(m[1], 0); how.set(m[1], "start"); } }
  for (const s of r.path) for (const fact of s.facts) {
    if (round.has(fact.mark)) continue;
    round.set(fact.mark, s.round ?? 0);
    how.set(fact.mark, `${fact.value}|T${s.tier}|${windowKind(s.where)}|${s.cost}`);
  }
  return { round, how };
}

/** Our solver on a puzzle (30 s budget, killed at 2 min), its result kept in
 *  references/janko/deduce/ so janko-stuck.ts reuses janko-order.ts's solves. Keyed by the puzzle
 *  and the solver's switches, not its code: JANKO_FRESH=1 solves again after changing deduce.ts. */
export async function deduceCached(spec: GridSpec) {
  const key = createHash("sha256").update(JSON.stringify([spec, process.env.DEDUCE_LEMMAS ?? "", process.env.DEDUCE_PRICES ?? ""])).digest("hex").slice(0, 24);
  const dir = `${JANKO_DIR}deduce/`, file = `${dir}${key}.json`;
  if (!process.env.JANKO_FRESH && existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as Awaited<ReturnType<typeof deduceGuarded>>;
  const r = await deduceGuarded(spec, { budgetMs: 30000 }, 120000);
  if (r) { mkdirSync(dir, { recursive: true }); writeFileSync(file, JSON.stringify({ ...r, trace: undefined })); }
  return r;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? NaN;

if (import.meta.url === `file://${process.argv[1]}`) {
  const { types, maxSize, limit } = jankoArgs(process.argv.slice(2));
  const summary: string[] = [];
  for (const type of types) {
    const puzzles = studied(type, maxSize, limit);
    console.error(`${type}: ${puzzles.length} puzzles up to ${maxSize} × ${maxSize} with recorded moves`);
    let done = 0;
    const rows = await mapPool(puzzles, async ({ f, j }) => {
      const r = await deduceCached(j.spec).catch((e) => { console.error(`${f}: ${(e as Error).message}`); return null; });
      console.error(`${type} ${++done}/${puzzles.length} ${f}${r?.profile.solved ? "" : " (not solved)"}`);
      if (!r || !r.profile.solved) return null;
      const g = makePuzzle(j.spec).grid;
      const { round, how } = rounds(r);
      const marks = [...j.settled.keys()].filter((m) => round.has(m));
      const human = marks.map((m) => j.settled.get(m)!), ours = marks.map((m) => round.get(m)!), reading = marks.map((m) => readingKey(g, m));
      const pct = (xs: number[]) => { const o = xs.map((x, k) => [x, k] as const).sort((a, b) => a[0] - b[0]); const out = new Array<number>(xs.length); o.forEach(([, k], rk) => { out[k] = rk / Math.max(1, xs.length - 1); }); return out; };
      const hp = pct(human), op = pct(ours);
      return {
        f, size: j.spec.size, solver: j.solver, marks: marks.length, estimate: r.profile.estimate,
        rho: spearman(human, ours), rowMajor: spearman(human, reading), oursRowMajor: spearman(ours, reading),
        // each mark: its share of the way through the person's solve and through ours (0 first,
        // 1 last, by rank), and how our solver settled it
        detail: marks.map((m, k) => ({ mark: m, human: +hp[k].toFixed(3), ours: +op[k].toFixed(3), how: how.get(m) })),
      };
    });
    const ok = rows.filter((r): r is NonNullable<typeof r> => !!r && Number.isFinite(r.rho) && r.marks >= 3);
    const line = `${type}: ${ok.length} compared (of ${puzzles.length}); human vs our rounds mean ${mean(ok.map((r) => r.rho)).toFixed(2)}, median ${median(ok.map((r) => r.rho)).toFixed(2)}; human vs row by row ${mean(ok.map((r) => r.rowMajor)).toFixed(2)}; ours vs row by row ${mean(ok.map((r) => r.oursRowMajor)).toFixed(2)}`;
    console.log(line);
    summary.push(line);
    const bySolver = new Map<string, number[]>();
    for (const r of ok) bySolver.set(r.solver, [...(bySolver.get(r.solver) ?? []), r.rho]);
    console.log("  by test-solver (n ≥ 5): " + [...bySolver].filter(([, v]) => v.length >= 5).map(([s, v]) => `${s} ${mean(v).toFixed(2)} (n=${v.length})`).join(", "));
    writeFileSync(`${JANKO_DIR}order-${type}.json`, JSON.stringify(ok, null, 1));
  }
  if (summary.length > 1) console.log(summary.join("\n"));
}
