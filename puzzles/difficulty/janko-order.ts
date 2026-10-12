// Does our solver settle cells in the order people do? For each of Janko's Star Battles (local
// only), the rank correlation between the test-solver's order (janko.ts) and the round our solver
// settled each cell in, against two baselines: random (0) and reading row by row. Also, per
// person: the share of their moves that our solver made in its first rounds (the easy start).
//
//   node puzzles/difficulty/janko-order.ts [maxSize]
import { readdirSync, writeFileSync } from "node:fs";
import { spearman } from "./calibrate.ts";
import { deduceGuarded } from "./deduce-guarded.ts";
import { readStarBattle } from "./janko.ts";
import { mapPool } from "./pool.ts";
import { windowKind } from "./deduce.ts";

const repo = new URL("../../", import.meta.url).pathname;
const dir = `${repo}references/janko/Sternenschlacht/`;
const maxSize = Number(process.argv[2]) || 10;
const puzzles = readdirSync(dir).filter((f) => f.endsWith(".txt")).sort()
  .map((f) => ({ f, j: readStarBattle(dir + f) }))
  .filter((x) => x.j && x.j.spec.size[0] <= maxSize && x.j.settled.size > x.j.spec.size[0] ** 2 * 0.6);
console.error(`${puzzles.length} puzzles up to ${maxSize} × ${maxSize} with recorded moves`);

let done = 0;
const rows = await mapPool(puzzles, async ({ f, j }) => {
  const r = await deduceGuarded(j!.spec, { budgetMs: 30000 }, 120000).catch(() => null);
  console.error(`${++done}/${puzzles.length} ${f}`);
  if (!r || !r.profile.solved) return null;
  const n = j!.spec.size[0];
  // the round each cell was settled in by our solver (0: before the first step)
  const round = new Map<number, number>(), how = new Map<number, string>();
  for (const x of r.initial ?? []) { const m = /^shaded\((\d+)\)=/.exec(x); if (m) { round.set(+m[1], 0); how.set(+m[1], "start"); } }
  for (const s of r.path) for (const fact of s.facts) {
    const m = /^shaded\((\d+)\)$/.exec(fact.mark);
    if (m && !round.has(+m[1])) { round.set(+m[1], s.round ?? 0); how.set(+m[1], `${fact.value ? "star" : "empty"}|T${s.tier}|${windowKind(s.where)}|${s.cost}`); }
  }
  const cells = [...j!.settled.keys()].filter((i) => round.has(i));
  const human = cells.map((i) => j!.settled.get(i)!), ours = cells.map((i) => round.get(i)!);
  return {
    f, n, solver: j!.solver, cells: cells.length, estimate: r.profile.estimate,
    rho: spearman(human, ours),
    rowMajor: spearman(human, cells),
    oursRowMajor: spearman(ours, cells),
    // each cell: its share of the way through the person's solve and through ours (0 first, 1
    // last, by rank), and how our solver settled it
    detail: (() => {
      const pct = (xs: number[]) => { const o = xs.map((x, k) => [x, k] as const).sort((a, b) => a[0] - b[0]); const out = new Array(xs.length); o.forEach(([, k], r) => { out[k] = r / Math.max(1, xs.length - 1); }); return out as number[]; };
      const hp = pct(human), op = pct(ours);
      return cells.map((c, k) => ({ cell: c, human: +hp[k].toFixed(3), ours: +op[k].toFixed(3), how: how.get(c) }));
    })(),
  };
});
const ok = rows.filter((r): r is NonNullable<typeof r> => !!r && Number.isFinite(r.rho));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? NaN;
console.log(`${ok.length} puzzles compared (of ${puzzles.length})`);
console.log(`human order vs our solver's rounds: mean ${mean(ok.map((r) => r.rho)).toFixed(2)}, median ${median(ok.map((r) => r.rho)).toFixed(2)}`);
console.log(`human order vs reading row by row: mean ${mean(ok.map((r) => r.rowMajor)).toFixed(2)}`);
console.log(`our solver vs reading row by row: mean ${mean(ok.map((r) => r.oursRowMajor)).toFixed(2)}`);
const bySolver = new Map<string, number[]>();
for (const r of ok) bySolver.set(r.solver, [...(bySolver.get(r.solver) ?? []), r.rho]);
console.log("by test-solver (n ≥ 5): " + [...bySolver].filter(([, v]) => v.length >= 5).map(([s, v]) => `${s} ${mean(v).toFixed(2)} (n=${v.length})`).join(", "));
writeFileSync(`${repo}references/janko/order-star-battle.json`, JSON.stringify(ok, null, 1));
