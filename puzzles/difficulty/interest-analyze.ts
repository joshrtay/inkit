// The interestingness experiment's analysis (interest-run.ts's CSVs in references/psjp): does a
// measure predict likes per solver beyond what difficulty explains? Hard puzzles draw fewer, keener
// solvers who like more of what they finish, so raw correlations with likes per solver are partly
// difficulty. Here each correlation is partial: likes per solver and the measure are both ranked,
// the site's difficulty is regressed out of each, and what's left is correlated.
//
//   node puzzles/difficulty/interest-analyze.ts <type>...
import { readFileSync } from "node:fs";

const root = new URL("../../references/psjp/", import.meta.url).pathname;
const rank = (v: number[]) => {
  const idx = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]), r = new Array<number>(v.length);
  for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2; i = j + 1; }
  return r;
};
const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;
const corr = (a: number[], b: number[]) => {
  const ma = mean(a), mb = mean(b); let n = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da && db ? n / Math.sqrt(da * db) : 0;
};
/** what's left of y once x is regressed out (least squares) */
const residual = (y: number[], x: number[]) => {
  const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0;
  for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
  const b = sxx ? sxy / sxx : 0;
  return y.map((v, i) => v - my - b * (x[i] - mx));
};
/** Spearman correlation of a and b with c held fixed */
export const partial = (a: number[], b: number[], c: number[]) => { const rc = rank(c); return corr(residual(rank(a), rc), residual(rank(b), rc)); };

const MEASURES = ["estimate", "steps", "busywork", "hardShare", "stuck", "breakIn", "keyAt", "keyCost", "flowMean", "flowSpread", "oneWay", "aimless", "theme", "variety"];
for (const type of process.argv.slice(2)) {
  let text: string;
  try { text = readFileSync(`${root}interest-${type}.csv`, "utf8"); } catch { console.log(`${type}: no results`); continue; }
  const [head, ...lines] = text.trim().split("\n");
  const cols = head.split(","), rows = lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [cols[i], v])));
  const solved = rows.filter((r) => r.solved === "true");
  const col = (k: string) => solved.map((r) => Number(r[k]));
  const likes = col("perSolver"), diff = col("siteDifficulty");
  console.log(`\n${type}: ${solved.length} solved puzzles. Likes per solver vs site difficulty: ${corr(rank(likes), rank(diff)).toFixed(2)}`);
  console.log(`${"measure".padEnd(11)} ${"raw".padStart(6)} ${"beyond difficulty".padStart(18)}`);
  for (const m of MEASURES) console.log(`${m.padEnd(11)} ${corr(rank(col(m)), rank(likes)).toFixed(2).padStart(6)} ${partial(col(m), likes, diff).toFixed(2).padStart(18)}`);
}
