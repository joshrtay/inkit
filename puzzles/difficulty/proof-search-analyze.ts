// Phase 0's analysis (docs/research-trajectory.md; proof-search-run.ts's CSVs in references/psjp):
//   - the gap: how much cheaper the best proof found is than the greedy path, by the sum (best
//     search, and the cheapest-only path alone) and by the max (the cheapest-only path is optimal
//     for the max);
//   - how the paths differ: the share of greedy's steps not in the best proof, how far in the first
//     difference comes, and where the saving falls (0 the start of greedy's path, 1 the end);
//   - against people: each cost's Spearman with the site's difficulty, and its partial Spearman
//     with likes per solver with the site's difficulty held fixed (as intended-analyze.ts), with
//     bootstrap 95% intervals; and the difference best − greedy, bootstrapped paired.
// Types are pooled by ranking within each type.
//
//   node puzzles/difficulty/proof-search-analyze.ts <type>... [--json out.json]
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("../../references/psjp/", import.meta.url).pathname;
const args = process.argv.slice(2), types = args.filter((a) => !a.startsWith("--") && !a.endsWith(".json"));
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : "";

const mean = (x: number[]) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : NaN);
const median = (x: number[]) => { const s = [...x].sort((a, b) => a - b); return s.length ? (s[Math.floor((s.length - 1) / 2)] + s[Math.ceil((s.length - 1) / 2)]) / 2 : NaN; };
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
let seed = 11;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);

interface Row { type: string; o: Record<string, number> }
const KEYS = ["greedy_sum", "best_sum", "cheapest_sum", "greedy_peak", "cheapest_peak", "greedy_steps", "best_steps", "cells"];
/** ranked within each type */
const ranked = (rows: Row[]) => {
  const out = rows.map((r) => ({ type: r.type, o: { ...r.o } }));
  for (const t of new Set(rows.map((r) => r.type))) {
    const idx = out.map((r, i) => [r, i] as const).filter(([r]) => r.type === t).map(([, i]) => i);
    for (const k of [...KEYS, "perSolver", "siteDifficulty"]) { const v = rank(idx.map((i) => out[i].o[k])); idx.forEach((i, j) => { out[i].o[k] = v[j]; }); }
  }
  return out;
};
const withDifficulty = (rs: Row[], k: string) => corr(rs.map((r) => r.o[k]), rs.map((r) => r.o.siteDifficulty));
const likesBeyond = (rs: Row[], k: string) => { const d = rs.map((r) => r.o.siteDifficulty); return corr(resid(rs.map((r) => r.o[k]), d), resid(rs.map((r) => r.o.perSolver), d)); };
/** the statistic on bootstrap resamples (re-ranked within type each time) */
const boot = (rows: Row[], stat: (rs: Row[]) => number, n = 400) => {
  const xs: number[] = [];
  for (let b = 0; b < n; b++) xs.push(stat(ranked(Array.from({ length: rows.length }, () => rows[Math.floor(rand() * rows.length)]))));
  xs.sort((a, b) => a - b);
  return [xs[Math.floor(0.025 * n)], xs[Math.floor(0.975 * n)]];
};

const all: Row[] = [], missing: Record<string, { n: number; unsolved: number; cap: number; error: number }> = {};
for (const type of types) {
  let text: string;
  try { text = readFileSync(`${root}proofsearch-${type}.csv`, "utf8"); } catch { console.log(`${type}: no results`); continue; }
  const [head, ...lines] = text.trim().split("\n"), cols = head.split(",");
  const m = (missing[type] = { n: 0, unsolved: 0, cap: 0, error: 0 });
  for (const l of lines) {
    const raw = Object.fromEntries(l.split(",").map((v, i) => [cols[i], v]));
    m.n++;
    if (raw.error === "1") { m.error++; continue; }
    if (raw.cap === "1") { m.cap++; continue; }
    if (raw.solved !== "1" || raw.greedy_sum === "" || raw.greedy_sum === undefined || raw.best_sum === "") { m.unsolved++; continue; }
    const o: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw)) o[k] = v === "" ? NaN : Number(v);
    all.push({ type, o });
  }
}
const report: Record<string, unknown> = { missing };
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
console.log("Coverage (sampled; solved by windows and shallow splits within the budget):");
for (const [t, m] of Object.entries(missing)) console.log(`  ${t.padEnd(12)} ${m.n - m.unsolved - m.cap - m.error} of ${m.n} (unsolved ${m.unsolved}, cap ${m.cap}, error ${m.error})`);

const groups: [string, Row[]][] = [...types.map((t) => [t, all.filter((r) => r.type === t)] as [string, Row[]]), ["pooled", all]];
for (const [name, rows] of groups) {
  if (rows.length < 8) continue;
  const gapB = rows.map((r) => (r.o.greedy_sum - r.o.best_sum) / r.o.greedy_sum);
  const gapC = rows.filter((r) => Number.isFinite(r.o.cheapest_sum)).map((r) => (r.o.greedy_sum - r.o.cheapest_sum) / r.o.greedy_sum);
  const peakGap = rows.filter((r) => Number.isFinite(r.o.cheapest_peak)).map((r) => r.o.greedy_peak - r.o.cheapest_peak);
  const exhausted = rows.filter((r) => r.o.exhausted === 1).length;
  console.log(`\n${name}: ${rows.length} puzzles (search exhausted under the bound on ${exhausted}; median ${median(rows.map((r) => r.o.expanded))} states expanded)`);
  console.log(`  sum, best vs greedy:     median gap ${pct(median(gapB))}, mean ${pct(mean(gapB))}; ≥2% on ${pct(gapB.filter((g) => g >= 0.02).length / rows.length)}, ≥5% on ${pct(gapB.filter((g) => g >= 0.05).length / rows.length)}, ≥10% on ${pct(gapB.filter((g) => g >= 0.1).length / rows.length)}`);
  console.log(`  sum, cheapest vs greedy: median gap ${pct(median(gapC))}, mean ${pct(mean(gapC))}; cheapest dearer than greedy on ${pct(gapC.filter((g) => g < -0.005).length / gapC.length)} (of ${gapC.length} with both)`);
  console.log(`  search beyond cheapest:  best under both chains on ${pct(rows.filter((r) => r.o.best_sum < Math.min(r.o.greedy_sum, r.o.cheapest_sum) - 0.01).length / rows.length)}`);
  console.log(`  max: greedy's peak above the min-peak on ${pct(peakGap.filter((g) => g > 0.005).length / peakGap.length)} (by ≥0.5 on ${pct(peakGap.filter((g) => g >= 0.5).length / peakGap.length)}; median where above ${median(peakGap.filter((g) => g > 0.005)).toFixed(2)})`);
  console.log(`  paths: ${pct(mean(rows.map((r) => r.o.best_differ)))} of greedy's steps not in the best proof; first difference ${mean(rows.map((r) => r.o.best_firstDiff)).toFixed(2)} of the way in; saving centred at ${mean(rows.map((r) => r.o.best_savingAt).filter(Number.isFinite)).toFixed(2)}; steps ${mean(rows.map((r) => r.o.greedy_steps)).toFixed(1)} → ${mean(rows.map((r) => r.o.best_steps)).toFixed(1)}`);
  report[`gap:${name}`] = { n: rows.length, exhausted, medianBest: median(gapB), meanBest: mean(gapB), share2: gapB.filter((g) => g >= 0.02).length / rows.length, share5: gapB.filter((g) => g >= 0.05).length / rows.length, share10: gapB.filter((g) => g >= 0.1).length / rows.length, medianCheapest: median(gapC), peakAbove: peakGap.filter((g) => g > 0.005).length / peakGap.length, peakAbove05: peakGap.filter((g) => g >= 0.5).length / peakGap.length, differ: mean(rows.map((r) => r.o.best_differ)), firstDiff: mean(rows.map((r) => r.o.best_firstDiff)), savingAt: mean(rows.map((r) => r.o.best_savingAt).filter(Number.isFinite)) };
  const rr = ranked(rows);
  console.log(`  ${"cost".padEnd(14)} ${"vs difficulty".padStart(22)} ${"likes beyond difficulty".padStart(28)}`);
  for (const k of ["greedy_sum", "best_sum", "cheapest_sum", "greedy_peak", "cheapest_peak", "cells"]) {
    const d = withDifficulty(rr, k), [dl, dh] = boot(rows, (rs) => withDifficulty(rs, k));
    const l = likesBeyond(rr, k), [ll, lh] = boot(rows, (rs) => likesBeyond(rs, k));
    console.log(`  ${k.padEnd(14)} ${d.toFixed(3).padStart(7)} [${dl.toFixed(2)}, ${dh.toFixed(2)}] ${l.toFixed(3).padStart(13)} [${ll.toFixed(2)}, ${lh.toFixed(2)}]`);
    report[`corr:${name}:${k}`] = { difficulty: d, dLo: dl, dHi: dh, likes: l, lLo: ll, lHi: lh };
  }
  // does the best proof correlate better? paired, on the same resamples
  for (const [a, b] of [["best_sum", "greedy_sum"], ["cheapest_peak", "greedy_peak"]]) {
    const dd = withDifficulty(rr, a) - withDifficulty(rr, b), [x, y] = boot(rows, (rs) => withDifficulty(rs, a) - withDifficulty(rs, b));
    const dl = likesBeyond(rr, a) - likesBeyond(rr, b), [u, v] = boot(rows, (rs) => likesBeyond(rs, a) - likesBeyond(rs, b));
    console.log(`  ${a} − ${b}: difficulty ${dd >= 0 ? "+" : ""}${dd.toFixed(3)} [${x.toFixed(3)}, ${y.toFixed(3)}], likes ${dl >= 0 ? "+" : ""}${dl.toFixed(3)} [${u.toFixed(3)}, ${v.toFixed(3)}]`);
    report[`delta:${name}:${a}-${b}`] = { difficulty: dd, dLo: x, dHi: y, likes: dl, lLo: u, lHi: v };
  }
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(report, null, 1));
