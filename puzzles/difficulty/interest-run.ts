// The interestingness experiment on Puzzle Square JP's puzzles kept locally (references/psjp, never
// published): for each puzzle, the measures in interest.ts, set against what its players did:
// likes per solver (a quality signal), solvers, and the site's 1–5 difficulty. Prints Spearman
// correlations per type; writes each type's rows to references/psjp/interest-<type>.csv.
//
// Each puzzle runs under a hard cap (deduce-guarded.ts, two minutes by default), prints a line, and
// the CSV is rewritten after every puzzle, so a long run can be watched and stopped without loss.
//
//   node puzzles/difficulty/interest-run.ts <type> [max] [budgetMs] [capMs]
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { deduceGuarded } from "./deduce-guarded.ts";
import { mapPool } from "./pool.ts";
import { interestOf, type Interest } from "./interest.ts";
import { spearman } from "./calibrate.ts";

const root = new URL("../../references/psjp/", import.meta.url).pathname;
const [type, maxArg, budgetArg, capArg] = process.argv.slice(2);
const max = Number(maxArg) || Infinity, budgetMs = Number(budgetArg) || 15000, capMs = Number(capArg) || 120000;
const data = JSON.parse(readFileSync(`${root}data.json`, "utf8")) as Record<string, { favorite_n: number; answered_n: number; difficulty: number }>;
const files = readdirSync(`${root}${type}`).filter((f) => f.endsWith(".json")).slice(0, max);

type Row = Interest & { id: string; likes: number; solvers: number; perSolver: number; siteDifficulty: number; ms: number };
const rows: Row[] = [];
const save = () => {
  const cols = Object.keys(rows[0] ?? {}) as (keyof Row)[];
  // a run cut short by max writes beside the full results, never over them
  writeFileSync(`${root}interest-${type}${Number.isFinite(max) ? "-sample" : ""}.csv`, [cols.join(","), ...rows.map((r) => cols.map((c) => r[c]).join(","))].join("\n"));
};
let done = 0;
await mapPool(files, async (f) => {
  const d = JSON.parse(readFileSync(`${root}${type}/${f}`, "utf8"));
  const meta = data[d.source?.psjp];
  if (!meta || !meta.answered_n) { done++; return; }
  const t0 = Date.now();
  let what: string;
  try {
    const r = await deduceGuarded({ ...d.grid, genre: d.grid.genre ?? type }, { budgetMs }, capMs);
    if (r) {
      rows.push({ id: d.source.psjp, likes: meta.favorite_n, solvers: meta.answered_n, perSolver: meta.favorite_n / meta.answered_n, siteDifficulty: meta.difficulty, ms: Date.now() - t0, ...interestOf(r.path, r.profile) });
      save();
      what = r.profile.solved ? `estimate ${r.profile.estimate}` : `unsolved (${r.profile.notes.join("; ")})`;
    } else what = `stopped at the ${capMs / 1000} s cap`;
  } catch (e) { what = `failed: ${(e as Error).message.slice(0, 100)}`; }
  console.error(`${++done}/${files.length} ${f} ${Math.round((Date.now() - t0) / 100) / 10} s: ${what}`);
});

const solved = rows.filter((r) => r.solved);
const measures: (keyof Interest)[] = ["estimate", "steps", "busywork", "hardShare", "stuck", "breakIn", "keyAt", "keyCost", "flowMean", "flowSpread", "oneWay", "aimless", "theme", "variety", "ruleLoad"];
console.log(`${type}: ${rows.length} puzzles (${solved.length} solved), ${Math.round(rows.reduce((a, r) => a + r.ms, 0) / 1000)} s`);
console.log(`${"measure".padEnd(11)} ${"likes/solver".padStart(12)} ${"solvers".padStart(8)} ${"site diff.".padStart(10)}`);
for (const m of measures) {
  const xs = solved.map((r) => Number(r[m]));
  const f = (ys: number[]) => spearman(xs, ys).toFixed(2).padStart(6);
  console.log(`${m.padEnd(11)} ${f(solved.map((r) => r.perSolver)).padStart(12)} ${f(solved.map((r) => r.solvers)).padStart(8)} ${f(solved.map((r) => r.siteDifficulty)).padStart(10)}`);
}
