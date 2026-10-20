// The intended-path test's analysis (intended-run.ts's CSVs in references/psjp): do the min-peak
// path's features predict likes per solver beyond difficulty, where the usual path's interest
// measures (g_) didn't? Likes per solver rise with difficulty (keener solvers), so everything is
// read with the site's difficulty held fixed:
//   - each feature's partial Spearman with likes per solver (both ranked, difficulty regressed
//     out of each), with a bootstrap 95% interval;
//   - held-out fit: ranked likes per solver from difficulty alone, then with the min-peak
//     features, then with the usual path's, by least squares in 5 folds repeated; the score is
//     the held-out correlation of prediction and truth. Beating difficulty alone, beyond the
//     folds' spread, where the usual measures don't, is the go signal.
// Types are pooled by ranking within each type. Also: how often no split-free path exists (a
// missing technique), by type and site difficulty.
//
//   node puzzles/difficulty/intended-analyze.ts <type>... [--solved] [--json out.json]
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("../../references/psjp/", import.meta.url).pathname;
const args = process.argv.slice(2), types = args.filter((a) => !a.startsWith("--") && !a.endsWith(".json"));
const onlySolved = args.includes("--solved"), jsonOut = args[args.indexOf("--json") + 1];

const MIN_PEAK = ["peak", "noSplit", "hinges", "stuck", "peakRounds", "gap", "peakAt", "usage", "openMean", "oneWay", "steps", "dSteps"];
const USUAL = ["g_peak", "g_steps", "g_busywork", "g_hardShare", "g_stuck", "g_breakIn", "g_keyAt", "g_keyCost", "g_flowMean", "g_flowSpread", "g_oneWay", "g_aimless", "g_theme", "g_variety", "g_estimate"];

// ---- statistics ----
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
/** least squares with a small ridge; returns the weights (the first for the constant) */
const fit = (X: number[][], y: number[], ridge = 1e-3) => {
  const p = X[0].length + 1, A = Array.from({ length: p }, () => new Array<number>(p + 1).fill(0));
  for (let i = 0; i < X.length; i++) {
    const x = [1, ...X[i]];
    for (let a = 0; a < p; a++) { for (let b = 0; b < p; b++) A[a][b] += x[a] * x[b]; A[a][p] += x[a] * y[i]; }
  }
  for (let a = 1; a < p; a++) A[a][a] += ridge * X.length;
  for (let c = 0; c < p; c++) {
    let piv = c; for (let r = c + 1; r < p; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    if (Math.abs(A[c][c]) < 1e-12) continue;
    for (let r = 0; r < p; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k <= p; k++) A[r][k] -= f * A[c][k]; }
  }
  return A.map((row, c) => (Math.abs(row[c]) < 1e-12 ? 0 : row[p] / row[c]));
};
const predict = (w: number[], x: number[]) => w[0] + x.reduce((a, v, i) => a + w[i + 1] * v, 0);
let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);

interface Row { type: string; y: number; d: number; f: Record<string, number>; solved: boolean; siteDifficulty: number }
/** feature and target ranked within each type (pooling types on one scale) */
const ranked = (rows: Row[], keys: string[]) => {
  const out = rows.map((r) => ({ ...r, f: { ...r.f } }));
  for (const t of new Set(rows.map((r) => r.type))) {
    const idx = out.map((r, i) => [r, i] as const).filter(([r]) => r.type === t).map(([, i]) => i);
    const set = (get: (r: Row) => number, put: (r: Row, v: number) => void) => { const v = rank(idx.map((i) => get(out[i]))); idx.forEach((i, k) => put(out[i], v[k])); };
    set((r) => r.y, (r, v) => { r.y = v; });
    set((r) => r.d, (r, v) => { r.d = v; });
    for (const k of keys) {
      const have = idx.filter((i) => Number.isFinite(out[i].f[k])), v = rank(have.map((i) => out[i].f[k]));
      have.forEach((i, j) => { out[i].f[k] = v[j]; });
    }
  }
  return out;
};
const partial = (rows: Row[], k: string) => {
  const rs = rows.filter((r) => Number.isFinite(r.f[k]));
  if (rs.length < 10) return NaN;
  const res = (ys: number[]) => { const w = fit(rs.map((r) => [r.d]), ys, 0); return ys.map((v, i) => v - predict(w, [rs[i].d])); };
  return corr(res(rs.map((r) => r.f[k])), res(rs.map((r) => r.y)));
};
const boot = (rows: Row[], k: string, n = 400) => {
  const xs: number[] = [];
  for (let b = 0; b < n; b++) xs.push(partial(Array.from({ length: rows.length }, () => rows[Math.floor(rand() * rows.length)]), k));
  xs.sort((a, b) => a - b);
  return [xs[Math.floor(0.025 * n)], xs[Math.floor(0.975 * n)]];
};
/** held-out correlation of predicted and true ranked likes, 5 folds × reps: mean and spread */
const heldOut = (rows: Row[], keys: string[], reps = 20) => {
  const scores: number[] = [];
  const feats = (r: Row) => [r.d, ...keys.map((k) => (Number.isFinite(r.f[k]) ? r.f[k] : 0.5))];
  for (let rep = 0; rep < reps; rep++) {
    const fold = rows.map(() => Math.floor(rand() * 5)), pred = new Array<number>(rows.length);
    for (let f = 0; f < 5; f++) {
      const tr = rows.filter((_, i) => fold[i] !== f);
      const w = fit(tr.map(feats), tr.map((r) => r.y), 0.05);
      rows.forEach((r, i) => { if (fold[i] === f) pred[i] = predict(w, feats(r)); });
    }
    scores.push(corr(pred, rows.map((r) => r.y)));
  }
  const m = mean(scores);
  return { mean: m, sd: Math.sqrt(mean(scores.map((s) => (s - m) ** 2))), scores };
};

// ---- the data ----
const all: Row[] = [];
for (const type of types) {
  let text: string;
  try { text = readFileSync(`${root}intended-${type}.csv`, "utf8"); } catch { console.log(`${type}: no results`); continue; }
  const [head, ...lines] = text.trim().split("\n"), cols = head.split(",");
  for (const l of lines) {
    const o = Object.fromEntries(l.split(",").map((v, i) => [cols[i], v]));
    if (o.error === "1" || o.peak === undefined || o.peak === "" || o.g_peak === "") continue;
    const f: Record<string, number> = {};
    for (const k of [...MIN_PEAK, ...USUAL]) f[k] = o[k] === "" || o[k] === undefined ? NaN : Number(o[k]);
    all.push({ type, y: Number(o.perSolver), d: Number(o.siteDifficulty), f, solved: o.solved === "true", siteDifficulty: Number(o.siteDifficulty) });
  }
}
const report: Record<string, unknown> = {};
console.log("No split-free path within the windows (a missing technique), by site difficulty 1–5:");
for (const t of types) {
  const rs = all.filter((r) => r.type === t);
  if (!rs.length) continue;
  const by = [1, 2, 3, 4, 5].map((d) => { const x = rs.filter((r) => r.siteDifficulty === d); return x.length ? `${d}: ${Math.round(100 * x.filter((r) => !r.solved).length / x.length)}% of ${x.length}` : `${d}: –`; });
  console.log(`  ${t.padEnd(12)} ${Math.round(100 * rs.filter((r) => !r.solved).length / rs.length)}% of ${rs.length}   (${by.join(", ")})`);
  report[`missing:${t}`] = rs.filter((r) => !r.solved).length / rs.length;
}

const groups: [string, Row[]][] = [...types.map((t) => [t, all.filter((r) => r.type === t)] as [string, Row[]]), ["pooled", all]];
for (const [name, raw] of groups) {
  const base = onlySolved ? raw.filter((r) => r.solved) : raw;
  if (base.length < 30) continue;
  const rows = ranked(base, [...MIN_PEAK, ...USUAL]);
  console.log(`\n${name}: ${rows.length} puzzles${onlySolved ? " (min-peak solved)" : ""}; likes per solver vs site difficulty ${corr(rows.map((r) => r.y), rows.map((r) => r.d)).toFixed(2)}`);
  console.log(`${"feature".padEnd(14)} ${"beyond difficulty".padStart(17)}  95% interval`);
  for (const k of [...MIN_PEAK, ...USUAL]) {
    const p = partial(rows, k);
    if (!Number.isFinite(p)) continue;
    const [lo, hi] = boot(rows, k);
    console.log(`${k.padEnd(14)} ${p.toFixed(3).padStart(17)}  [${lo.toFixed(2)}, ${hi.toFixed(2)}]${lo > 0 || hi < 0 ? " *" : ""}`);
    report[`partial:${name}:${k}`] = { p, lo, hi };
  }
  const d0 = heldOut(rows, []), mp = heldOut(rows, MIN_PEAK), us = heldOut(rows, USUAL);
  const gain = (h: typeof mp) => { const g = h.scores.map((s, i) => s - d0.scores[i]); const m = mean(g); return `${m >= 0 ? "+" : ""}${m.toFixed(3)} ± ${Math.sqrt(mean(g.map((x) => (x - m) ** 2))).toFixed(3)}`; };
  console.log(`held out: difficulty alone ${d0.mean.toFixed(3)}; + min-peak ${mp.mean.toFixed(3)} (${gain(mp)}); + usual ${us.mean.toFixed(3)} (${gain(us)})`);
  report[`heldout:${name}`] = { difficulty: d0.mean, minPeak: mp.mean, usual: us.mean, n: rows.length };
}
if (jsonOut && jsonOut.endsWith(".json")) writeFileSync(jsonOut, JSON.stringify(report, null, 1));
