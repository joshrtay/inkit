// The readouts of phase 1 by compression (mdl.ts) against people: each puzzle's code length under a
// language fitted on the other half of the human puzzles (two folds, so every puzzle is scored by a
// code that never saw it), and the old step costs beside them.
//
// Per puzzle: bits (total), bits a step, the "what" bits (which symbols: surprise under the context
// model) and the "where" bits (places), the dearest step, how concentrated the bits are (the top
// two steps' share: the elegance shape statistic), the most surprising step; and the reference, the
// step costs' sum and peak (cost model v0) and the step count.
//
// Against: Puzzle Square JP's difficulty (Spearman within type), likes per solver with difficulty
// held fixed (partial, ranked within type, as proof-search-analyze.ts), Fable's and Opus's interest
// placing on the labeller pilot, Tatham's grade, Beast Academy's tier. Bootstrap 95% intervals.
//
//   node --no-warnings puzzles/difficulty/mdl-readout.ts [--max 200] [--no-greedy] [--no-ctx]
import { writeFileSync } from "node:fs";
import { CTX, RICH, fit, half, loadCorpus, MDL_DIR, score, type Coded, type FitOpts, type Puzzle } from "./mdl.ts";

const args = process.argv.slice(2);
const opt = (name: string, d: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : d; };
const o: FitOpts = { max: +opt("max", "200"), top: 30, minCount: 5, greedy: !args.includes("--no-greedy"), em: 1 };
CTX.prev = !args.includes("--no-ctx");
RICH.on = args.includes("--rich");

const all = loadCorpus(opt("sets", "") ? opt("sets", "").split(",") : undefined);
const human = all.filter((p) => p.human), other = all.filter((p) => !p.human);
const feats = new Map<string, Record<string, number>>();
const add = (p: Puzzle, c: Coded) => {
  const n = c.bits.length, sum = (x: number[]) => x.reduce((a, b) => a + b, 0);
  const sorted = [...c.bits].sort((a, b) => b - a), total = sum(c.bits);
  const f: Record<string, number> = {
    bits: total, bitsPerStep: total / n, what: sum(c.what), where: total - sum(c.what),
    whatPerStep: sum(c.what) / n, dearest: sorted[0], top2: (sorted[0] + (sorted[1] ?? 0)) / total,
    surprise: Math.max(...c.what), costSum: sum(c.steps.map((s) => s.cost)), costPeak: Math.max(...c.steps.map((s) => s.cost)), steps: n,
  };
  const had = feats.get(p.key);
  feats.set(p.key, had ? Object.fromEntries(Object.entries(f).map(([k, v]) => [k, (v + had[k]) / 2])) : f);
};
for (const fold of [0, 1] as const) {
  const train = human.filter((p) => half(p.key) === fold);
  console.log(`fold ${fold}: fitting on ${train.length} puzzles`);
  const f = fit(train, o, () => {});
  for (const p of [...human.filter((p) => half(p.key) !== fold), ...other]) add(p, score(f, p, o.greedy));
}

// ---------- statistics ----------
const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;
const rank = (v: number[]) => {
  const idx = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]), r = new Array<number>(v.length);
  for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 / Math.max(1, v.length - 1); i = j + 1; }
  return r;
};
const corr = (a: number[], b: number[]) => {
  const ma = mean(a), mb = mean(b); let n = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da && db ? n / Math.sqrt(da * db) : 0;
};
const resid = (y: number[], x: number[]) => {
  const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0;
  for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
  const b = sxx ? sxy / sxx : 0;
  return y.map((v, i) => v - my - b * (x[i] - mx));
};
interface Row { type: string; v: Record<string, number> }
/** every column ranked within type, so types pool */
const ranked = (rows: Row[]) => {
  const out = rows.map((r) => ({ type: r.type, v: { ...r.v } }));
  for (const t of new Set(rows.map((r) => r.type))) {
    const ix = out.map((r, i) => [r, i] as const).filter(([r]) => r.type === t).map(([, i]) => i);
    for (const k of Object.keys(rows[0].v)) { const r = rank(ix.map((i) => out[i].v[k])); ix.forEach((i, j) => { out[i].v[k] = r[j]; }); }
  }
  return out;
};
let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const boot = (rows: Row[], stat: (rs: Row[]) => number, n = 300) => {
  const xs: number[] = [];
  for (let b = 0; b < n; b++) xs.push(stat(ranked(Array.from({ length: rows.length }, () => rows[Math.floor(rand() * rows.length)]))));
  xs.sort((a, b) => a - b);
  return [xs[Math.floor(0.025 * n)], xs[Math.floor(0.975 * n)]];
};
const FEATS = ["bits", "bitsPerStep", "what", "whatPerStep", "where", "dearest", "top2", "surprise", "costSum", "costPeak", "steps"];
const fmt = (x: number) => (x >= 0 ? " " : "") + x.toFixed(2);
const table: Record<string, Record<string, string>> = {};
function check(name: string, rows: Row[], target: string, control?: string) {
  if (rows.length < 20) return;
  const stat = (k: string) => (rs: Row[]) => control
    ? corr(resid(rs.map((r) => r.v[k]), rs.map((r) => r.v[control])), resid(rs.map((r) => r.v[target]), rs.map((r) => r.v[control])))
    : corr(rs.map((r) => r.v[k]), rs.map((r) => r.v[target]));
  const rr = ranked(rows);
  const line: Record<string, string> = {};
  console.log(`\n${name} (n ${rows.length}${control ? `, ${control} held fixed` : ""})`);
  for (const k of FEATS) {
    const [lo, hi] = boot(rows, stat(k));
    line[k] = `${stat(k)(rr).toFixed(2)} [${lo.toFixed(2)}, ${hi.toFixed(2)}]`;
    console.log(`  ${k.padEnd(12)} ${fmt(stat(k)(rr))}  [${fmt(lo)}, ${fmt(hi)}]`);
  }
  table[`${name}${control ? ` | ${control} fixed` : ""}`] = line;
}
const rowsOf = (ps: Puzzle[], extra: (p: Puzzle) => Record<string, number> | null) =>
  ps.flatMap((p) => { const e = extra(p), f = feats.get(p.key); return e && f && p.solved ? [{ type: p.genre, v: { ...f, ...e } }] : []; });

const psjp = human.filter((p) => p.meta.likes != null && p.meta.difficulty != null);
const psRows = rowsOf(psjp, (p) => ({ difficulty: +(p.meta.difficulty as number), perSolver: (p.meta.likes as number) / Math.max(1, p.meta.solvers as number) }));
check("Puzzle Square JP: difficulty", psRows, "difficulty");
check("Puzzle Square JP: likes per solver", psRows, "perSolver", "difficulty");
for (const t of new Set(psRows.map((r) => r.type))) check(`  ${t}: likes per solver`, psRows.filter((r) => r.type === t), "perSolver", "difficulty");
const fable = rowsOf(psjp.filter((p) => p.meta.fable_place != null), (p) => ({ difficulty: +(p.meta.difficulty as number), fable: p.meta.fable_place as number, perSolver: (p.meta.likes as number) / Math.max(1, p.meta.solvers as number) }));
check("Pilot: Fable's interest placing", fable, "fable", "difficulty");
const opus = rowsOf(psjp.filter((p) => p.meta.opus_place != null), (p) => ({ difficulty: +(p.meta.difficulty as number), opus: p.meta.opus_place as number }));
check("Pilot: Opus's interest placing", opus, "opus", "difficulty");
check("Tatham: grade", rowsOf(other.filter((p) => p.set === "tatham"), (p) => ({ grade: p.meta.grade as number })), "grade");
check("Beast Academy: tier", rowsOf(human.filter((p) => p.set === "ba"), (p) => ({ tier: p.meta.tier as number })), "tier");
// which way Fable's and Opus's placings point: their own agreement with likes
console.log(`\nsign check: Fable's placing with likes per solver, difficulty fixed: ${(() => { const r = ranked(fable); return corr(resid(r.map((x) => x.v.fable), r.map((x) => x.v.difficulty)), resid(r.map((x) => x.v.perSolver), r.map((x) => x.v.difficulty))).toFixed(2); })()}`);
writeFileSync(`${MDL_DIR}readout${RICH.on ? "-rich" : ""}.json`, JSON.stringify({ at: new Date().toISOString(), opts: o, ctx: CTX, rich: RICH.on, table, puzzles: Object.fromEntries(feats) }, null, 1));

// ---------- the cheap early check: frequency prices against the learned step prices ----------
// On Tatham's Singles (Hitori), Sudoku and Loopy (Slitherlink): a language fitted on Tatham's own
// puzzles (two folds, no context), each step's "what" bits (−log2 how often its symbols occur) and
// all its bits, against the step's learned price (step-prices.json, the trace's cost). Spearman over
// steps within a genre.
{
  const tat = other.filter((p) => p.set === "tatham");
  const saved = CTX.prev; CTX.prev = false;
  const pts: Record<string, { what: number[]; bits: number[]; cost: number[] }> = {};
  for (const fold of [0, 1] as const) {
    const f = fit(tat.filter((p) => half(p.key) === fold), { ...o, em: 1 }, () => {});
    for (const p of tat.filter((p) => half(p.key) !== fold)) {
      const c = score(f, p, false), e = (pts[p.genre] ??= { what: [], bits: [], cost: [] });
      c.steps.forEach((s, i) => { e.what.push(c.what[i]); e.bits.push(c.bits[i]); e.cost.push(s.cost); });
    }
  }
  CTX.prev = saved;
  console.log("\nFrequency prices against learned step prices (Tatham, Spearman over steps):");
  const early: Record<string, unknown> = {};
  for (const [g, e] of Object.entries(pts)) {
    const w = corr(rank(e.what), rank(e.cost)), b = corr(rank(e.bits), rank(e.cost));
    early[g] = { steps: e.cost.length, what: +w.toFixed(3), bits: +b.toFixed(3) };
    console.log(`  ${g.padEnd(12)} ${String(e.cost.length).padStart(6)} steps   what ${fmt(w)}   all bits ${fmt(b)}`);
  }
  writeFileSync(`${MDL_DIR}early-check.json`, JSON.stringify(early, null, 1));
}
