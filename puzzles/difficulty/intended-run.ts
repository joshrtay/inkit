// The intended-path test (docs/research-state.md): on Puzzle Square JP's puzzles kept locally (the
// rated set, references/psjp/<type>/, and the ones read from links, references/psjp-links/<type>.jsonl;
// never published), each puzzle solved twice: the usual way (cheapest steps each round, case splits
// when stuck: interest.ts's measures, prefixed g_) and along the min-peak path with no case split
// (deduce.ts's Options.minPeak: intended.ts's features), set against likes per solver and the
// site's difficulty. The rows go to references/psjp/intended-<type>.csv, rewritten after every
// puzzle; a rerun skips the puzzles already there. intended-analyze.ts reads them.
//
//   DEDUCE_JOBS=3 node puzzles/difficulty/intended-run.ts <type> [max] [budgetMs] [capMs]
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { deduceGuarded } from "./deduce-guarded.ts";
import { interestOf } from "./interest.ts";
import { intendedOf } from "./intended.ts";
import { mapPool } from "./pool.ts";

const refs = new URL("../../references/", import.meta.url).pathname;
const [type, maxArg, budgetArg, capArg] = process.argv.slice(2);
const max = Number(maxArg) || Infinity, budgetMs = Number(budgetArg) || 30000, capMs = Number(capArg) || 120000;
const data = JSON.parse(readFileSync(`${refs}psjp/data.json`, "utf8")) as Record<string, { favorite_n: number; answered_n: number; difficulty: number; user: number }>;

interface Item { id: string; set: "rated" | "links"; grid: any; likes: number; solvers: number; difficulty: number; user: number }
const items: Item[] = [];
if (existsSync(`${refs}psjp/${type}`)) for (const f of readdirSync(`${refs}psjp/${type}`).filter((f) => f.endsWith(".json"))) {
  const d = JSON.parse(readFileSync(`${refs}psjp/${type}/${f}`, "utf8")), m = data[d.source?.psjp];
  if (m?.answered_n) items.push({ id: d.source.psjp, set: "rated", grid: { ...d.grid, genre: d.grid.genre ?? type }, likes: m.favorite_n, solvers: m.answered_n, difficulty: m.difficulty, user: m.user });
}
if (existsSync(`${refs}psjp-links/${type}.jsonl`)) for (const l of readFileSync(`${refs}psjp-links/${type}.jsonl`, "utf8").split("\n")) {
  if (!l.trim()) continue;
  const d = JSON.parse(l);
  if (d.answered_n) items.push({ id: d.id, set: "links", grid: { ...d.spec, genre: d.spec.genre ?? d.genre }, likes: d.favorite_n, solvers: d.answered_n, difficulty: d.difficulty, user: d.user });
}

const out = `${refs}psjp/intended-${type}.csv`;
const rows: Record<string, unknown>[] = [];
if (existsSync(out)) {
  const [head, ...lines] = readFileSync(out, "utf8").trim().split("\n");
  const cols = head.split(",");
  for (const l of lines) rows.push(Object.fromEntries(l.split(",").map((v, i) => [cols[i], v])));
}
const done = new Set(rows.map((r) => `${r.set}:${r.id}`));
const todo = items.filter((it) => !done.has(`${it.set}:${it.id}`)).slice(0, max);
const save = () => {
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  writeFileSync(out, [cols.join(","), ...rows.map((r) => cols.map((c) => r[c] ?? "").join(","))].join("\n") + "\n");
};
const prefix = (p: string, o: object) => Object.fromEntries(Object.entries(o).map(([k, v]) => [`${p}${k}`, v]));
console.error(`${type}: ${items.length} puzzles with solvers, ${todo.length} to run`);

let n = 0;
await mapPool(todo, async (it) => {
  const t0 = Date.now();
  let what = "";
  const row: Record<string, unknown> = { id: it.id, set: it.set, user: it.user, likes: it.likes, solvers: it.solvers, perSolver: +(it.likes / it.solvers).toFixed(4), siteDifficulty: it.difficulty };
  try {
    const g = await deduceGuarded(it.grid, { budgetMs: budgetMs / 2 }, capMs);
    if (g) {
      Object.assign(row, prefix("g_", interestOf(g.path, g.profile)), prefix("g_", { peak: intendedOf(g.path, g.profile).peak, noSplit: intendedOf(g.path, g.profile).noSplit }));
      what += `usual ${g.profile.solved ? `peak ${g.profile.maxCost}` : "unsolved"}`;
    } else what += "usual: cap";
    const t1 = Date.now();
    const m = await deduceGuarded(it.grid, { budgetMs, minPeak: true, maxTier: 1 }, capMs);
    if (m) {
      Object.assign(row, { solved: m.profile.solved, outOfTime: m.profile.notes.some((x) => x.startsWith("out of time")) ? 1 : 0 }, intendedOf(m.path, m.profile, m.usage), { estimate: m.profile.estimate, ruleLoad: m.profile.ruleLoad, ms: Date.now() - t1 });
      what += `; min-peak ${m.profile.solved ? `peak ${row.peak}` : m.profile.notes.at(-1)}`;
    } else { Object.assign(row, { solved: false, outOfTime: 1 }); what += "; min-peak: cap"; }
  } catch (e) { what += ` failed: ${(e as Error).message.slice(0, 100)}`; row.error = 1; }
  rows.push(row);
  save();
  console.error(`${++n}/${todo.length} ${it.set}/${it.id} ${Math.round((Date.now() - t0) / 100) / 10} s: ${what}`);
});
