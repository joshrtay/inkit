// The interestingness experiment's analysis (interest-run.ts's CSVs in references/psjp): does a
// measure predict likes per solver beyond what difficulty explains? Hard puzzles draw fewer, keener
// solvers who like more of what they finish, so raw correlations with likes per solver are partly
// difficulty. Here each correlation is partial: likes per solver and the measure are both ranked,
// the site's difficulty is regressed out of each, and what's left is correlated.
//
// Beside the solver's measures: how the puzzle looks (looks.ts), and its author's other puzzles
// (their mean likes per solver, the puzzle itself left out), a rough taste-for-this-setter measure.
//
//   node puzzles/difficulty/interest-analyze.ts <type>...
import { readFileSync } from "node:fs";
import { looksOf } from "./looks.ts";

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
export const partial = (a: number[], b: number[], c: number[]) => {
  const keep = a.map((x) => Number.isFinite(x)), f = (v: number[]) => v.filter((_, i) => keep[i]);
  [a, b, c] = [f(a), f(b), f(c)];
  const rc = rank(c);
  return corr(residual(rank(a), rc), residual(rank(b), rc));
};
const rawCorr = (a: number[], b: number[]) => { const keep = a.map((x) => Number.isFinite(x)); return corr(rank(a.filter((_, i) => keep[i])), rank(b.filter((_, i) => keep[i]))); };
const data = JSON.parse(readFileSync(`${root}data.json`, "utf8")) as Record<string, { user: number }>;

const LOOKS = ["cells", "density", "rot", "sym", "exact"] as const;
const MEASURES = [...LOOKS, "author", "estimate", "steps", "busywork", "hardShare", "stuck", "breakIn", "keyAt", "keyCost", "flowMean", "flowSpread", "oneWay", "aimless", "theme", "variety", "breakInScore", "aha", "ahaCount", "ahaAt"];
for (const type of process.argv.slice(2)) {
  let text: string;
  try { text = readFileSync(`${root}interest-${type}.csv`, "utf8"); } catch { console.log(`${type}: no results`); continue; }
  const [head, ...lines] = text.trim().split("\n");
  const cols = head.split(","), rows = lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [cols[i], v])));
  const solved = rows.filter((r) => r.solved === "true");
  for (const r of solved) Object.assign(r, looksOf(JSON.parse(readFileSync(`${root}${type}/${r.id}.json`, "utf8")).grid));
  // the author's other puzzles here: mean likes per solver, at least two of them
  const byAuthor = new Map<number, number[]>();
  for (const r of solved) { const u = data[r.id]?.user; byAuthor.set(u, [...(byAuthor.get(u) ?? []), Number(r.perSolver)]); }
  for (const r of solved) {
    const all = byAuthor.get(data[r.id]?.user) ?? [], sum = all.reduce((a, b) => a + b, 0) - Number(r.perSolver);
    r.author = all.length >= 3 ? String(sum / (all.length - 1)) : "NaN";
  }
  const col = (k: string) => solved.map((r) => Number(r[k]));
  const likes = col("perSolver"), diff = col("siteDifficulty");
  const authored = col("author").filter(Number.isFinite).length, exact = col("exact").filter((x) => x === 1).length;
  console.log(`\n${type}: ${solved.length} solved puzzles (${exact} exactly symmetric; ${authored} by authors with 3 or more). Likes per solver vs site difficulty: ${corr(rank(likes), rank(diff)).toFixed(2)}`);
  console.log(`${"measure".padEnd(11)} ${"raw".padStart(6)} ${"beyond difficulty".padStart(18)}`);
  for (const m of MEASURES) console.log(`${m.padEnd(11)} ${rawCorr(col(m), likes).toFixed(2).padStart(6)} ${partial(col(m), likes, diff).toFixed(2).padStart(18)}`);
}
