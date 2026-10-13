// Labelled puzzles for pricing steps (price.py): each puzzle solved with every technique the
// solver has (the component lemma and clue reach on, so their steps are priced too), its steps'
// costs and type-free features (deduce.ts Step.feat), and a label from someone who knows how hard
// it is:
//   tatham         Simon Tatham's grade (his solvers grade by the deductions a puzzle needs)
//   sudoku-se      our technique solver's Sudoku Explainer-style rating (the community's scale)
//   psjp           Puzzle Square JP's 1–5 rating (local only)
//   beast-academy  the Puzzle Lab tier (local only)
// Puzzles are compared only within a group (source, type and size). → references/ml/price-data.jsonl
//
//   node puzzles/difficulty/price-data.ts [perGroup]
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { GridSpec } from "../../src/engine/types.ts";
import { convert, GENRE, loadSets, ORDER } from "./ba-convert.ts";
import { REACH_FAMILY } from "./deduce.ts";
import { deduceGuarded } from "./deduce-guarded.ts";
import { mapPool } from "./pool.ts";
import { fromSpec } from "./sudoku/grid.ts";
import { rate } from "./sudoku/solve.ts";
import { fromTatham, TATHAM } from "./tatham.ts";

const repo = new URL("../../", import.meta.url).pathname;
const per = Number(process.argv[2]) || 15;
type Job = { source: string; group: string; genre: string; name: string; label: number; spec: GridSpec };
const jobs: Job[] = [];

// Tatham: a group per game and size, the grade's rank as the label
const tdir = `${repo}references/tatham/puzzles/`;
if (existsSync(tdir)) for (const f of readdirSync(tdir).filter((x) => x.endsWith(".txt")).sort()) {
  const game = f.split("-")[0];
  if (!TATHAM[game]) continue;
  for (const id of readFileSync(tdir + f, "utf8").trim().split("\n").slice(0, per)) {
    const r = fromTatham(game, id);
    if (!r) continue;
    const grade = TATHAM[game].grades.indexOf(r.grade);
    if (grade >= 0) jobs.push({ source: "tatham", group: `tatham ${game} ${r.spec.size.join("x")}`, genre: r.spec.genre!, name: `${f} ${id.slice(0, 30)}`, label: grade, spec: r.spec });
  }
}
// Puzzle Square JP: a group per type; Sudokus also labelled by the technique solver
const pdir = `${repo}references/psjp/`;
if (existsSync(`${pdir}data.json`)) {
  const data = JSON.parse(readFileSync(`${pdir}data.json`, "utf8")) as Record<string, { difficulty: number }>;
  for (const type of readdirSync(pdir).filter((t) => !t.includes(".") && t !== "scripts").sort()) {
    const files = readdirSync(`${pdir}${type}`).filter((f) => /^\d+\.json$/.test(f)).sort((a, b) => parseInt(a) - parseInt(b));
    const step = Math.max(1, Math.floor(files.length / (per * 2)));
    for (const f of files.filter((_, i) => i % step === 0).slice(0, per * 2)) {
      const d = JSON.parse(readFileSync(`${pdir}${type}/${f}`, "utf8"));
      const rated = data[d.source?.psjp]?.difficulty;
      const spec: GridSpec = { ...d.grid, genre: d.grid.genre ?? type };
      if (spec.size[0] > 10) continue;
      if (rated) jobs.push({ source: "psjp", group: `psjp ${type}`, genre: spec.genre!, name: f, label: rated, spec });
      if (type === "sudoku" && spec.size[0] === 9) {
        const se = rate(fromSpec(spec), {}).profile;
        if (se.solved) jobs.push({ source: "sudoku-se", group: "sudoku-se", genre: "sudoku", name: f, label: se.se, spec });
      }
    }
  }
}
// Beast Academy: a group per type, the tier as the label
for (const set of loadSets()) {
  const order = ORDER[set.t]?.find(([n]) => n === set.s);
  if (!order) continue;
  set.p.forEach((c, k) => jobs.push({ source: "beast-academy", group: `ba ${GENRE[set.t]}`, genre: GENRE[set.t], name: `${set.s} ${k + 1}`, label: order[1], spec: convert(set.t, c) as GridSpec }));
}
console.error(`${jobs.length} labelled puzzles in ${new Set(jobs.map((j) => j.group)).size} groups`);

// every technique on, so all steps are priced: the component lemma (DEDUCE_LEMMAS) and clue reach
process.env.DEDUCE_LEMMAS = "component";
let done = 0;
const rows = await mapPool(jobs, async (j) => {
  const r = await deduceGuarded(j.spec, { budgetMs: 30000, families: [REACH_FAMILY] }, 120000).catch(() => null);
  if (++done % 50 === 0) console.error(`${done}/${jobs.length}`);
  if (!r || !r.profile.solved) return null;
  const steps = r.path.filter((s) => !s.choice).map((s) => ({ cost: s.cost, feat: s.feat ?? {} }));
  return JSON.stringify({ ...j, spec: undefined, estimate: r.profile.estimate, ruleLoad: r.profile.ruleLoad, steps });
});
writeFileSync(`${repo}references/ml/price-data.jsonl`, rows.filter(Boolean).join("\n") + "\n");
console.log(`${rows.filter(Boolean).length} of ${jobs.length} solved and saved`);
