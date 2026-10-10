// Calibration runs for the deduction solver (no AI, no cost).
//
//   node puzzles/difficulty/calibrate.ts examples [genre...]   every example puzzle in src/games
//   node puzzles/difficulty/calibrate.ts psjp <genre> [n]       Puzzle Square JP's rated puzzles
//       (references/psjp, local only): Spearman correlation of the estimate with the site's
//       difficulty rating (1-5) and with solver counts
//   node puzzles/difficulty/calibrate.ts generated                  the generator's puzzles at the
//       AI creators' sizes: speed, and whether bigger and busier come out harder
//   node puzzles/difficulty/calibrate.ts acclaimed <genre> [n]  acclaimed (references/collections)
//       against generated puzzles of the same sizes (puzzles/grid/generate.ts): AUC (test T1)
import { existsSync, readdirSync, readFileSync } from "node:fs";
import type { GridSpec } from "../../src/engine/types.ts";
import { deduce, estimateOf, softmax, type Profile } from "./deduce.ts";

const root = new URL("../../", import.meta.url).pathname;
const row = (name: string, p: Profile) => `${name.padEnd(28)} ${p.estimate.toFixed(2)}  D ${p.dSteps.toFixed(1).padStart(4)}  max ${p.maxCost.toFixed(1).padStart(4)}  bands ${Object.values(p.bands).join("/")}  T${p.hardestTier}  steps ${String(p.steps).padStart(3)}  load ${p.ruleLoad}  ${String(p.ms).padStart(6)} ms${p.solved ? "" : "  UNSOLVED"}${p.notes.length ? `  (${p.notes.join("; ").slice(0, 80)})` : ""}`;

/** Spearman's rank correlation (ties get their mean rank). */
export function spearman(xs: number[], ys: number[]): number {
  const rank = (v: number[]) => {
    const idx = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]), r = new Array(v.length);
    for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2; i = j + 1; }
    return r as number[];
  };
  const a = rank(xs), b = rank(ys), n = xs.length, ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

/** The probability that a random positive scores above a random negative (ties count half). */
export function auc(pos: number[], neg: number[]): number {
  let s = 0;
  for (const p of pos) for (const q of neg) s += p > q ? 1 : p === q ? 0.5 : 0;
  return pos.length && neg.length ? s / (pos.length * neg.length) : NaN;
}

async function examples(only: string[]) {
  for (const genre of readdirSync(`${root}src/games`).sort()) {
    if (only.length && !only.includes(genre)) continue;
    for (const f of readdirSync(`${root}src/games/${genre}`).filter((x) => x.endsWith(".json")).sort((a, b) => parseInt(a) - parseInt(b))) {
      const d = JSON.parse(readFileSync(`${root}src/games/${genre}/${f}`, "utf8"));
      if (!d.grid) continue;
      const spec: GridSpec = { genre, ...d.grid };
      try { console.log(row(`${genre}/${f} ${spec.size.join("x")}`, (await deduce(spec, { budgetMs: 15000 })).profile)); }
      catch (e) { console.log(`${genre}/${f}: ${(e as Error).message.slice(0, 100)}`); }
    }
  }
}

async function psjp(genre: string, limit: number) {
  const dir = `${root}references/psjp/${genre}`;
  if (!existsSync(dir)) throw new Error(`no ${dir} (references/ is local only)`);
  // small grids only (the AI creators' sizes; big ones take minutes): up to 10×10
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort((a, b) => parseInt(a) - parseInt(b))
    .filter((f) => { const d = JSON.parse(readFileSync(`${dir}/${f}`, "utf8")); return d.grid?.size && d.grid.size[0] * d.grid.size[1] <= 100; });
  // a spread across the site's ratings: every k-th puzzle
  const step = Math.max(1, Math.floor(files.length / limit));
  const est: number[] = [], rated: number[] = [], solves: number[] = [], likeRate: number[] = [], costs: number[][] = [], loads: number[] = [];
  for (const f of files.filter((_, i) => i % step === 0).slice(0, limit)) {
    const d = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
    if (d.ours?.solutions !== 1 || !d.rating) continue;
    try {
      const { profile, path } = await deduce(d.grid, { budgetMs: 15000 });
      if (!profile.solved) { console.log(row(`${f} (skipped)`, profile)); continue; }
      console.log(row(`${f} ${d.grid.size.join("x")} r${d.rating.difficulty}`, profile));
      costs.push(path.filter((s) => !s.choice).map((s) => s.cost)); loads.push(profile.ruleLoad);
      est.push(profile.estimate); rated.push(d.rating.difficulty); solves.push(d.rating.solves); likeRate.push(d.rating.shrunk ?? d.rating.like_rate);
    } catch (e) { console.log(`${f}: ${(e as Error).message.slice(0, 100)}`); }
  }
  // which soft-max k ranks them most like the site's ratings
  for (const k of [0.25, 0.5, 1, 1.5, 2, 3, 5]) {
    const e = costs.map((c, i) => estimateOf({ dSteps: softmax(c, k), ruleLoad: loads[i], solved: true }));
    const dOnly = costs.map((c) => softmax(c, k));
    console.log(`k=${k}: Spearman(estimate, PSJP difficulty) = ${spearman(e, rated).toFixed(2)}, (D_steps, difficulty) = ${spearman(dOnly, rated).toFixed(2)}, (D_steps, solvers) = ${spearman(dOnly, solves).toFixed(2)}`);
  }
  console.log(`max cost: ${spearman(costs.map((c) => Math.max(0, ...c)), rated).toFixed(2)}, steps: ${spearman(costs.map((c) => c.length), rated).toFixed(2)}, total: ${spearman(costs.map((c) => c.reduce((a, b) => a + b, 0)), rated).toFixed(2)} (Spearman with difficulty)`);
  console.log(`\n${genre}: n=${est.length}  Spearman(estimate, PSJP difficulty) = ${spearman(est, rated).toFixed(2)}  (estimate, solvers) = ${spearman(est, solves).toFixed(2)}  (estimate, likes per solver) = ${spearman(est, likeRate).toFixed(2)}`);
}

async function acclaimed(genre: string, limit: number) {
  const dir = `${root}references/collections/${genre}`;
  if (!existsSync(dir)) throw new Error(`no ${dir} (references/ is local only)`);
  const { generate } = await import("../grid/generate.ts");
  const pos: number[] = [], neg: number[] = [];
  let seed = 1;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).filter((x) => { const d = JSON.parse(readFileSync(`${dir}/${x}`, "utf8")); return d.grid?.size && d.grid.size[0] * d.grid.size[1] <= 100; }).slice(0, limit)) {
    const d = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
    try {
      const a = (await deduce(d.grid, { budgetMs: 15000 })).profile;
      console.log(row(`acclaimed ${f} ${d.grid.size.join("x")}`, a)); pos.push(a.estimate);
      const r = await generate({ genre, rows: d.grid.size[0], cols: d.grid.size[1], seed: seed++ });
      if (r) { const b = (await deduce(r, { budgetMs: 15000 })).profile; console.log(row(`  random ${r.size.join("x")}`, b)); neg.push(b.estimate); }
    } catch (e) { console.log(`${f}: ${(e as Error).message.slice(0, 100)}`); }
  }
  console.log(`\n${genre}: acclaimed ${pos.length}, random ${neg.length}: AUC(acclaimed scored harder) = ${auc(pos, neg).toFixed(2)}`);
}

async function generated() {
  const { generate } = await import("../grid/generate.ts");
  const cases: [string, number, string?][] = [["sudoku", 4], ["sudoku", 6], ["sudoku", 9], ["star-battle", 6], ["star-battle", 9], ["akari", 7], ["nurikabe", 8], ["panel", 4, "squares"], ["panel", 4, "squares+stars+triangles+shapes"]];
  for (const [genre, n, mix] of cases) for (const seed of [1, 2, 3]) {
    const spec = await generate({ genre, rows: n, cols: n, seed, mix });
    if (!spec) { console.log(`${genre} ${n}: no puzzle`); continue; }
    try { console.log(row(`${genre} ${n}${mix ? ` ${mix}` : ""} #${seed}`, (await deduce(spec, { budgetMs: 10000 })).profile)); }
    catch (e) { console.log(`${genre} ${n}: ${(e as Error).message.slice(0, 100)}`); }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [mode, ...rest] = process.argv.slice(2);
  if (mode === "examples") await examples(rest);
  else if (mode === "psjp") await psjp(rest[0], +(rest[1] ?? 30));
  else if (mode === "generated") await generated();
  else if (mode === "acclaimed") await acclaimed(rest[0], +(rest[1] ?? 20));
  else console.error("usage: node puzzles/difficulty/calibrate.ts examples [genre...] | generated | psjp <genre> [n] | acclaimed <genre> [n]");
}
