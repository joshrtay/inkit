// The interestingness experiment on Puzzle Square JP's puzzles kept locally (references/psjp, never
// published): for each puzzle, the measures in interest.ts, set against what its players did:
// likes per solver (a quality signal), solvers, and the site's 1–5 difficulty. Prints Spearman
// correlations per type; writes each type's rows to references/psjp/interest-<type>.csv.
//
//   node puzzles/difficulty/interest-run.ts <type> [max] [budgetMs]
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { deduce } from "./deduce.ts";
import { interestOf, type Interest } from "./interest.ts";
import { spearman } from "./calibrate.ts";

const root = new URL("../../references/psjp/", import.meta.url).pathname;
const [type, maxArg, budgetArg] = process.argv.slice(2);
const max = Number(maxArg) || Infinity, budgetMs = Number(budgetArg) || 15000;
const data = JSON.parse(readFileSync(`${root}data.json`, "utf8")) as Record<string, { favorite_n: number; answered_n: number; difficulty: number }>;
const files = readdirSync(`${root}${type}`).filter((f) => f.endsWith(".json")).slice(0, max);

type Row = Interest & { id: string; likes: number; solvers: number; perSolver: number; siteDifficulty: number; ms: number };
const rows: Row[] = [];
for (const f of files) {
  const d = JSON.parse(readFileSync(`${root}${type}/${f}`, "utf8"));
  const meta = data[d.source?.psjp];
  if (!meta || !meta.answered_n) continue;
  const t0 = Date.now();
  try {
    const { path, profile } = await deduce({ ...d.grid, genre: d.grid.genre ?? type }, { budgetMs });
    rows.push({ id: d.source.psjp, likes: meta.favorite_n, solvers: meta.answered_n, perSolver: meta.favorite_n / meta.answered_n, siteDifficulty: meta.difficulty, ms: Date.now() - t0, ...interestOf(path, profile) });
    process.stderr.write(".");
  } catch (e) { process.stderr.write("x"); }
}
process.stderr.write("\n");
const cols = Object.keys(rows[0] ?? {}) as (keyof Row)[];
writeFileSync(`${root}interest-${type}.csv`, [cols.join(","), ...rows.map((r) => cols.map((c) => r[c]).join(","))].join("\n"));

const solved = rows.filter((r) => r.solved);
const measures: (keyof Interest)[] = ["estimate", "steps", "busywork", "hardShare", "stuck", "breakIn", "keyAt", "keyCost", "flowMean", "flowSpread", "oneWay", "aimless", "theme", "variety", "ruleLoad"];
console.log(`${type}: ${rows.length} puzzles (${solved.length} solved), ${Math.round(rows.reduce((a, r) => a + r.ms, 0) / 1000)} s`);
console.log(`${"measure".padEnd(11)} ${"likes/solver".padStart(12)} ${"solvers".padStart(8)} ${"site diff.".padStart(10)}`);
for (const m of measures) {
  const xs = solved.map((r) => Number(r[m]));
  const f = (ys: number[]) => spearman(xs, ys).toFixed(2).padStart(6);
  console.log(`${m.padEnd(11)} ${f(solved.map((r) => r.perSolver)).padStart(12)} ${f(solved.map((r) => r.solvers)).padStart(8)} ${f(solved.map((r) => r.siteDifficulty)).padStart(10)}`);
}
