// The technique solver against what Puzzle Square JP's players did, on the Sudokus kept locally
// (references/psjp, never published): Spearman correlations of each measure with the site's 1–5
// difficulty, its solver count and likes per solver; rows to references/psjp/techniques-sudoku.csv.
//
//   node puzzles/difficulty/sudoku/psjp-run.ts
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fromSpec } from "./grid.ts";
import { rate } from "./solve.ts";
import { spearman } from "../calibrate.ts";

const root = new URL("../../../references/psjp/", import.meta.url).pathname;
const data = JSON.parse(readFileSync(`${root}data.json`, "utf8")) as Record<string, { favorite_n: number; answered_n: number; difficulty: number }>;
const rows: Record<string, number | string>[] = [];
for (const f of readdirSync(`${root}sudoku`).filter((x) => x.endsWith(".json"))) {
  const d = JSON.parse(readFileSync(`${root}sudoku/${f}`, "utf8")), meta = data[d.source?.psjp];
  if (!meta?.answered_n) continue;
  try {
    const { profile: p } = rate(fromSpec({ ...d.grid, genre: "sudoku" }));
    rows.push({ id: d.source.psjp, n: p.n, siteDifficulty: meta.difficulty, solvers: meta.answered_n, perSolver: meta.favorite_n / meta.answered_n,
      se: p.se, effort: Math.log(p.effort), steps: p.steps, depStart: p.dependency.start, depMean: p.dependency.mean, trials: p.trials, refutation: p.refutation,
      techniques: Object.keys(p.byTechnique).length, estimate: p.estimate, hardest: p.hardest, solved: p.solved ? 1 : 0 });
  } catch (e) { process.stderr.write(`${f}: ${(e as Error).message}\n`); }
}
const cols = Object.keys(rows[0]);
writeFileSync(`${root}techniques-sudoku.csv`, [cols.join(","), ...rows.map((r) => cols.map((c) => r[c]).join(","))].join("\n"));
console.log(`${rows.length} Sudokus; sizes ${[...new Set(rows.map((r) => r.n))].join(", ")}; hardest techniques: ${Object.entries(rows.reduce((a, r) => ({ ...a, [r.hardest as string]: ((a as Record<string, number>)[r.hardest as string] ?? 0) + 1 }), {} as Record<string, number>)).map(([k, v]) => `${k} ${v}`).join(", ")}`);
console.log(`${"measure".padEnd(11)} ${"site diff.".padStart(10)} ${"solvers".padStart(8)} ${"likes/solver".padStart(12)}`);
for (const m of ["se", "effort", "steps", "depStart", "depMean", "trials", "refutation", "techniques", "estimate"]) {
  const xs = rows.map((r) => Number(r[m])), f = (k: string) => spearman(xs, rows.map((r) => Number(r[k]))).toFixed(2);
  console.log(`${m.padEnd(11)} ${f("siteDifficulty").padStart(10)} ${f("solvers").padStart(8)} ${f("perSolver").padStart(12)}`);
}
