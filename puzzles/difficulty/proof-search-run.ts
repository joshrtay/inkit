// Phase 0 of docs/research-trajectory.md: does greedy differ from the cheapest proof? On Puzzle
// Square JP's puzzles kept locally (the rated set, references/psjp/<type>/, and the ones read from
// links, references/psjp-links/<type>.jsonl; never published), a seeded sample per type, each
// solved by deduce.ts's best-first proof search (Options.search): the greedy path, the
// cheapest-only path (optimal for the max) and the best proof by the sum found within the node
// budget. Rows go to references/psjp/proofsearch-<type>.csv, rewritten after every puzzle; a rerun
// skips the puzzles already there. proof-search-analyze.ts reads them.
//
//   DEDUCE_JOBS=3 node puzzles/difficulty/proof-search-run.ts <type> [sample] [nodes] [budgetMs] [capMs]
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { deduceGuarded } from "./deduce-guarded.ts";
import { mapPool } from "./pool.ts";

const refs = new URL("../../references/", import.meta.url).pathname;
const [type, sampleArg, nodesArg, budgetArg, capArg] = process.argv.slice(2);
const sample = Number(sampleArg) || 60, nodes = Number(nodesArg) || 200, budgetMs = Number(budgetArg) || 240000, capMs = Number(capArg) || 420000;
const data = JSON.parse(readFileSync(`${refs}psjp/data.json`, "utf8")) as Record<string, { favorite_n: number; answered_n: number; difficulty: number; user: number }>;

interface Item { id: string; set: "rated" | "links"; grid: any; likes: number; solvers: number; difficulty: number; user: number }
const items: Item[] = [];
if (existsSync(`${refs}psjp/${type}`)) for (const f of readdirSync(`${refs}psjp/${type}`).filter((f) => f.endsWith(".json")).sort()) {
  const d = JSON.parse(readFileSync(`${refs}psjp/${type}/${f}`, "utf8")), m = data[d.source?.psjp];
  if (m?.answered_n) items.push({ id: d.source.psjp, set: "rated", grid: { ...d.grid, genre: d.grid.genre ?? type }, likes: m.favorite_n, solvers: m.answered_n, difficulty: m.difficulty, user: m.user });
}
if (existsSync(`${refs}psjp-links/${type}.jsonl`)) for (const l of readFileSync(`${refs}psjp-links/${type}.jsonl`, "utf8").split("\n")) {
  if (!l.trim()) continue;
  const d = JSON.parse(l);
  if (d.answered_n) items.push({ id: d.id, set: "links", grid: { ...d.spec, genre: d.spec.genre ?? d.genre }, likes: d.favorite_n, solvers: d.answered_n, difficulty: d.difficulty, user: d.user });
}
// a fixed sample: the items in a seeded shuffle
let seed = 20261015;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
const chosen = items.slice(0, sample);

const out = `${refs}psjp/proofsearch-${type}.csv`;
const rows: Record<string, unknown>[] = [];
if (existsSync(out)) {
  const [head, ...lines] = readFileSync(out, "utf8").trim().split("\n");
  const cols = head.split(",");
  for (const l of lines) rows.push(Object.fromEntries(l.split(",").map((v, i) => [cols[i], v])));
}
const done = new Set(rows.map((r) => `${r.set}:${r.id}`));
const todo = chosen.filter((it) => !done.has(`${it.set}:${it.id}`));
const save = () => {
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  writeFileSync(out, [cols.join(","), ...rows.map((r) => cols.map((c) => r[c] ?? "").join(","))].join("\n") + "\n");
};
console.error(`${type}: ${items.length} puzzles with solvers, sample ${chosen.length}, ${todo.length} to run`);

interface PStep { cost: number; where: string; facts: string[] }
/** each fact's share of its step's cost, along a path */
const perFact = (path: PStep[]) => {
  const m = new Map<string, number>();
  for (const s of path) for (const f of s.facts) m.set(f, s.cost / s.facts.length);
  return m;
};
/** how two paths differ: the share of the greedy path's steps (by what they decide and where)
 *  not in the other; how far into the greedy path the first difference comes (0 start, 1 end);
 *  and where the saving falls, by each fact's position in the greedy path (0 start, 1 end) */
const compare = (g: PStep[], b: PStep[]) => {
  const key = (s: PStep) => `${s.where}|${[...s.facts].sort().join(" ")}`;
  const bk = new Set(b.map(key));
  const differ = g.filter((s) => !bk.has(key(s))).length / Math.max(1, g.length);
  const seq = (p: PStep[]) => p.map((s) => [...s.facts].sort().join(" "));
  const gs = seq(g), bs = seq(b);
  let i = 0;
  while (i < gs.length && i < bs.length && gs[i] === bs[i]) i++;
  const gf = perFact(g), bf = perFact(b), order = g.flatMap((s) => s.facts);
  let w = 0, ws = 0;
  order.forEach((f, k) => { const d = (gf.get(f) ?? 0) - (bf.get(f) ?? 0); if (d > 0) { w += d * k / Math.max(1, order.length - 1); ws += d; } });
  return { differ: +differ.toFixed(3), firstDiff: +(i / Math.max(1, gs.length)).toFixed(3), savingAt: ws ? +(w / ws).toFixed(3) : "" };
};

let n = 0;
await mapPool(todo, async (it) => {
  const t0 = Date.now();
  const row: Record<string, unknown> = { id: it.id, set: it.set, user: it.user, likes: it.likes, solvers: it.solvers, perSolver: +(it.likes / it.solvers).toFixed(4), siteDifficulty: it.difficulty, cells: (it.grid.rows ?? 0) * (it.grid.cols ?? 0) };
  let what = "";
  try {
    const r = await deduceGuarded(it.grid, { budgetMs, maxTier: 2, search: { nodes } }, capMs);
    if (!r) { row.cap = 1; what = "cap"; }
    else {
      const s = r.search as any;
      Object.assign(row, { solved: r.profile.solved ? 1 : 0, expanded: s.expanded, exhausted: s.exhausted ? 1 : 0, outOfBudget: s.outOfBudget ? 1 : 0, improvedAt: s.improvedAt, ms: Date.now() - t0 });
      for (const k of ["greedy", "cheapest", "best"]) if (s[k]) for (const [f, v] of Object.entries(s[k])) row[`${k}_${f}`] = v;
      const best: PStep[] = r.path.map((x) => ({ cost: x.cost, where: x.where, facts: x.facts.map((f) => f.mark) }));
      if (s.greedyPath && r.profile.solved) {
        for (const [f, v] of Object.entries(compare(s.greedyPath, best))) row[`best_${f}`] = v;
        if (s.cheapestPath) for (const [f, v] of Object.entries(compare(s.greedyPath, s.cheapestPath))) row[`cheapest_${f}`] = v;
        row.splits = r.path.filter((x) => x.tier >= 2).length;
      }
      what = s.greedy ? `greedy ${s.greedy.sum}/${s.greedy.peak}, cheapest ${s.cheapest?.sum}/${s.cheapest?.peak}, best ${s.best?.sum} (${s.expanded} nodes${s.exhausted ? ", exhausted" : ""})` : `unsolved: ${r.profile.notes.at(-1)}`;
    }
  } catch (e) { what = `failed: ${(e as Error).message.slice(0, 100)}`; row.error = 1; }
  rows.push(row);
  save();
  console.error(`${++n}/${todo.length} ${it.set}/${it.id} ${Math.round((Date.now() - t0) / 100) / 10} s: ${what}`);
});
